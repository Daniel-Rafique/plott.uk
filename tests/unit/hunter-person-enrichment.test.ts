import { afterEach, describe, expect, it, vi } from "vitest";
import {
  enrichPersonFromEmails,
  parseEnrichmentPersonJson,
  type ResolvedApplication,
} from "@/lib/enrichment";
import { classifyCompaniesHouseHttpStatus } from "@/lib/ai/tools/companies-house";
import { buildPipelineContactSummary } from "@/lib/pipeline-display";

describe("Hunter person enrichment wiring", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("parses stored person JSON and builds a role chip", () => {
    expect(
      parseEnrichmentPersonJson({
        email: "jane@example.com",
        position: "Director",
        employer: "Example Ltd",
        linkedin: "https://linkedin.com/in/jane",
      }),
    ).toMatchObject({
      email: "jane@example.com",
      position: "Director",
      employer: "Example Ltd",
    });

    const summary = buildPipelineContactSummary({
      applicantEmail: "jane@example.com",
      applicantPerson: {
        position: "Director",
        employer: "Example Ltd",
        linkedin: "https://linkedin.com/in/jane",
      },
    });
    expect(summary.personRole).toBe("Director · Example Ltd");
    expect(summary.personLinkedin).toBe("https://linkedin.com/in/jane");
  });

  it("attaches person data when an email is present and Hunter is configured", async () => {
    vi.stubEnv("HUNTER_API_KEY", "hunter_test_key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            email: "jane@example.com",
            employment: { title: "Director", name: "Example Ltd" },
            linkedin: { handle: "jane" },
          },
        }),
      }),
    );

    const base: ResolvedApplication = {
      applicationRef: "2026/1",
      applicantEmail: "jane@example.com",
      source: "hunter",
      confidence: "medium",
      sources: ["hunter"],
    };

    const enriched = await enrichPersonFromEmails(base);
    expect(enriched.applicantPerson?.position).toBe("Director");
    expect(enriched.applicantPerson?.employer).toBe("Example Ltd");
    expect(enriched.sources).toContain("hunter_person");
  });

  it("skips person enrichment when Hunter is unconfigured", async () => {
    vi.stubEnv("HUNTER_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const enriched = await enrichPersonFromEmails({
      applicationRef: "2026/1",
      applicantEmail: "jane@example.com",
      source: "hunter",
      confidence: "medium",
    });
    expect(enriched.applicantPerson).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("classifies Companies House HTTP statuses", () => {
    expect(classifyCompaniesHouseHttpStatus(401)).toBe("auth");
    expect(classifyCompaniesHouseHttpStatus(429)).toBe("rate_limited");
    expect(classifyCompaniesHouseHttpStatus(404)).toBe("not_found");
    expect(classifyCompaniesHouseHttpStatus(500)).toBe("http_error");
  });
});
