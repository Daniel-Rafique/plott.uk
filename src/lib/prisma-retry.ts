import { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";

const TRANSIENT_PRISMA_CODES = new Set([
  "P1001", // Can't reach database server
  "P1002", // Database server timed out
  "P1008", // Operations timed out
  "P1017", // Server closed the connection
  "P2024", // Timed out fetching a new connection from the pool
]);

const TRANSIENT_MESSAGE_RE =
  /can't reach database server|connection terminated|connection reset|econnreset|etimedout|socket hang up|too many connections/i;

export function isTransientPrismaError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return TRANSIENT_PRISMA_CODES.has(error.code);
  }
  if (error instanceof Prisma.PrismaClientRustPanicError) {
    return true;
  }
  if (error instanceof Error && TRANSIENT_MESSAGE_RE.test(error.message)) {
    return true;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type PrismaRetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  label?: string;
};

/**
 * Retries transient Prisma / Neon pooler failures with exponential backoff.
 * Used by cron routes where a single connection blip must not abort the run.
 */
export async function withPrismaRetry<T>(
  operation: () => Promise<T>,
  options: PrismaRetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? 5;
  const baseDelayMs = options.baseDelayMs ?? 500;
  const label = options.label ?? "prisma";

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientPrismaError(error) || attempt === attempts) {
        throw error;
      }
      const delayMs = baseDelayMs * 2 ** (attempt - 1);
      logger.warn(
        { attempt, attempts, delayMs, label, err: error },
        "prisma_transient_retry",
      );
      await sleep(delayMs);
    }
  }
  throw lastError;
}
