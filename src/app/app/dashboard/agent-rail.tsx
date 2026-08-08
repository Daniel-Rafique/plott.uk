"use client";

/**
 * Persistent right-hand agent rail for the dashboard.
 *
 * One bottom composer routes to deep-search (map discovery) or planning Q&A
 * (focused-case follow-ups). Results sync the map and Explore drawer via host
 * callbacks — same contracts as the former NlSearchBar + PlanningQaPanel.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { PanelLeft, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import posthog from "posthog-js";
import { cn } from "@/lib/utils";
import { consumeDeepSearchStream } from "@/lib/ai/deep-search-stream";
import { shouldUsePlanningChat } from "@/lib/ai/should-use-planning-chat";
import type { PlanningApplicationEntity } from "@/lib/planning-data";
import {
  AgentComposer,
  AgentMessageList,
  StreamingSparkle,
  useChatStream,
  type AgentChatMessage,
  type PlanningQaContext,
  type QaResultPinActions,
} from "@/components/agent-chat";
import type { Bounds } from "./map-canvas";
import type { NlFilterResult } from "./nl-search-bar";

const SEARCH_SUGGESTIONS = [
  "Approved residential extensions in Brixton since 2023",
  "Refused applications near me",
  "Projects by Argent in Camden",
];

const FOCUSED_SUGGESTIONS = [
  "Summarise this application in plain English.",
  "What stage is this at and what happens next?",
  "Who is the applicant and are they a company?",
];

export type AgentRailProps = {
  onParsed: (filters: NlFilterResult) => void;
  onViewport: (bounds: Bounds, place: string | null) => void;
  onResults: (
    entities: PlanningApplicationEntity[],
    meta: { total: number; mode: "fast" | "agent" },
  ) => void;
  onStreamStart?: () => void;
  onStreamEnd?: () => void;
  getCurrentBounds: () => Bounds | null;
  /** Focused case for Q&A routing; clearable from the rail header. */
  focusedApplication?: PlanningQaContext | null;
  onClearFocus?: () => void;
  onViewApplicant?: (row: PlanningApplicationEntity) => void;
  /** Chat/search results that should also sync the map (Q&A path). */
  onChatResults?: (entities: PlanningApplicationEntity[]) => void;
  pinActions?: QaResultPinActions;
  exploreOpen: boolean;
  onToggleExplore: () => void;
  resultCount?: number;
  initialPrompt?: string;
  className?: string;
};

export function AgentRail({
  onParsed,
  onViewport,
  onResults,
  onStreamStart,
  onStreamEnd,
  getCurrentBounds,
  focusedApplication,
  onClearFocus,
  onViewApplicant,
  onChatResults,
  pinActions,
  exploreOpen,
  onToggleExplore,
  resultCount = 0,
  initialPrompt,
  className,
}: AgentRailProps) {
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const abortDeepRef = useRef<AbortController | null>(null);
  const processedInitialPromptRef = useRef<string | null>(null);

  const {
    streaming: chatStreaming,
    error: chatError,
    setError,
    sendChat,
    stop: stopChat,
  } = useChatStream({ onResults: onChatResults });

  const streaming = busy || chatStreaming;

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streaming]);

  const stop = useCallback(() => {
    abortDeepRef.current?.abort();
    abortDeepRef.current = null;
    stopChat();
    setBusy(false);
  }, [stopChat]);

  const runDeepSearch = useCallback(
    async (
      promptText: string,
      opts: { forceAgent?: boolean } = {},
    ): Promise<{
      lastError: string | null;
      resultsMeta: { total: number; mode: "fast" | "agent" } | null;
      entities: PlanningApplicationEntity[];
    }> => {
      abortDeepRef.current?.abort();
      const ctrl = new AbortController();
      abortDeepRef.current = ctrl;
      let entities: PlanningApplicationEntity[] = [];

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
          onResults: (ents, meta) => {
            entities = ents;
            onResults(ents, meta);
            setMessages((m) => {
              const copy = [...m];
              const last = copy[copy.length - 1];
              if (last?.role === "assistant") {
                copy[copy.length - 1] = {
                  ...last,
                  results: ents,
                  content:
                    last.content ||
                    (meta.total === 0
                      ? "No matching applications found."
                      : `Found ${meta.total.toLocaleString()} application${meta.total === 1 ? "" : "s"}.`),
                  statusLine: null,
                };
              }
              return copy;
            });
          },
          onStatusLine: (msg) => {
            setMessages((m) => {
              const copy = [...m];
              const last = copy[copy.length - 1];
              if (last?.role === "assistant" && !last.content) {
                copy[copy.length - 1] = { ...last, statusLine: msg };
              }
              return copy;
            });
          },
          onHint: (hint) => {
            posthog.capture("deep_search_vague_hint", {
              suggestion_count: hint.suggestions.length,
            });
            setMessages((m) => {
              const copy = [...m];
              const last = copy[copy.length - 1];
              if (last?.role === "assistant") {
                copy[copy.length - 1] = {
                  ...last,
                  content: [
                    hint.message,
                    hint.suggestions.length
                      ? `\n\nTry: ${hint.suggestions.map((s) => `“${s}”`).join(", ")}`
                      : "",
                  ].join(""),
                  statusLine: null,
                };
              }
              return copy;
            });
          },
        },
        { signal: ctrl.signal },
      );
      if (httpError) {
        return { lastError: httpError, resultsMeta: null, entities };
      }
      return { lastError, resultsMeta, entities };
    },
    [getCurrentBounds, onParsed, onResults, onViewport],
  );

  const executeDeepSearch = useCallback(
    async (trimmed: string) => {
      setBusy(true);
      setError(null);
      onStreamStart?.();
      posthog.capture("deep_search_submitted", {
        prompt_length: trimmed.length,
      });
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "", statusLine: "Searching…" },
      ]);
      try {
        const first = await runDeepSearch(trimmed);
        if (first.lastError && !first.resultsMeta) {
          toast.error(first.lastError);
          setError(first.lastError);
          setMessages((m) =>
            m.length &&
            m[m.length - 1].role === "assistant" &&
            !m[m.length - 1].content &&
            !m[m.length - 1].results?.length
              ? m.slice(0, -1)
              : m,
          );
        } else if (
          first.resultsMeta &&
          first.resultsMeta.mode === "fast" &&
          first.resultsMeta.total === 0
        ) {
          if (first.lastError) {
            toast.info(first.lastError, { duration: 8000 });
            setMessages((m) => {
              const copy = [...m];
              const last = copy[copy.length - 1];
              if (last?.role === "assistant") {
                copy[copy.length - 1] = {
                  ...last,
                  content: first.lastError!,
                  statusLine: null,
                };
              }
              return copy;
            });
          } else {
            setMessages((m) => {
              const copy = [...m];
              const last = copy[copy.length - 1];
              if (last?.role === "assistant") {
                copy[copy.length - 1] = {
                  ...last,
                  content: "",
                  statusLine:
                    "Nothing obvious here — asking the agent to dig deeper…",
                };
              }
              return copy;
            });
            posthog.capture("deep_search_agent_retry", { prompt: trimmed });
            const retry = await runDeepSearch(trimmed, { forceAgent: true });
            if (retry.lastError && !retry.resultsMeta) {
              toast.error(retry.lastError);
              setError(retry.lastError);
            } else if (
              retry.resultsMeta &&
              retry.resultsMeta.total === 0 &&
              retry.lastError
            ) {
              toast.info(retry.lastError, { duration: 8000 });
            }
          }
        }
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          const msg = err instanceof Error ? err.message : "Search failed";
          toast.error(msg);
          setError(msg);
        }
      } finally {
        setBusy(false);
        abortDeepRef.current = null;
        onStreamEnd?.();
      }
    },
    [onStreamEnd, onStreamStart, runDeepSearch, setError],
  );

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;
      if (trimmed.length < 2) return;

      const next: AgentChatMessage[] = [
        ...messages,
        { role: "user", content: trimmed },
      ];
      setMessages(next);
      setInput("");

      const useChat = shouldUsePlanningChat(
        trimmed,
        Boolean(focusedApplication?.reference || focusedApplication?.planningEntity),
      );

      if (useChat) {
        await sendChat(next, focusedApplication ?? undefined, setMessages);
        return;
      }

      await executeDeepSearch(trimmed);
    },
    [
      executeDeepSearch,
      focusedApplication,
      messages,
      sendChat,
      streaming,
    ],
  );

  useEffect(() => {
    const trimmed = initialPrompt?.trim();
    if (!trimmed || processedInitialPromptRef.current === trimmed) return;
    processedInitialPromptRef.current = trimmed;

    const url = new URL(window.location.href);
    url.searchParams.delete("q");
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );

    setMessages([{ role: "user", content: trimmed }]);
    void executeDeepSearch(trimmed);
    // Bootstrap once per distinct deep-link prompt.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deep-link bootstrap
  }, [initialPrompt]);

  const focusLabel =
    focusedApplication?.reference ||
    focusedApplication?.siteAddress ||
    null;

  return (
    <aside
      className={cn(
        "z-10 flex h-full min-h-0 w-[min(100%,400px)] shrink-0 flex-col overflow-hidden border-l border-zinc-200/80 bg-zinc-50/90 shadow-[-8px_0_24px_-12px_rgba(0,0,0,0.12)]",
        className,
      )}
      aria-label="Agent"
    >
      <header
        className={cn(
          "shrink-0 border-b border-zinc-200/70 px-3 py-2.5",
          "bg-white/70 backdrop-blur-xl backdrop-saturate-150",
          "supports-[backdrop-filter]:bg-white/55",
          "motion-reduce:bg-white motion-reduce:backdrop-filter-none",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="editorial-chapter-label mb-0.5 text-zinc-500">
              Agent
            </p>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 shrink-0 text-zinc-700" aria-hidden />
              <h2 className="truncate font-[family-name:var(--font-display)] text-[20px] font-normal leading-none tracking-tight text-zinc-950">
                Ask Plott
              </h2>
              {streaming ? (
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500">
                  <StreamingSparkle />
                  Working
                </span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onToggleExplore}
            aria-pressed={exploreOpen}
            aria-label={exploreOpen ? "Hide Explore" : "Show Explore"}
            className={cn(
              "relative inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-transform active:scale-[0.97]",
              exploreOpen
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-300 bg-white/80 text-zinc-800 hover:bg-zinc-50",
            )}
          >
            <PanelLeft className="h-3.5 w-3.5" aria-hidden />
            Explore
            {resultCount > 0 ? (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                  exploreOpen ? "bg-white/20" : "bg-zinc-100 text-zinc-700",
                )}
              >
                {resultCount > 999 ? "999+" : resultCount}
              </span>
            ) : null}
          </button>
        </div>

        {focusLabel ? (
          <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white/80 px-2 py-1.5">
            <p className="min-w-0 flex-1 truncate text-[11px] text-zinc-600">
              Focused on{" "}
              <span className="font-medium text-zinc-900">{focusLabel}</span>
            </p>
            {onClearFocus ? (
              <button
                type="button"
                onClick={onClearFocus}
                className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800"
                aria-label="Clear focused application"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : null}
          </div>
        ) : null}
      </header>

      <AgentMessageList
        messages={messages}
        streaming={streaming}
        error={chatError}
        pinActions={pinActions}
        onViewApplicant={onViewApplicant}
        scrollRef={scrollRef}
        empty={
          <div className="space-y-3 px-1 pt-2">
            <p className="text-xs leading-relaxed text-zinc-500">
              Search the map in plain English, or ask about a focused
              application. Results open in Explore and pin on the canvas.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(focusLabel ? FOCUSED_SUGGESTIONS : SEARCH_SUGGESTIONS).map(
                (s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                    className="rounded-full border border-zinc-200 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-zinc-800 transition-colors hover:bg-zinc-100"
                  >
                    {s}
                  </button>
                ),
              )}
            </div>
          </div>
        }
      />

      <AgentComposer
        value={input}
        onChange={setInput}
        onSubmit={() => void send(input)}
        onStop={stop}
        streaming={streaming}
        placeholder={
          focusLabel
            ? "Ask about this case, or start a new search…"
            : 'e.g. "Approved extensions in Brixton since 2023"'
        }
        material="glass"
      />
    </aside>
  );
}
