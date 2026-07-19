"use client";

/**
 * Applicant/agent research briefing card. Renders the cached briefing from
 * `/api/ai/research` and exposes a "refresh" button (bypasses the 30-day
 * cache at the cost of one extra agent run).
 *
 * Designed to be dropped inside modals/panels; it does not include a heading
 * so the host component controls framing.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Sparkles,
  RefreshCw,
  ExternalLink,
  Building2,
  Users,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PulseIndicator,
  WaveformLoader,
} from "./ui/loading-indicators";
import { Callout } from "./ui/callout";
import { ConfidenceTooltip } from "./confidence-tooltip";

type Briefing = {
  summary: string;
  entityType: "individual" | "company" | "unknown";
  companyNumber: string | null;
  website: string | null;
  position?: string | null;
  seniority?: string | null;
  employer?: string | null;
  linkedin?: string | null;
  keyPeople: string[];
  recentActivity: string[];
  riskFlags: string[];
  citations: string[];
  confidence: "low" | "medium" | "high";
};

type Result = {
  briefing: Briefing;
  displayName: string;
  cached: boolean;
  fetchedAt: string;
  expiresAt: string;
};

export function ResearchBriefingCard({
  displayName,
  hint,
  email,
  autoLoad = false,
  className,
}: {
  displayName: string | null | undefined;
  hint?: string;
  /** Known email — forwarded to research for Hunter Person Enrichment. */
  email?: string | null;
  /** If true, fetch on mount. Otherwise show a "Run research" button. */
  autoLoad?: boolean;
  className?: string;
}) {
  const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBriefing = useCallback(
    async (force: boolean) => {
      if (!displayName) return;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ name: displayName });
        if (hint) params.set("hint", hint);
        if (email?.trim()) params.set("email", email.trim());
        if (force) params.set("refresh", "1");
        const res = await fetch(`/api/ai/research?${params.toString()}`);
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error ?? "Research failed");
        }
        setData(json as Result);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    },
    [displayName, hint, email],
  );

  useEffect(() => {
    if (autoLoad) queueMicrotask(() => void fetchBriefing(false));
  }, [autoLoad, fetchBriefing]);

  if (!displayName) return null;

  if (!data && !loading && !error) {
    return (
      <button
        type="button"
        onClick={() => void fetchBriefing(false)}
        className={cn(
          "inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-800 hover:bg-indigo-100",
          className,
        )}
      >
        <Sparkles className="h-3.5 w-3.5" />
        Research &ldquo;{displayName}&rdquo;
      </button>
    );
  }

  return (
    <div
      className={cn(
        "space-y-3 rounded-lg border border-indigo-100 bg-indigo-50/30 p-3 text-sm",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-indigo-800">
          <Sparkles className="h-3.5 w-3.5" />
          AI briefing: {displayName}
        </div>
        <button
          type="button"
          onClick={() => void fetchBriefing(true)}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
          title="Refresh (bypasses 30-day cache)"
        >
          {loading ? (
            <PulseIndicator tone="ai" label="Refreshing" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          Refresh
        </button>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800">
          {error}
        </p>
      )}

      {loading && !data ? (
        <p className="flex items-center gap-2 text-xs text-zinc-600">
          <WaveformLoader tone="ai" /> Researching…
        </p>
      ) : data ? (
        <>
          <p className="leading-relaxed text-zinc-800">
            {data.briefing.summary}
          </p>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
            {data.briefing.companyNumber && (
              <span className="inline-flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                Company {data.briefing.companyNumber}
              </span>
            )}
            {(data.briefing.position || data.briefing.employer) && (
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" />
                {[data.briefing.position, data.briefing.employer]
                  .filter(Boolean)
                  .join(" · ")}
                {data.briefing.seniority
                  ? ` (${data.briefing.seniority})`
                  : ""}
              </span>
            )}
            {data.briefing.linkedin && (
              <a
                href={data.briefing.linkedin}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-indigo-700 hover:underline"
              >
                LinkedIn <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {data.briefing.website && (
              <a
                href={data.briefing.website}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-indigo-700 hover:underline"
              >
                Website <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <ConfidenceTooltip
              confidence={data.briefing.confidence}
              context="research"
              label={`${data.briefing.confidence} confidence`}
              className="editorial-chapter-label text-zinc-500"
            />
          </div>

          {data.briefing.keyPeople.length > 0 && (
            <div>
              <p className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-zinc-700">
                <Users className="h-3 w-3" /> Key people
              </p>
              <p className="text-xs text-zinc-600">
                {data.briefing.keyPeople.join(", ")}
              </p>
            </div>
          )}

          {data.briefing.recentActivity.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-zinc-700">
                Recent activity
              </p>
              <ul className="list-inside list-disc space-y-0.5 text-xs text-zinc-600">
                {data.briefing.recentActivity.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          )}

          {data.briefing.riskFlags.length > 0 && (
            <Callout variant="warning" label="Risk flags">
              <ul className="list-inside list-disc space-y-0.5">
                {data.briefing.riskFlags.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </Callout>
          )}

          {data.briefing.citations.length > 0 && (
            <details className="text-xs text-zinc-600">
              <summary className="cursor-pointer">Sources</summary>
              <ul className="mt-1 space-y-0.5 pl-2">
                {data.briefing.citations.map((c) => (
                  <li key={c}>
                    <a
                      href={c}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-700 hover:underline"
                    >
                      {c}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-400">
            <Clock className="h-3 w-3" />
            {data.cached ? "Cached" : "Fresh"} · refreshes{" "}
            {new Date(data.expiresAt).toLocaleDateString("en-GB")}
          </p>
        </>
      ) : null}
    </div>
  );
}
