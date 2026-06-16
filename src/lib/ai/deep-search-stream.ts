import type { PlanningApplicationEntity } from "@/lib/planning-data";
import type { NlFilterResult } from "@/lib/ai/nl-search-parse";

/** UK map bbox; matches `Bounds` in `map-canvas.tsx`. */
export type DeepSearchBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type DeepSearchStreamEvent =
  | { type: "parsed"; filters: NlFilterResult; summary: string }
  | { type: "viewport"; bounds: DeepSearchBounds; place: string | null }
  | { type: "status"; message: string }
  | {
      type: "results";
      entities: PlanningApplicationEntity[];
      total: number;
      mode: "fast" | "agent";
    }
  | { type: "done"; mode: "fast" | "agent"; costGbp: number; tookMs: number }
  | { type: "error"; message: string };

export type DeepSearchRequestBody = {
  prompt?: string;
  filters?: NlFilterResult;
  currentBounds: DeepSearchBounds | null;
  forceAgent?: boolean;
};

type StreamHandlers = {
  onParsed: (filters: NlFilterResult) => void;
  onViewport: (bounds: DeepSearchBounds, place: string | null) => void;
  onResults: (
    entities: PlanningApplicationEntity[],
    meta: { total: number; mode: "fast" | "agent" },
  ) => void;
  onStatusLine?: (message: string | null) => void;
};

/**
 * Read NDJSON from `POST /api/ai/deep-search` and dispatch to callbacks.
 * Shared by the NL search bar and manual filter-tag flow.
 */
export async function consumeDeepSearchStream(
  body: DeepSearchRequestBody,
  handlers: StreamHandlers,
  options?: { signal?: AbortSignal },
): Promise<{
  lastError: string | null;
  resultsMeta: { total: number; mode: "fast" | "agent" } | null;
  httpError: string | null;
}> {
  const { onParsed, onViewport, onResults, onStatusLine } = handlers;
  const res = await fetch("/api/ai/deep-search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: options?.signal,
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    let msg = "Search failed";
    try {
      msg = (JSON.parse(text) as { error?: string }).error ?? msg;
    } catch {
      /* keep */
    }
    return { lastError: null, resultsMeta: null, httpError: msg };
  }

  let lastError: string | null = null;
  let resultsMeta: { total: number; mode: "fast" | "agent" } | null = null;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let event: DeepSearchStreamEvent;
      try {
        event = JSON.parse(line) as DeepSearchStreamEvent;
      } catch {
        continue;
      }
      switch (event.type) {
        case "parsed":
          onParsed(event.filters);
          break;
        case "viewport":
          onViewport(event.bounds, event.place);
          break;
        case "status":
          onStatusLine?.(event.message);
          break;
        case "results":
          onResults(event.entities, {
            total: event.total,
            mode: event.mode,
          });
          resultsMeta = { total: event.total, mode: event.mode };
          break;
        case "error":
          lastError = event.message;
          break;
        case "done":
          break;
      }
    }
  }
  onStatusLine?.(null);
  return { lastError, resultsMeta, httpError: null };
}
