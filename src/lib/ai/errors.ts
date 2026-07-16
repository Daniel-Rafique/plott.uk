/**
 * Normalise Vercel AI Gateway / SDK failures so callers can decide whether to
 * retry, fall back, or wake someone up in Sentry.
 */

export class AgentTimeoutError extends Error {
  constructor(message = "AI request timed out") {
    super(message);
    this.name = "AgentTimeoutError";
  }
}

const TIMEOUT_MARKERS = [
  "aborted due to timeout",
  "operation timed out",
  "request timed out",
  "gateway request failed",
] as const;

function errorText(err: unknown): { name: string; message: string } {
  if (err instanceof Error) {
    return { name: err.name, message: err.message };
  }
  const message = String(err);
  return { name: "Error", message };
}

/**
 * True for client-side aborts and gateway timeouts. These are expected under
 * load — several agents already fall back instead of failing the workflow.
 */
export function isTransientAiGatewayError(err: unknown): boolean {
  const { name, message } = errorText(err);
  const lower = message.toLowerCase();

  if (name === "TimeoutError" || name === "AbortError") return true;
  if (name === "AgentTimeoutError") return true;

  return lower.includes("timeout") && (
    name === "GatewayResponseError" ||
    TIMEOUT_MARKERS.some((marker) => lower.includes(marker))
  );
}

/**
 * Unwrap noisy gateway wrapper errors into a stable timeout error for logs and
 * AgentRun.errorMessage.
 */
export function normalizeAiError(err: unknown): Error {
  if (isTransientAiGatewayError(err)) {
    const { message } = errorText(err);
    return new AgentTimeoutError(
      message.includes("timeout") ? message : "AI request timed out",
    );
  }
  return err instanceof Error ? err : new Error(String(err));
}
