import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    oAuthClient: {
      findUnique: mocks.findUnique,
    },
  },
}));

import { validateAuthorizationRequest } from "@/lib/mcp/oauth/authorization-request";

describe("MCP authorization requests", () => {
  beforeEach(() => {
    process.env.MCP_OAUTH_PUBLIC_ORIGIN = "https://plott.test";
    mocks.findUnique.mockResolvedValue({
      clientId: "client-1",
      clientName: "Cursor",
      redirectUris: ["http://localhost:8787/callback"],
      scopes: ["mcp"],
      expiresAt: null,
    });
  });

  it("allows globally supported scopes beyond DCR registration metadata", async () => {
    const request = await validateAuthorizationRequest({
      client_id: "client-1",
      redirect_uri: "http://localhost:8787/callback",
      response_type: "code",
      state: "state-1",
      resource: "https://plott.test/api/mcp",
      scope: "mcp workspace:read planning:read",
      code_challenge: "a".repeat(43),
      code_challenge_method: "S256",
    });

    expect(request.scopes).toEqual([
      "mcp",
      "workspace:read",
      "planning:read",
    ]);
  });
});
