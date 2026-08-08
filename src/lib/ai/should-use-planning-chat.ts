/**
 * Route a dashboard agent prompt to planning Q&A vs deep-search.
 *
 * Deep-search owns spatial discovery (place names, filter language, "find…").
 * Planning chat owns follow-ups when a case is focused — unless the user is
 * clearly starting a new map search.
 */
export function shouldUsePlanningChat(
  prompt: string,
  hasFocusedApplication: boolean,
): boolean {
  if (!hasFocusedApplication) return false;

  const p = prompt.trim().toLowerCase();
  if (p.length < 2) return false;

  // Explicit discovery language + planning nouns → deep-search.
  if (
    /\b(find|search|show me|list|look up)\b/.test(p) &&
    /\b(applications?|extensions?|refusals?|approvals?|sites?|plots?)\b/.test(p)
  ) {
    return false;
  }

  if (/\bsince\s+\d{4}\b/.test(p)) return false;

  // Place-ish phrasing. Avoid common English "in …" that isn't a location
  // ("in plain English", "in this council", "in order to").
  if (/\b(near|around|within)\s+[a-z]{2,}\b/.test(p)) {
    return false;
  }
  if (
    /\bin\s+[a-z]{3,}\b/.test(p) &&
    !/\bin\s+(plain|this|that|the|your|my|our|order|general|particular|total|full|detail|progress|writing)\b/.test(
      p,
    )
  ) {
    return false;
  }

  if (
    /\b(approved|refused|granted|pending)\b.+\b(near|around|within)\b/.test(p)
  ) {
    return false;
  }

  return true;
}
