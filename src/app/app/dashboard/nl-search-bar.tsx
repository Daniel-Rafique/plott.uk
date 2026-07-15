"use client";

/**
 * Natural-language search bar. Now dual-purpose:
 *
 *   - Submitting a prompt always calls the streaming `/api/ai/deep-search`
 *     endpoint. That endpoint parses filters, geocodes any place name into a
 *     viewport the client can pan the map to, searches Planning Data, and
 *     optionally escalates to an agent path (Companies House / web / LPA
 *     enrichment + fuzzy applicant match) when the prompt implies a company
 *     or person or the fast path returned nothing.
 *
 *   - The "Search this area" button on the map still runs a direct PlanWire
 *     bbox query. The Explore filter tags and dates call the same
 *     `/api/ai/deep-search` stream with a pre-parsed `filters` body (see
 *     `consumeDeepSearchStream` in `lib/ai/deep-search-stream.ts`).
 *
 * Events stream as NDJSON; we parse frame-by-frame and fan them out to the
 * host via callbacks so the dashboard can pan the map, apply chips, render
 * results, and show a live status line below the input without the host
 * knowing about the transport.
 */

import { useCallback, useRef, useState, type FormEvent } from "react";
import { Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import posthog from "posthog-js";
import type { PlanningApplicationEntity } from "@/lib/planning-data";
import type { Bounds } from "./map-canvas";
import { WaveformLoader } from "@/components/ui/loading-indicators";
import { consumeDeepSearchStream } from "@/lib/ai/deep-search-stream";

export type NlFilterResult = {
  statuses: string[];
  applicationTypes: string[];
  developmentTypes: string[];
  decisionFrom: string | null;
  decisionTo: string | null;
  indexedSinceYear: number | null;
  locationHint: string | null;
  applicantLike: string | null;
  keywords: string[];
  summary: string;
};

export type NlFilterChip = {
  label: string;
  onRemove: () => void;
};

export type NlSearchBarProps = {
  onParsed: (filters: NlFilterResult) => void;
  onViewport: (bounds: Bounds, place: string | null) => void;
  onResults: (
    entities: PlanningApplicationEntity[],
    meta: { total: number; mode: "fast" | "agent" },
  ) => void;
  /**
   * Called when a deep-search stream begins (including the agent retry). The
   * host uses this to block any effect-driven `runSearch` calls that would
   * otherwise race against the stream's own viewport/results events.
   */
  onStreamStart?: () => void;
  /** Called when the stream (including any retry) fully completes. */
  onStreamEnd?: () => void;
  /** Provide the current map bounds for prompts without a location hint. */
  getCurrentBounds: () => Bounds | null;
  chips: NlFilterChip[];
  className?: string;
};

type VagueHint = {
  message: string;
  suggestions: string[];
};

export function NlSearchBar({
  onParsed,
  onViewport,
  onResults,
  onStreamStart,
  onStreamEnd,
  getCurrentBounds,
  chips,
  className,
}: NlSearchBarProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const [vagueHint, setVagueHint] = useState<VagueHint | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runDeepSearch = useCallback(
    async (
      promptText: string,
      opts: { forceAgent?: boolean } = {},
    ): Promise<{
      lastError: string | null;
      resultsMeta: { total: number; mode: "fast" | "agent" } | null;
    }> => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const { lastError, resultsMeta, httpError } = await consumeDeepSearchStream(
        {
          prompt: promptText,
          currentBounds: getCurrentBounds(),
          forceAgent: opts.forceAgent ?? false,
        },
        {
          onParsed: (f) => {
            onParsed(f);
            posthog.capture("deep_search_parsed", {
              summary: f.summary,
              has_location_hint: Boolean(f.locationHint),
              has_applicant_like: Boolean(f.applicantLike),
              statuses: f.statuses.length,
              keywords: f.keywords.length,
            });
          },
          onViewport: (bounds, place) => {
            onViewport(bounds, place);
            posthog.capture("deep_search_geocoded", {
              place,
              found: true,
            });
          },
          onResults,
          onStatusLine: (msg) => setStatusLine(msg),
          onHint: (hint) => {
            setVagueHint(hint);
            posthog.capture("deep_search_vague_hint", {
              suggestion_count: hint.suggestions.length,
            });
          },
        },
        { signal: ctrl.signal },
      );
      if (httpError) {
        return { lastError: httpError, resultsMeta: null };
      }
      return { lastError, resultsMeta };
    },
    [getCurrentBounds, onParsed, onResults, onViewport],
  );

  const executeSearch = useCallback(
    async (trimmed: string) => {
      if (trimmed.length < 2 || loading) return;
      setLoading(true);
      setStatusLine(null);
      setVagueHint(null);
      onStreamStart?.();
      posthog.capture("deep_search_submitted", {
        prompt_length: trimmed.length,
      });
      try {
        const first = await runDeepSearch(trimmed);
        if (first.lastError && !first.resultsMeta) {
          toast.error(first.lastError);
        } else if (
          first.resultsMeta &&
          first.resultsMeta.mode === "fast" &&
          first.resultsMeta.total === 0
        ) {
          // If the server already explained WHY we got nothing (e.g. the area
          // isn't indexed upstream, or a filter is too strict), show it and
          // skip the agent retry — the agent can't conjure records that the
          // upstream dataset doesn't have.
          if (first.lastError) {
            toast.info(first.lastError, { duration: 8000 });
          } else {
            setStatusLine(
              "Nothing obvious here — asking the agent to dig deeper…",
            );
            posthog.capture("deep_search_agent_retry", { prompt: trimmed });
            const retry = await runDeepSearch(trimmed, { forceAgent: true });
            if (retry.lastError && !retry.resultsMeta) {
              toast.error(retry.lastError);
            } else if (
              retry.resultsMeta &&
              retry.resultsMeta.total === 0 &&
              retry.lastError
            ) {
              toast.info(retry.lastError, { duration: 8000 });
            }
          }
        }
        setPrompt("");
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          toast.error(err instanceof Error ? err.message : "Search failed");
        }
      } finally {
        setLoading(false);
        setStatusLine(null);
        abortRef.current = null;
        onStreamEnd?.();
      }
    },
    [loading, onStreamEnd, onStreamStart, runDeepSearch],
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await executeSearch(prompt.trim());
  };

  const runSuggestion = async (suggestion: string) => {
    if (loading) return;
    posthog.capture("deep_search_vague_suggestion_clicked", {
      suggestion,
    });
    setPrompt(suggestion);
    await executeSearch(suggestion);
  };

  return (
    <div className={cn("space-y-2", className)}>
      <form onSubmit={submit} className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-indigo-500">
          <Sparkles className="h-4 w-4" aria-hidden />
        </div>
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder='e.g. "Approved residential extensions in Brixton since 2023" or "Projects by Argent in Camden"'
          className="w-full rounded-lg border border-zinc-300 bg-white py-2 pl-9 pr-24 text-sm placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          aria-label="Describe what you're looking for"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || prompt.trim().length < 2}
          className="absolute inset-y-1 right-1 flex items-center gap-1 rounded-md bg-zinc-900 px-3 text-xs font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <WaveformLoader tone="inverse" /> : "Search"}
        </button>
      </form>
      {statusLine && loading ? (
        <p className="flex items-center gap-2 text-[11px] italic text-zinc-500">
          <WaveformLoader tone="ai" />
          {statusLine}
        </p>
      ) : null}
      {vagueHint && !loading ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-2.5 py-2">
          <p className="text-[11px] leading-snug text-amber-900/90">
            {vagueHint.message}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {vagueHint.suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => void runSuggestion(suggestion)}
                className="rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-medium text-amber-950 transition-colors hover:bg-amber-100"
                title={`Search for "${suggestion}"`}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip, i) => (
            <button
              key={`${chip.label}-${i}`}
              type="button"
              onClick={chip.onRemove}
              className="group inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-800 transition-colors hover:bg-indigo-100"
              title={`Remove "${chip.label}"`}
            >
              {chip.label}
              <X className="h-3 w-3 opacity-60 group-hover:opacity-100" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
