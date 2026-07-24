import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  isValidRedirectUri,
  validateRedirectUris,
} from "@/lib/mcp/oauth/redirect-uri";
import {
  isDynamicClientRegistrationEnabled,
  normalizeScopes,
  oauthConfig,
} from "@/lib/mcp/oauth/config";
import {
  issueAccessToken,
  verifyAccessToken,
  verifyPkce,
} from "@/lib/mcp/oauth/tokens";

describe("MCP OAuth redirect validation", () => {
  it("allows HTTPS, loopback HTTP, and Cursor's registered callback", () => {
    expect(isValidRedirectUri("https://client.example/callback")).toBe(true);
    expect(isValidRedirectUri("http://127.0.0.1:43123/callback")).toBe(true);
    expect(
      isValidRedirectUri("cursor://anysphere.cursor-mcp/oauth/callback"),
    ).toBe(true);
  });

  it("rejects insecure remote, credentialed, and fragment redirects", () => {
    expect(isValidRedirectUri("http://client.example/callback")).toBe(false);
    expect(isValidRedirectUri("https://user@client.example/callback")).toBe(false);
    expect(isValidRedirectUri("https://client.example/callback#token")).toBe(false);
    expect(() => validateRedirectUris(["javascript:alert(1)"])).toThrow();
  });
});

describe("MCP OAuth scopes and PKCE", () => {
  it("keeps dynamic client registration disabled unless explicitly enabled", () => {
    delete process.env.MCP_OAUTH_DCR_ENABLED;
    expect(isDynamicClientRegistrationEnabled()).toBe(false);
    process.env.MCP_OAUTH_DCR_ENABLED = "true";
    expect(isDynamicClientRegistrationEnabled()).toBe(true);
  });

  it("deduplicates allowed scopes and rejects unknown scopes", () => {
    expect(normalizeScopes("mcp planning:read mcp")).toEqual([
      "mcp",
      "planning:read",
    ]);
    expect(() => normalizeScopes("mcp admin:write")).toThrow("Unsupported scope");
  });

  it("verifies an RFC 7636 S256 challenge", () => {
    const verifier = "a".repeat(43);
    const challenge = createHash("sha256")
      .update(verifier)
      .digest("base64url");
    expect(verifyPkce(verifier, challenge)).toBe(true);
    expect(verifyPkce(`${verifier}b`, challenge)).toBe(false);
  });
});

describe("resource-bound access tokens", () => {
  beforeEach(() => {
    process.env.MCP_OAUTH_PUBLIC_ORIGIN = "https://plott.test";
    process.env.MCP_OAUTH_SIGNING_SECRET = "test-secret-for-mcp-oauth";
  });

  it("round-trips required tenant and scope claims", async () => {
    const issued = await issueAccessToken({
      userId: "user-1",
      companyId: "company-1",
      role: "owner",
      clientId: "client-1",
      scopes: ["mcp", "workspace:read"],
    });
    const claims = await verifyAccessToken(issued.token);
    expect(claims.sub).toBe("user-1");
    expect(claims.company_id).toBe("company-1");
    expect(claims.scope).toBe("mcp workspace:read");
  });

  it("rejects a token at the wrong resource audience", async () => {
    const issued = await issueAccessToken({
      userId: "user-1",
      companyId: "company-1",
      role: "owner",
      clientId: "client-1",
      scopes: ["mcp"],
    });
    await expect(
      verifyAccessToken(issued.token, `${oauthConfig().origin}/api/other`),
    ).rejects.toThrow();
  });
});
