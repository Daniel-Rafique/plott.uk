/**
 * Google Geocoding API wrapper for converting natural-language place names
 * ("Brixton", "SW9 8AA", "Camden") into a map viewport the UI can pan/zoom to.
 *
 * UK-biased (`region=uk` + `components=country:GB`). Results are cached in
 * memory for 24 hours since place-name geometry barely changes.
 *
 * Uses the server-only `GOOGLE_MAPS_API_KEY` env var. The
 * `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` used on the client is typically HTTP
 * referrer restricted and won't authenticate server-side requests — we fall
 * back to it only when no dedicated server key is set (local dev).
 */

import { logger } from "@/lib/logger";

export type GeocodeViewport = {
  bounds: {
    west: number;
    south: number;
    east: number;
    north: number;
  };
  center: { lat: number; lng: number };
  formatted: string;
};

type GoogleGeocodeResponse = {
  status: string;
  error_message?: string;
  results?: Array<{
    formatted_address?: string;
    geometry?: {
      location?: { lat: number; lng: number };
      viewport?: {
        northeast: { lat: number; lng: number };
        southwest: { lat: number; lng: number };
      };
      bounds?: {
        northeast: { lat: number; lng: number };
        southwest: { lat: number; lng: number };
      };
    };
  }>;
};

const TTL_MS = 24 * 60 * 60 * 1000;

type CacheEntry = { result: GeocodeViewport | null; expiresAt: number };
const cache = new Map<string, CacheEntry>();

function getKey(): string | null {
  return (
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    null
  );
}

function cacheKey(q: string): string {
  return q.trim().toLowerCase();
}

/**
 * Geocode a place name. Returns `null` when Google can't resolve it or the
 * API key isn't configured; callers should fall back gracefully (e.g. keep
 * whatever viewport the user already has on screen).
 */
export async function geocodePlace(
  query: string,
): Promise<GeocodeViewport | null> {
  const q = query.trim();
  if (q.length < 2) return null;

  const key = getKey();
  if (!key) {
    logger.warn(
      "geocode_api_key_missing: set GOOGLE_MAPS_API_KEY to enable geocoding",
    );
    return null;
  }

  const k = cacheKey(q);
  const hit = cache.get(k);
  if (hit && hit.expiresAt > Date.now()) return hit.result;

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", q);
  url.searchParams.set("region", "uk");
  url.searchParams.set("components", "country:GB");
  url.searchParams.set("key", key);

  try {
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(8_000),
      // Cache at the edge for a day too.
      next: { revalidate: 86_400 },
    });
    if (!res.ok) {
      logger.warn(
        { status: res.status, query: q },
        "geocode_http_error",
      );
      cache.set(k, { result: null, expiresAt: Date.now() + 5 * 60_000 });
      return null;
    }
    const data = (await res.json()) as GoogleGeocodeResponse;
    if (data.status !== "OK" || !data.results?.length) {
      if (data.status !== "ZERO_RESULTS") {
        logger.warn(
          { status: data.status, error: data.error_message, query: q },
          "geocode_api_status",
        );
      }
      // Cache policy depends on why we failed:
      //   - ZERO_RESULTS is a stable fact about the query ("Nonexistentville"
      //     doesn't exist) → cache for a full hour.
      //   - REQUEST_DENIED / OVER_QUERY_LIMIT / INVALID_REQUEST are transient
      //     or config-side failures (API not enabled, quota exhausted, key
      //     revoked). Cache VERY briefly so the moment the operator fixes
      //     the Cloud Console, the next query sees the change without us
      //     needing to restart the process.
      const transient =
        data.status === "REQUEST_DENIED" ||
        data.status === "OVER_QUERY_LIMIT" ||
        data.status === "INVALID_REQUEST";
      const ttlMs = transient ? 30_000 : 60 * 60_000;
      cache.set(k, { result: null, expiresAt: Date.now() + ttlMs });
      return null;
    }

    const top = data.results[0];
    const geom = top.geometry;
    const vp = geom?.viewport ?? geom?.bounds;
    if (!vp || !geom?.location) {
      cache.set(k, { result: null, expiresAt: Date.now() + 60 * 60_000 });
      return null;
    }

    const result: GeocodeViewport = {
      bounds: {
        west: vp.southwest.lng,
        south: vp.southwest.lat,
        east: vp.northeast.lng,
        north: vp.northeast.lat,
      },
      center: { lat: geom.location.lat, lng: geom.location.lng },
      formatted: top.formatted_address ?? q,
    };
    cache.set(k, { result, expiresAt: Date.now() + TTL_MS });
    return result;
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), query: q },
      "geocode_fetch_failed",
    );
    return null;
  }
}
