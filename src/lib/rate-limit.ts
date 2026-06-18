/**
 * Upstash-backed rate limiter. Falls back to an in-memory map when
 * UPSTASH_REDIS_REST_URL is not configured (local dev) or when the Upstash
 * endpoint returns an unexpected response (e.g. misconfigured URL pointing
 * at QStash instead of Redis REST). Rate limits are keyed by
 * `action + userId-or-ip` so per-tenant quotas don't bleed across users.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { logger } from "@/lib/logger";

type LimitDef = {
  limit: number;
  window: `${number} ${"s" | "m" | "h" | "d"}`;
};

export const LIMITS = {
  search: { limit: 60, window: "1 m" },
  proprietor: { limit: 30, window: "1 m" },
  letter: { limit: 20, window: "1 m" },
  lpaScrape: { limit: 10, window: "1 m" },
  blobUpload: { limit: 30, window: "1 h" },
  aiNlSearch: { limit: 30, window: "1 m" },
  aiDeepSearch: { limit: 15, window: "1 m" },
  aiLetterAssist: { limit: 20, window: "1 m" },
  aiChat: { limit: 40, window: "1 m" },
  aiResearch: { limit: 20, window: "1 h" },
  outreachContact: { limit: 20, window: "1 h" },
  contact: { limit: 5, window: "1 h" },
  marketingSubscribe: { limit: 6, window: "1 h" },
} as const satisfies Record<string, LimitDef>;

export type LimitAction = keyof typeof LIMITS;

function resolveRedisCreds(): { url: string; token: string } | null {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL ||
    "";
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    "";
  if (!url || !token) return null;
  return { url, token };
}

const memoryStore = new Map<string, { count: number; resetAt: number }>();

function parseWindowMs(w: LimitDef["window"]): number {
  const [nStr, unit] = w.split(" ");
  const n = Number(nStr);
  const mult = unit === "s" ? 1000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
  return n * mult;
}

let upstashClient: Redis | null = null;
let upstashBroken = false;
let productionFallbackWarned = false;
const rlCache = new Map<LimitAction, Ratelimit>();

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

function failClosedInProduction(action: LimitAction): { ok: false; retryAfterMs: number } | null {
  if (!isProductionRuntime()) return null;
  if (!productionFallbackWarned) {
    productionFallbackWarned = true;
    logger.error(
      { action },
      "rate_limit_unavailable_in_production_failing_closed",
    );
  }
  return { ok: false, retryAfterMs: 60_000 };
}

function getRatelimiter(action: LimitAction): Ratelimit | null {
  if (upstashBroken) return null;
  const creds = resolveRedisCreds();
  if (!creds) return null;
  try {
    if (!upstashClient) {
      upstashClient = new Redis({ url: creds.url, token: creds.token });
    }
  } catch (err) {
    upstashBroken = true;
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "upstash_redis_init_failed_falling_back_to_memory",
    );
    return null;
  }
  const existing = rlCache.get(action);
  if (existing) return existing;
  const def = LIMITS[action];
  const rl = new Ratelimit({
    redis: upstashClient,
    limiter: Ratelimit.slidingWindow(def.limit, def.window),
    analytics: true,
    prefix: `pl:${action}`,
  });
  rlCache.set(action, rl);
  return rl;
}

function checkMemory(
  action: LimitAction,
  key: string,
): { ok: true } | { ok: false; retryAfterMs: number } {
  const def = LIMITS[action];
  const windowMs = parseWindowMs(def.window);
  const now = Date.now();
  const bucketKey = `${action}:${key}`;
  const entry = memoryStore.get(bucketKey);
  if (!entry || entry.resetAt < now) {
    memoryStore.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (entry.count >= def.limit) {
    return { ok: false, retryAfterMs: entry.resetAt - now };
  }
  entry.count += 1;
  return { ok: true };
}

export async function checkRateLimit(
  action: LimitAction,
  key: string,
): Promise<{ ok: true } | { ok: false; retryAfterMs: number }> {
  const rl = getRatelimiter(action);
  if (rl) {
    try {
      const { success, reset } = await rl.limit(`${action}:${key}`);
      if (success) return { ok: true };
      return { ok: false, retryAfterMs: Math.max(0, reset - Date.now()) };
    } catch (err) {
      upstashBroken = true;
      rlCache.clear();
      upstashClient = null;
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), action },
        isProductionRuntime()
          ? "upstash_ratelimit_failed_failing_closed"
          : "upstash_ratelimit_failed_falling_back_to_memory",
      );
      const closed = failClosedInProduction(action);
      if (closed) return closed;
      return checkMemory(action, key);
    }
  }
  const closed = failClosedInProduction(action);
  if (closed) return closed;
  return checkMemory(action, key);
}

export function rateLimitResponse(retryAfterMs: number): Response {
  return new Response(
    JSON.stringify({
      error: "Rate limit exceeded. Please try again shortly.",
    }),
    {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": String(Math.ceil(retryAfterMs / 1000)),
      },
    },
  );
}
