import { describe, expect, it } from "vitest";
import {
  isMcpOAuthReturnPath,
  resolvePostOnboardingPath,
  sanitizeNext,
} from "@/lib/auth/sanitize-next";
import { resolveMcpOAuthSetupPath } from "@/lib/auth/mcp-oauth-setup";

const oauthReturn =
  "/oauth/authorize?client_id=abc&redirect_uri=https%3A%2F%2Fexample.com%2Fcb&state=s1";

describe("sanitizeNext MCP OAuth paths", () => {
  it("allows relative /oauth/authorize return paths", () => {
    expect(sanitizeNext(oauthReturn)).toBe(oauthReturn);
    expect(isMcpOAuthReturnPath(oauthReturn)).toBe(true);
  });

  it("still blocks open redirects and auth loops", () => {
    expect(sanitizeNext("https://evil.example/oauth/authorize")).toBeNull();
    expect(sanitizeNext("//evil.example")).toBeNull();
    expect(sanitizeNext("/auth/sign-in")).toBeNull();
  });

  it("routes post-onboarding OAuth next through subscribe", () => {
    expect(resolvePostOnboardingPath(oauthReturn, null)).toBe(
      `/subscribe?next=${encodeURIComponent(oauthReturn)}`,
    );
    expect(resolvePostOnboardingPath("/subscribe?plan=pro", null)).toBe(
      "/subscribe?plan=pro",
    );
  });
});

describe("resolveMcpOAuthSetupPath", () => {
  it("sends needs_company users to onboarding with next preserved", () => {
    expect(
      resolveMcpOAuthSetupPath({ stage: "needs_company" }, oauthReturn),
    ).toBe(`/onboarding?next=${encodeURIComponent(oauthReturn)}`);
  });

  it("sends needs_plan users to subscribe with next preserved", () => {
    expect(resolveMcpOAuthSetupPath({ stage: "needs_plan" }, oauthReturn)).toBe(
      `/subscribe?next=${encodeURIComponent(oauthReturn)}`,
    );
  });

  it("returns null for ready users so consent can render", () => {
    expect(resolveMcpOAuthSetupPath({ stage: "ready" }, oauthReturn)).toBeNull();
  });

  it("preserves next for unauthenticated and unverified stages", () => {
    expect(
      resolveMcpOAuthSetupPath({ stage: "unauthenticated" }, oauthReturn),
    ).toBe(`/auth/sign-in?next=${encodeURIComponent(oauthReturn)}`);
    expect(resolveMcpOAuthSetupPath({ stage: "unverified" }, oauthReturn)).toBe(
      `/auth/verify-email?next=${encodeURIComponent(oauthReturn)}`,
    );
  });
});
