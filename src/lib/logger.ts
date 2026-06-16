import pino from "pino";

/**
 * Structured logger. Pretty output in local dev, JSON in production (so Vercel
 * Log Drains can parse it). Attach tenant-scoped metadata via `logger.child()`.
 */
export const logger =
  process.env.NODE_ENV === "production"
    ? pino({ level: process.env.LOG_LEVEL ?? "info" })
    : pino({
        level: process.env.LOG_LEVEL ?? "debug",
        transport: {
          target: "pino-pretty",
          options: { colorize: true, singleLine: true },
        },
      });

export type Logger = typeof logger;
