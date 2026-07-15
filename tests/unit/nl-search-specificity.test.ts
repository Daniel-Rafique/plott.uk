import { describe, expect, it } from "vitest";
import type { NlFilterResult } from "@/lib/ai/nl-search-parse";
import {
  buildVagueSearchSuggestions,
  derivePlanwireQuery,
  isUnderSpecifiedNlSearch,
  VAGUE_SEARCH_HINT_MESSAGE,
} from "@/lib/ai/nl-search-specificity";

function filters(
  overrides: Partial<NlFilterResult> = {},
): NlFilterResult {
  return {
    statuses: [],
    applicationTypes: [],
    developmentTypes: [],
    decisionFrom: null,
    decisionTo: null,
    indexedSinceYear: null,
    locationHint: null,
    applicantLike: null,
    keywords: [],
    summary: "test",
    ...overrides,
  };
}

describe("isUnderSpecifiedNlSearch", () => {
  it("flags status + place with no thematic filters", () => {
    expect(
      isUnderSpecifiedNlSearch(
        filters({
          statuses: ["approved"],
          locationHint: "Camden",
        }),
      ),
    ).toBe(true);
  });

  it("flags place-only queries", () => {
    expect(
      isUnderSpecifiedNlSearch(filters({ locationHint: "Camden" })),
    ).toBe(true);
  });

  it("flags map-bounds-only when there is no location hint", () => {
    expect(
      isUnderSpecifiedNlSearch(filters({ statuses: ["approved"] }), {
        hasMapBounds: true,
      }),
    ).toBe(true);
  });

  it("is not under-specified when development types are set", () => {
    expect(
      isUnderSpecifiedNlSearch(
        filters({
          statuses: ["approved"],
          locationHint: "Camden",
          developmentTypes: ["extension"],
        }),
      ),
    ).toBe(false);
  });

  it("is not under-specified when keywords are set", () => {
    expect(
      isUnderSpecifiedNlSearch(
        filters({
          locationHint: "Camden",
          keywords: ["extension"],
        }),
      ),
    ).toBe(false);
  });

  it("is not under-specified when applicantLike is set", () => {
    expect(
      isUnderSpecifiedNlSearch(
        filters({
          locationHint: "Camden",
          applicantLike: "Argent",
        }),
      ),
    ).toBe(false);
  });

  it("is not under-specified without place or map bounds", () => {
    expect(
      isUnderSpecifiedNlSearch(filters({ statuses: ["approved"] })),
    ).toBe(false);
  });
});

describe("buildVagueSearchSuggestions", () => {
  it("reuses place and status wording", () => {
    const suggestions = buildVagueSearchSuggestions({
      locationHint: "Camden",
      statuses: ["approved"],
    });
    expect(suggestions).toEqual([
      "Approved residential extensions in Camden",
      "Approved householder applications in Camden",
      "Approved loft conversions in Camden",
    ]);
  });

  it("falls back when status is absent", () => {
    const suggestions = buildVagueSearchSuggestions({
      locationHint: "Brixton",
      statuses: [],
    });
    expect(suggestions[0]).toBe("residential extensions in Brixton");
    expect(suggestions[2]).toBe("Recent loft conversions in Brixton");
  });
});

describe("derivePlanwireQuery", () => {
  it("prefers explicit keywords", () => {
    expect(
      derivePlanwireQuery(
        filters({
          keywords: ["loft", "dormer"],
          developmentTypes: ["extension"],
        }),
      ),
    ).toBe("loft dormer");
  });

  it("derives q from development and application types when keywords empty", () => {
    expect(
      derivePlanwireQuery(
        filters({
          developmentTypes: ["residential", "extension"],
          applicationTypes: ["householder"],
        }),
      ),
    ).toBe("residential extension householder");
  });

  it("returns undefined when there is nothing to search", () => {
    expect(derivePlanwireQuery(filters())).toBeUndefined();
  });
});

describe("VAGUE_SEARCH_HINT_MESSAGE", () => {
  it("is a non-empty coaching string", () => {
    expect(VAGUE_SEARCH_HINT_MESSAGE.length).toBeGreaterThan(10);
  });
});
