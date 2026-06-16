import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hunterDomainSearch,
  hunterEmailFinder,
  hunterEmailVerifier,
} from "@/lib/ai/tools/hunter";

describe("Hunter enrichment helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("fails closed when HUNTER_API_KEY is not configured", async () => {
    vi.stubEnv("HUNTER_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(hunterDomainSearch({ domain: "example.com" })).resolves.toEqual({
      configured: false,
      results: [],
    });
    await expect(
      hunterEmailFinder({ domain: "example.com", fullName: "Jane Smith" }),
    ).resolves.toEqual({ configured: false, found: false });
    await expect(hunterEmailVerifier("jane@example.com")).resolves.toEqual({
      configured: false,
      verified: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns an empty configured result when domain search finds no emails", async () => {
    vi.stubEnv("HUNTER_API_KEY", "hunter_test_key");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { domain: "example.com", organization: "Example Ltd", emails: [] },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      hunterDomainSearch({ domain: "https://www.example.com/path", limit: 3 }),
    ).resolves.toEqual({
      configured: true,
      domain: "example.com",
      organization: "Example Ltd",
      results: [],
    });

    const url = fetchMock.mock.calls[0]?.[0] as URL;
    const options = fetchMock.mock.calls[0]?.[1] as {
      headers?: Record<string, string>;
    };
    expect(url.searchParams.get("domain")).toBe("example.com");
    expect(url.searchParams.get("limit")).toBe("3");
    expect(url.searchParams.has("api_key")).toBe(false);
    expect(options.headers?.["X-API-KEY"]).toBe("hunter_test_key");
  });

  it("normalises finder and verifier responses", async () => {
    vi.stubEnv("HUNTER_API_KEY", "hunter_test_key");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            email: "jane@example.com",
            score: 91,
            verification: { status: "valid" },
            sources: [{ uri: "https://example.com/team" }],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            email: "jane@example.com",
            status: "valid",
            score: 96,
            result: "deliverable",
          },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      hunterEmailFinder({ domain: "example.com", fullName: "Jane Smith" }),
    ).resolves.toEqual({
      configured: true,
      found: true,
      email: "jane@example.com",
      score: 91,
      status: "valid",
      sources: ["https://example.com/team"],
    });
    await expect(hunterEmailVerifier("jane@example.com")).resolves.toEqual({
      configured: true,
      verified: true,
      email: "jane@example.com",
      status: "valid",
      score: 96,
      result: "deliverable",
    });
  });
});
