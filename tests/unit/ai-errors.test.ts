import { describe, expect, it } from "vitest";
import {
  AgentTimeoutError,
  isTransientAiGatewayError,
  normalizeAiError,
} from "@/lib/ai/errors";

describe("isTransientAiGatewayError", () => {
  it("detects AbortSignal timeouts", () => {
    const err = new Error("The operation was aborted due to timeout");
    err.name = "TimeoutError";
    expect(isTransientAiGatewayError(err)).toBe(true);
  });

  it("detects gateway wrapper errors for timeouts", () => {
    const err = new Error(
      "Invalid error response format: Gateway request failed: The operation was aborted due to timeout",
    );
    err.name = "GatewayResponseError";
    expect(isTransientAiGatewayError(err)).toBe(true);
  });

  it("ignores unrelated gateway failures", () => {
    const err = new Error("Invalid error response format: Gateway request failed: model not found");
    err.name = "GatewayResponseError";
    expect(isTransientAiGatewayError(err)).toBe(false);
  });
});

describe("normalizeAiError", () => {
  it("maps transient gateway timeouts to AgentTimeoutError", () => {
    const err = new Error(
      "Invalid error response format: Gateway request failed: The operation was aborted due to timeout",
    );
    err.name = "GatewayResponseError";
    const normalized = normalizeAiError(err);
    expect(normalized).toBeInstanceOf(AgentTimeoutError);
    expect(normalized.message).toContain("timeout");
  });
});
