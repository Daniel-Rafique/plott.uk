import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPlanwireApplicationsByQuery } from "@/lib/planwire";

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

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: "app-uuid-1",
      councilId: "camden",
      reference: "2026/001/FUL",
      status: "Refused",
      decisionDate: "2026-01-15",
    });
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
});
