/** Relative in-app path only — blocks open redirects and auth loops. */
export function sanitizeNext(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  if (raw.startsWith("/auth/")) return null;
  return raw;
}

export function buildSubscribeNext(
  plan: string,
  interval?: "month" | "year",
): string {
  const q = new URLSearchParams({ plan });
  if (interval === "year") q.set("interval", "year");
  return `/subscribe?${q.toString()}`;
}

/** Prefer `next` when it points at subscribe; otherwise fall back to API path. */
export function resolvePostOnboardingPath(
  preferredNext: string | null | undefined,
  apiNextPath: string | null | undefined,
): string {
  const preferred = sanitizeNext(preferredNext);
  if (preferred?.startsWith("/subscribe")) return preferred;
  if (apiNextPath && sanitizeNext(apiNextPath)) return apiNextPath;
  return preferred ?? "/subscribe";
}
