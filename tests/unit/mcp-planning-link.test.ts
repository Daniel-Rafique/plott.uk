import { describe, expect, it } from "vitest";
import { planningDashboardUrl } from "@/lib/mcp/tools/core";

describe("MCP planning dashboard links", () => {
  it("builds an internal non-persistent deep-search link", () => {
    const link = planningDashboardUrl(
      {
        council: "Wandsworth",
        status: "Pending",
        type: "Householder",
        dateFrom: "2026-01-01",
      },
      "https://plott.uk",
    );
    const url = new URL(link);

    expect(url.origin).toBe("https://plott.uk");
    expect(url.pathname).toBe("/app/dashboard");
    expect(url.searchParams.get("q")).toBe(
      "Pending Householder planning applications in Wandsworth from 2026-01-01",
    );
    expect(url.searchParams.has("savedSearch")).toBe(false);
  });
});
