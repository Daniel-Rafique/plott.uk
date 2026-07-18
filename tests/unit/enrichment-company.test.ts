import { afterEach, describe, expect, it, vi } from "vitest";
import {
  enrichFromCompanyLookup,
  type ResolvedApplication,
} from "@/lib/enrichment";
import * as companyLookup from "@/lib/company-lookup";

vi.mock("@/lib/company-lookup", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/company-lookup")>();
  return {
    ...actual,
    resolveCompanyContact: vi.fn(),
    resolveHunterEmail: vi.fn(),
  };
});

const resolveCompanyContact = companyLookup.resolveCompanyContact as ReturnType<
  typeof vi.fn
>;
const resolveHunterEmail = companyLookup.resolveHunterEmail as ReturnType<
  typeof vi.fn
>;

function baseResolved(
  partial: Partial<ResolvedApplication> = {},
): ResolvedApplication {
  return {
    applicationRef: "24/00123/FUL",
    source: "planwire",
    confidence: "low",
    sources: ["planwire"],
    ...partial,
  };
}

describe("enrichFromCompanyLookup", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("fills director addressee, address, and Hunter email for a corporate applicant", async () => {
    vi.stubEnv("HUNTER_API_KEY", "hunter_test");
    resolveCompanyContact.mockResolvedValue({
      companyName: "STAR PLANS LTD",
      companyNumber: "13888490",
      status: "active",
      contactName: "Jane Doe, Director",
      address: "STAR PLANS LTD, 36 Ravensdale Road, London, N16 6SH",
      email: "jane@starplans.co.uk",
      emailSource: "hunter",
      emailConfidence: 88,
      emailStatus: "valid",
      sources: ["companies_house", "hunter"],
    });

    const result = await enrichFromCompanyLookup(
      baseResolved({ applicantName: "Star Plans Ltd" }),
    );

    expect(resolveCompanyContact).toHaveBeenCalledWith("Star Plans Ltd", {
      needEmail: true,
      personName: null,
    });
    expect(result).toMatchObject({
      companyName: "STAR PLANS LTD",
      applicantName: "Jane Doe, Director",
      applicantAddress: "STAR PLANS LTD, 36 Ravensdale Road, London, N16 6SH",
      applicantEmail: "jane@starplans.co.uk",
      applicantEmailSource: "hunter",
      applicantEmailConfidence: 88,
      confidence: "high",
      sources: ["planwire", "companies_house", "hunter"],
    });
  });

  it("uses seed applicant when PlanWire only returned a company name field", async () => {
    vi.stubEnv("HUNTER_API_KEY", "");
    resolveCompanyContact.mockResolvedValue({
      companyName: "ABC DEVELOPMENTS LTD",
      companyNumber: "12345678",
      status: "active",
      contactName: "John Smith, Director",
      address: "ABC DEVELOPMENTS LTD, 1 High Street",
      email: null,
      emailSource: null,
      emailConfidence: null,
      emailStatus: null,
      sources: ["companies_house"],
    });

    const result = await enrichFromCompanyLookup(
      baseResolved({ companyName: "ABC Developments Ltd" }),
      { seedApplicant: "ABC Developments Ltd" },
    );

    expect(resolveCompanyContact).toHaveBeenCalledWith("ABC Developments Ltd", {
      needEmail: false,
      personName: null,
    });
    expect(result.applicantName).toBe("John Smith, Director");
  });

  it("does not overwrite an existing human applicant name", async () => {
    vi.stubEnv("HUNTER_API_KEY", "hunter_test");
    resolveCompanyContact.mockResolvedValue({
      companyName: "STAR PLANS LTD",
      companyNumber: "13888490",
      status: "active",
      contactName: "Jane Doe, Director",
      address: "STAR PLANS LTD, 36 Ravensdale Road",
      email: "jane@starplans.co.uk",
      emailSource: "hunter",
      emailConfidence: 90,
      emailStatus: "valid",
      sources: ["companies_house", "hunter"],
    });

    const result = await enrichFromCompanyLookup(
      baseResolved({
        companyName: "Star Plans Ltd",
        applicantName: "Robert Jones",
        applicantAddress: "Site address from LPA",
      }),
    );

    expect(resolveCompanyContact).toHaveBeenCalledWith("Star Plans Ltd", {
      needEmail: true,
      personName: "Robert Jones",
    });
    expect(result.applicantName).toBe("Robert Jones");
    expect(result.applicantEmail).toBe("jane@starplans.co.uk");
  });

  it("replaces a short ALL-CAPS acronym applicant with the CH director", async () => {
    vi.stubEnv("HUNTER_API_KEY", "");
    resolveCompanyContact.mockResolvedValue({
      companyName: "NLA PROPERTIES LIMITED",
      companyNumber: "09876543",
      status: "active",
      contactName: "Alex Mercer, Director",
      address: "NLA PROPERTIES LIMITED, 105 Aslett Street, London, SW18 2BG",
      email: null,
      emailSource: null,
      emailConfidence: null,
      emailStatus: null,
      sources: ["companies_house"],
    });

    const result = await enrichFromCompanyLookup(
      baseResolved({
        applicantName: "NLA",
        companyName: "NLA Properties Limited",
      }),
    );

    expect(resolveCompanyContact).toHaveBeenCalledWith(
      "NLA Properties Limited",
      {
        needEmail: false,
        personName: null,
      },
    );
    expect(result.applicantName).toBe("Alex Mercer, Director");
    expect(result.companyName).toBe("NLA PROPERTIES LIMITED");
  });

  it("uses a bare acronym as the CH search seed when no fuller companyName exists", async () => {
    vi.stubEnv("HUNTER_API_KEY", "");
    resolveCompanyContact.mockResolvedValue({
      companyName: "NLA PROPERTIES LIMITED",
      companyNumber: "09876543",
      status: "active",
      contactName: "Alex Mercer, Director",
      address: "1 High Street",
      email: null,
      emailSource: null,
      emailConfidence: null,
      emailStatus: null,
      sources: ["companies_house"],
    });

    const result = await enrichFromCompanyLookup(
      baseResolved({ applicantName: "NLA" }),
    );

    expect(resolveCompanyContact).toHaveBeenCalledWith("NLA", {
      needEmail: false,
      personName: null,
    });
    expect(result.applicantName).toBe("Alex Mercer, Director");
  });

  it("calls Hunter directly when Companies House returns no match", async () => {
    vi.stubEnv("HUNTER_API_KEY", "hunter_test");
    resolveCompanyContact.mockResolvedValue(null);
    resolveHunterEmail.mockResolvedValue({
      email: "hello@starplans.co.uk",
      confidence: 72,
      status: "valid",
    });

    const result = await enrichFromCompanyLookup(
      baseResolved({ applicantName: "Star Plans Ltd" }),
    );

    expect(resolveCompanyContact).toHaveBeenCalled();
    expect(resolveHunterEmail).toHaveBeenCalledWith({
      company: "Star Plans Ltd",
      personName: null,
    });
    expect(result).toMatchObject({
      applicantEmail: "hello@starplans.co.uk",
      applicantEmailSource: "hunter",
      applicantEmailConfidence: 72,
      applicantEmailStatus: "valid",
      sources: ["planwire", "hunter"],
    });
  });

  it("stores agent email provenance when Hunter fills an agent contact", async () => {
    vi.stubEnv("HUNTER_API_KEY", "hunter_test");
    resolveCompanyContact.mockResolvedValue(null);
    resolveHunterEmail.mockResolvedValue({
      email: "office@planningagents.co.uk",
      confidence: 65,
      status: "accept_all",
    });

    const result = await enrichFromCompanyLookup(
      baseResolved({
        applicantName: "Jane Smith",
        agentName: "Planning Agents Ltd",
      }),
    );

    expect(resolveHunterEmail).toHaveBeenCalledWith({
      company: "Planning Agents Ltd",
      personName: null,
    });
    expect(result).toMatchObject({
      agentEmail: "office@planningagents.co.uk",
      agentEmailSource: "hunter",
      agentEmailConfidence: 65,
      agentEmailStatus: "accept_all",
    });
  });

  it("does not re-call Hunter when Companies House already attempted email lookup", async () => {
    vi.stubEnv("HUNTER_API_KEY", "hunter_test");
    resolveCompanyContact.mockResolvedValue({
      companyName: "STAR PLANS LTD",
      companyNumber: "13888490",
      status: "active",
      contactName: "Jane Doe, Director",
      address: "STAR PLANS LTD, 1 High Street",
      email: null,
      emailSource: null,
      emailConfidence: null,
      emailStatus: null,
      sources: ["companies_house"],
    });

    const result = await enrichFromCompanyLookup(
      baseResolved({ applicantName: "Star Plans Ltd" }),
    );

    expect(resolveHunterEmail).not.toHaveBeenCalled();
    expect(result.applicantEmail).toBeNull();
    expect(result.applicantName).toBe("Jane Doe, Director");
  });
});
