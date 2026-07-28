/** Relative in-app path only — blocks open redirects and auth loops. */
export function sanitizeNext(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  if (raw.startsWith("/auth/")) return null;
  return raw;
}

/** True when `next` should return the user to MCP OAuth consent. */
export function isMcpOAuthReturnPath(path: string | null | undefined): boolean {
  return Boolean(path?.startsWith("/oauth/authorize"));
}

export function buildSubscribeNext(
  plan: string,
  interval?: "month" | "year",
): string {
  const q = new URLSearchParams({ plan });
  if (interval === "year") q.set("interval", "year");
  return `/subscribe?${q.toString()}`;
}

/**
 * Prefer `next` when it points at subscribe or MCP OAuth consent; otherwise
 * fall back to the API path. OAuth returns go via subscribe so billing still
 * completes before consent.
 */
export function resolvePostOnboardingPath(
  preferredNext: string | null | undefined,
  apiNextPath: string | null | undefined,
): string {
  const preferred = sanitizeNext(preferredNext);
  if (preferred?.startsWith("/subscribe")) return preferred;
  if (isMcpOAuthReturnPath(preferred)) {
    return `/subscribe?next=${encodeURIComponent(preferred)}`;
  }
  if (apiNextPath && sanitizeNext(apiNextPath)) return apiNextPath;
  return preferred ?? "/subscribe";
}
