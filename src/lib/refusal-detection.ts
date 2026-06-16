/**
 * Helpers for classifying whether a planning application is a refusal.
 *
 * PlanWire publishes a small, mostly-stable vocabulary for `decision` /
 * `status`, but LPAs vary the casing and wording (e.g. "Refused",
 * "Application Refused", "Refuse permission"). We normalise loosely so
 * the appeals pipeline catches them all without misclassifying approvals.
 */

const REFUSAL_DECISION_TOKENS = [
  "refus", // "Refused", "Refuse"
  "reject", // "Rejected"
  "declin", // "Declined"
] as const;

const NON_REFUSAL_DECISION_TOKENS = [
  "grant", // "Granted", "Permission granted"
  "approv", // "Approved"
  "permit", // "Permit granted"
  "allow", // "Allowed"
] as const;

/**
 * Returns true when the given status/decision text looks like a refusal.
 * Safe to call with undefined fields — returns false for empty/missing.
 */
export function isRefusalDecision(args: {
  status?: string | null;
  decision?: string | null;
}): boolean {
  const candidates = [args.status ?? "", args.decision ?? ""]
    .map((s) => s.toLowerCase())
    .filter(Boolean);
  if (candidates.length === 0) return false;
  const joined = candidates.join(" ");
  // Reject if the text explicitly signals approval, even if "refuse"
  // appears elsewhere (e.g. "approved after refusal on appeal").
  for (const tok of NON_REFUSAL_DECISION_TOKENS) {
    if (joined.includes(tok)) return false;
  }
  for (const tok of REFUSAL_DECISION_TOKENS) {
    if (joined.includes(tok)) return true;
  }
  return false;
}
