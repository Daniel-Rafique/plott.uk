import { describe, expect, it } from "vitest";
import { GET, OPTIONS, POST } from "@/app/api/mcp/route";

describe("stateless MCP route", () => {
  it("rejects unsupported GET streams immediately", async () => {
    const response = GET();

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST, OPTIONS");
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      jsonrpc: "2.0",
      error: { code: -32000 },
      id: null,
    });
  });

  it("advertises POST support through preflight", () => {
    const response = OPTIONS();

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toContain(
      "POST",
    );
  });

  it("keeps POST on the authenticated MCP request path", async () => {
    process.env.MCP_OAUTH_PUBLIC_ORIGIN = "https://plott.test";
    const response = await POST(
      new Request("https://plott.test/api/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "initialize",
          id: 1,
        }),
      }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      "resource_metadata=",
    );
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_token",
      error_description: "Bearer token required",
    });
  });
});
