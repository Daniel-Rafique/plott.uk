import { describe, expect, it, vi, afterEach } from "vitest";
import { consumeDeepSearchStream } from "@/lib/ai/deep-search-stream";
import type { NlFilterResult } from "@/lib/ai/nl-search-parse";

function ndjsonResponse(lines: object[]): Response {
  const body = lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/x-ndjson" },
  });
}

const emptyFilters: NlFilterResult = {
  statuses: ["approved"],
  applicationTypes: [],
  developmentTypes: [],
  decisionFrom: null,
  decisionTo: null,
  indexedSinceYear: null,
  locationHint: "Camden",
  applicantLike: null,
  keywords: [],
  summary: "Approved applications in Camden",
};

describe("consumeDeepSearchStream hint events", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("dispatches hint message and suggestions to onHint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        ndjsonResponse([
          { type: "parsed", filters: emptyFilters, summary: emptyFilters.summary },
          {
            type: "hint",
            message: "Add a work type for sharper results",
            suggestions: [
              "Approved residential extensions in Camden",
              "Approved householder applications in Camden",
            ],
          },
          {
            type: "results",
            entities: [],
            total: 0,
            mode: "fast",
          },
          { type: "done", mode: "fast", costGbp: 0, tookMs: 1 },
        ]),
      ),
    );

    const onHint = vi.fn();
    const onParsed = vi.fn();
    const onViewport = vi.fn();
    const onResults = vi.fn();

    const result = await consumeDeepSearchStream(
      { prompt: "Approved applications in Camden", currentBounds: null },
      { onParsed, onViewport, onResults, onHint },
    );

    expect(onHint).toHaveBeenCalledWith({
      message: "Add a work type for sharper results",
      suggestions: [
        "Approved residential extensions in Camden",
        "Approved householder applications in Camden",
      ],
    });
    expect(onParsed).toHaveBeenCalled();
    expect(result.httpError).toBeNull();
  });
});
