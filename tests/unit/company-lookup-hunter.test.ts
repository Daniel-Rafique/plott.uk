import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveHunterEmail } from "@/lib/company-lookup";
import * as hunter from "@/lib/ai/tools/hunter";

vi.mock("@/lib/ai/tools/hunter", () => ({
  hunterDomainSearch: vi.fn(),
  hunterCompanyEnrichment: vi.fn(),
  hunterEmailFinder: vi.fn(),
  hunterEmailVerifier: vi.fn(),
}));

const hunterDomainSearch = hunter.hunterDomainSearch as ReturnType<typeof vi.fn>;
const hunterCompanyEnrichment = hunter.hunterCompanyEnrichment as ReturnType<
  typeof vi.fn
>;
const hunterEmailFinder = hunter.hunterEmailFinder as ReturnType<typeof vi.fn>;
const hunterEmailVerifier = hunter.hunterEmailVerifier as ReturnType<typeof vi.fn>;

describe("resolveHunterEmail", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("falls back to company enrichment when Domain Search returns no domain", async () => {
    hunterDomainSearch.mockResolvedValue({
      configured: true,
      domain: null,
      organization: null,
      results: [],
    });
    hunterCompanyEnrichment.mockResolvedValue({
      configured: true,
      domain: "starplans.co.uk",
      name: "Star Plans Ltd",
    });
    hunterEmailFinder.mockResolvedValue({
      configured: true,
      found: true,
      email: "jane@starplans.co.uk",
      score: 88,
      status: "valid",
      sources: [],
    });

    const result = await resolveHunterEmail({
      company: "Star Plans Ltd",
      personName: "Jane Doe",
    });

    expect(hunterCompanyEnrichment).toHaveBeenCalledWith({
      company: "Star Plans Ltd",
    });
    expect(hunterEmailFinder).toHaveBeenCalledWith({
      domain: "starplans.co.uk",
      company: "Star Plans Ltd",
      fullName: "Jane Doe",
    });
    expect(result).toEqual({
      email: "jane@starplans.co.uk",
      confidence: 88,
      status: "valid",
    });
    expect(hunterEmailVerifier).not.toHaveBeenCalled();
  });

  it("tries Email Finder with company alone when domain cannot be resolved", async () => {
    hunterDomainSearch.mockResolvedValue({
      configured: true,
      domain: null,
      organization: null,
      results: [],
    });
    hunterCompanyEnrichment.mockResolvedValue({
      configured: true,
      domain: null,
      name: "Obscure Holdings Ltd",
      error: "domain_unresolved",
    });
    hunterEmailFinder.mockResolvedValue({
      configured: true,
      found: true,
      email: "director@obscureholdings.co.uk",
      score: 61,
      status: "accept_all",
      sources: [],
    });

    const result = await resolveHunterEmail({
      company: "Obscure Holdings Ltd",
      personName: "Pat Lee",
    });

    expect(hunterEmailFinder).toHaveBeenCalledWith({
      domain: undefined,
      company: "Obscure Holdings Ltd",
      fullName: "Pat Lee",
    });
    expect(result?.email).toBe("director@obscureholdings.co.uk");
  });
});
