import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchPlanwireApplicationsByQuery,
  PlanwireTimeoutError,
} from "@/lib/planwire";

describe("fetchPlanwireApplicationsByQuery", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns an empty array when PLANWIRE_API_KEY is not configured", async () => {
    vi.stubEnv("PLANWIRE_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchPlanwireApplicationsByQuery({ council: "camden" }),
    ).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("builds the expected query string and caps limit at 100", async () => {
    vi.stubEnv("PLANWIRE_API_KEY", "pw_test_key");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "app-uuid-1",
            councilId: "camden",
            reference: "2026/001/FUL",
            address: "1 Test Street",
            postcode: "NW1 1AA",
            lat: 51.5,
            lng: -0.12,
            description: "Single storey rear extension",
            status: "Refused",
            decision: "Refused",
            decision_date: "2026-01-15",
            url: "https://example.com/application",
            type: "Householder",
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const results = await fetchPlanwireApplicationsByQuery({
      q: "extension",
      council: "camden",
      postcode: "NW1",
      status: "Refused",
      type: "Householder",
      dateFrom: "2026-01-01",
      dateTo: "2026-06-30",
      page: 2,
      limit: 250,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = new URL(fetchMock.mock.calls[0]?.[0] as string);
    const options = fetchMock.mock.calls[0]?.[1] as {
      headers?: Record<string, string>;
      signal?: AbortSignal;
    };

    expect(calledUrl.pathname).toBe("/v1/applications");
    expect(calledUrl.searchParams.get("q")).toBe("extension");
    expect(calledUrl.searchParams.get("council")).toBe("camden");
    expect(calledUrl.searchParams.get("postcode")).toBe("NW1");
    expect(calledUrl.searchParams.get("status")).toBe("Refused");
    expect(calledUrl.searchParams.get("type")).toBe("Householder");
    expect(calledUrl.searchParams.get("date_from")).toBe("2026-01-01");
    expect(calledUrl.searchParams.get("date_to")).toBe("2026-06-30");
    expect(calledUrl.searchParams.get("page")).toBe("2");
    expect(calledUrl.searchParams.get("limit")).toBe("100");
    expect(options.headers?.Authorization).toBe("Bearer pw_test_key");
    expect(options.signal).toBeInstanceOf(AbortSignal);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: "app-uuid-1",
      councilId: "camden",
      reference: "2026/001/FUL",
      status: "Refused",
      decisionDate: "2026-01-15",
    });
  });

  it("backfills coordinates from postcodes.io when the row has no lat/lng", async () => {
    vi.stubEnv("PLANWIRE_API_KEY", "pw_test_key");
    const fetchMock = vi.fn().mockImplementation((input: string | URL) => {
      const href = typeof input === "string" ? input : input.toString();
      if (href.includes("api.postcodes.io")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            result: [
              {
                query: "NW6 1DE",
                result: { latitude: 51.5432, longitude: -0.1987 },
              },
            ],
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: [
            {
              id: "app-uuid-2",
              councilId: "camden",
              reference: "2026/2245/P",
              address: "10 Ingham Road, London, NW6 1DE",
              postcode: "NW6 1DE",
              lat: null,
              lng: null,
              description: "Rear extension",
              status: "REGISTERED",
              url: "https://example.com/app",
            },
          ],
        }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const results = await fetchPlanwireApplicationsByQuery({ council: "camden" });

    expect(results).toHaveLength(1);
    expect(results[0].lat).toBeCloseTo(51.5432, 4);
    expect(results[0].lng).toBeCloseTo(-0.1987, 4);

    const postcodeCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes("api.postcodes.io"),
    );
    expect(postcodeCall).toBeTruthy();
  });

  it("decodes HTML entities in applicant and address fields", async () => {
    vi.stubEnv("PLANWIRE_API_KEY", "pw_test_key");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "app-uuid-3",
            councilId: "camden",
            reference: "2026/2859/P",
            address: "Flat 7, 14 Netherhall Gardens, London",
            postcode: "NW3 5TH",
            lat: 51.55,
            lng: -0.18,
            description: "Roof terrace &amp; balustrade",
            status: "REGISTERED",
            url: "https://example.com/app",
            applicant: {
              name: "Mr &amp; Mrs Sofian Lignier",
              agent: "4D PLANNING",
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const results = await fetchPlanwireApplicationsByQuery({ council: "camden" });

    expect(results).toHaveLength(1);
    expect(results[0].applicant?.name).toBe("Mr & Mrs Sofian Lignier");
    expect(results[0].description).toBe("Roof terrace & balustrade");
  });

  it("omits unset optional params and defaults page/limit", async () => {
    vi.stubEnv("PLANWIRE_API_KEY", "pw_test_key");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchPlanwireApplicationsByQuery({ council: "oxford" });

    const calledUrl = new URL(fetchMock.mock.calls[0]?.[0] as string);
    expect(calledUrl.searchParams.get("council")).toBe("oxford");
    expect(calledUrl.searchParams.get("page")).toBe("1");
    expect(calledUrl.searchParams.get("limit")).toBe("20");
    expect(calledUrl.searchParams.has("q")).toBe(false);
    expect(calledUrl.searchParams.has("postcode")).toBe(false);
    expect(calledUrl.searchParams.has("status")).toBe(false);
    expect(calledUrl.searchParams.has("type")).toBe(false);
    expect(calledUrl.searchParams.has("date_from")).toBe(false);
    expect(calledUrl.searchParams.has("date_to")).toBe(false);
  });

  it("surfaces an upstream timeout as a controlled error", async () => {
    vi.stubEnv("PLANWIRE_API_KEY", "pw_test_key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("Timed out", "TimeoutError")),
    );

    const error = await fetchPlanwireApplicationsByQuery({
      council: "wandsworth",
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PlanwireTimeoutError);
    expect(error).toEqual(
      expect.objectContaining({
        name: "PlanwireTimeoutError",
        message: "Planning search timed out. Please retry in a moment.",
        context: "applications?search",
      }),
    );
  });
});
