/**
 * In-memory session cache for `GET /api/outreach/contact` results (same tab
 * only; cleared on full page reload). Prevents repeat resolution when reopening
 * View Applicant or the proprietor letter modal for the same application +
 * query inputs.
 */
import type { OutreachContactBundle } from "@/lib/outreach-contact";

const store = new Map<string, OutreachContactBundle>();

/**
 * Deterministic key: sorted parameter names, `name=value` joined with `&`.
 * Omitted and empty string values for a given name both serialize as `name=`
 * (empty value) when not present the key is absent — so callers should build
 * `URLSearchParams` the same way as the fetch to match.
 */
export function buildOutreachContactCacheKeyFromParams(
  params: URLSearchParams,
): string {
  const names = [...new Set([...params.keys()])].sort();
  return names
    .map((name) => {
      const v = params.get(name);
      return `${name}=${v ?? ""}`;
    })
    .join("&");
}

export function getOutreachContactSessionCache(
  key: string,
): OutreachContactBundle | undefined {
  return store.get(key);
}

export function setOutreachContactSessionCache(
  key: string,
  bundle: OutreachContactBundle,
): void {
  store.set(key, bundle);
}
