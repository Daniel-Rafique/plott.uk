/**
 * Live FX rate lookup for cost conversions.
 *
 * We convert provider USD token cost into GBP so it can be billed against a
 * tenant's monthly budget cap. The upstream source is Frankfurter
 * (https://api.frankfurter.dev) which exposes ECB reference rates, updated
 * once per business day, no API key required.
 *
 * Stripe removed its `/v1/exchange_rates` endpoint, so we can't use it.
 *
 * Strategy:
 *   1. In-memory LRU cache keyed by currency pair, 12-hour TTL.
 *   2. On refresh failure, return the last-known-good value (or env fallback
 *      `AI_USD_GBP_RATE`, or a hardcoded sensible default).
 *   3. Single-flight: concurrent callers share one in-flight request.
 */

import { logger } from "@/lib/logger";

type Pair = `${string}:${string}`;

type Entry = {
  rate: number;
  fetchedAt: number;
  source: "frankfurter" | "env" | "default";
};

const TTL_MS = 12 * 60 * 60 * 1000;
const HARD_DEFAULT_USD_GBP = 0.78;

const cache = new Map<Pair, Entry>();
const inflight = new Map<Pair, Promise<number>>();

function envFallback(pair: Pair): number {
  if (pair === "USD:GBP") {
    const n = Number(process.env.AI_USD_GBP_RATE);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return HARD_DEFAULT_USD_GBP;
}

async function fetchRate(from: string, to: string): Promise<number> {
  const url = `https://api.frankfurter.dev/v1/latest?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(5_000),
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Frankfurter ${res.status}`);
  const body = (await res.json()) as {
    rates?: Record<string, number>;
  };
  const rate = body.rates?.[to.toUpperCase()];
  if (!Number.isFinite(rate) || !rate || rate <= 0) {
    throw new Error(`Frankfurter returned no rate for ${to}`);
  }
  return rate as number;
}

async function refresh(pair: Pair): Promise<number> {
  const [from, to] = pair.split(":");
  try {
    const rate = await fetchRate(from, to);
    cache.set(pair, {
      rate,
      fetchedAt: Date.now(),
      source: "frankfurter",
    });
    return rate;
  } catch (err) {
    const fallback = envFallback(pair);
    logger.warn(
      { err, pair, fallback },
      "fx refresh failed, using fallback rate",
    );
    const existing = cache.get(pair);
    cache.set(pair, {
      rate: existing?.rate ?? fallback,
      fetchedAt: Date.now(),
      source: existing?.source ?? "env",
    });
    return existing?.rate ?? fallback;
  }
}

/**
 * Get a live conversion rate from `from` → `to`. Reads from an in-memory
 * cache (12h TTL); refreshes asynchronously otherwise. Guaranteed to resolve
 * with a positive number even if upstream is down.
 */
export async function getFxRate(
  from: string,
  to: string,
): Promise<number> {
  const pair = `${from.toUpperCase()}:${to.toUpperCase()}` as Pair;
  const cached = cache.get(pair);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < TTL_MS) {
    return cached.rate;
  }
  const pending = inflight.get(pair);
  if (pending) return pending;
  const p = refresh(pair).finally(() => inflight.delete(pair));
  inflight.set(pair, p);
  return p;
}

export async function getUsdToGbpRate(): Promise<number> {
  return getFxRate("USD", "GBP");
}

