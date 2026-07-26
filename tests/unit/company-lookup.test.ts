import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractUkPostcode,
  locationForChSearch,
  looksLikeAcronymCompany,
  looksLikeCompany,
  pickBestCompanyByAddress,
  resolveCompanyContact,
  scoreAddressMatch,
} from "@/lib/company-lookup";
import * as companiesHouse from "@/lib/ai/tools/companies-house";
import * as hunter from "@/lib/ai/tools/hunter";

vi.mock("@/lib/ai/tools/companies-house", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/ai/tools/companies-house")>();
  return {
    ...actual,
    isCompaniesHouseConfigured: vi.fn(() => true),
    searchCompanies: vi.fn(),
    advancedSearchCompanies: vi.fn(),
    getCompanyProfile: vi.fn(),
    getCompanyOfficers: vi.fn(),
  };
});

vi.mock("@/lib/ai/tools/hunter", () => ({
  hunterCompanyEnrichment: vi.fn(),
  hunterDomainSearch: vi.fn(),
  hunterEmailFinder: vi.fn(),
  hunterEmailVerifier: vi.fn(),
}));

const searchCompanies = companiesHouse.searchCompanies as ReturnType<
  typeof vi.fn
>;
const advancedSearchCompanies =
  companiesHouse.advancedSearchCompanies as ReturnType<typeof vi.fn>;
const getCompanyProfile = companiesHouse.getCompanyProfile as ReturnType<
  typeof vi.fn
>;
const getCompanyOfficers = companiesHouse.getCompanyOfficers as ReturnType<
  typeof vi.fn
>;
const hunterDomainSearch = hunter.hunterDomainSearch as ReturnType<typeof vi.fn>;
const hunterEmailFinder = hunter.hunterEmailFinder as ReturnType<typeof vi.fn>;
const hunterEmailVerifier = hunter.hunterEmailVerifier as ReturnType<typeof vi.fn>;

describe("looksLikeAcronymCompany", () => {
  it("treats short ALL-CAPS names as company acronyms", () => {
    expect(looksLikeAcronymCompany("NLA")).toBe(true);
    expect(looksLikeAcronymCompany("ABC")).toBe(true);
    expect(looksLikeAcronymCompany("UK")).toBe(true);
    expect(looksLikeAcronymCompany("N.L.A")).toBe(true);
    expect(looksLikeAcronymCompany("  NLA  ")).toBe(true);
  });

  it("does not treat short person-like names as acronyms", () => {
    expect(looksLikeAcronymCompany("Ann")).toBe(false);
    expect(looksLikeAcronymCompany("Jon")).toBe(false);
    expect(looksLikeAcronymCompany("Li")).toBe(false);
  });

  it("rejects longer or non-letter strings", () => {
    expect(looksLikeAcronymCompany("NLA Properties")).toBe(false);
    expect(looksLikeAcronymCompany("A")).toBe(false);
    expect(looksLikeAcronymCompany("ABCDE")).toBe(false);
    expect(looksLikeAcronymCompany("N2A")).toBe(false);
    expect(looksLikeAcronymCompany(null)).toBe(false);
    expect(looksLikeAcronymCompany("")).toBe(false);
  });
});

describe("looksLikeCompany", () => {
  it("matches corporate suffixes", () => {
    expect(looksLikeCompany("NLA Properties Ltd")).toBe(true);
    expect(looksLikeCompany("Star Plans Limited")).toBe(true);
    expect(looksLikeCompany("Acme LLP")).toBe(true);
  });

  it("matches short ALL-CAPS acronyms", () => {
    expect(looksLikeCompany("NLA")).toBe(true);
    expect(looksLikeCompany("ABC")).toBe(true);
  });

  it("does not match ordinary person names", () => {
    expect(looksLikeCompany("John Smith")).toBe(false);
    expect(looksLikeCompany("Ann")).toBe(false);
    expect(looksLikeCompany("Robert Jones")).toBe(false);
  });
});

describe("address matching helpers", () => {
  it("extracts and normalises UK postcodes", () => {
    expect(extractUkPostcode("105 Aslett Street SW18 2BG")).toBe("SW18 2BG");
    expect(extractUkPostcode("sw18  2bg")).toBe("SW18 2BG");
    expect(extractUkPostcode("no postcode here")).toBeNull();
  });

  it("prefers postcode for CH location search", () => {
    expect(locationForChSearch("10 Studio Road, London, SW18 1AA")).toBe(
      "SW18 1AA",
    );
  });

  it("scores postcode and street overlap", () => {
    expect(
      scoreAddressMatch(
        "10 Studio Road, London, SW18 1AA",
        "10 Studio Road, London SW18 1AA",
      ),
    ).toBeGreaterThanOrEqual(3);
    expect(
      scoreAddressMatch(
        "10 Studio Road, London, SW18 1AA",
        "1 Other Street, Manchester M1 1AA",
      ),
    ).toBe(0);
  });

  it("picks the address-grounded company over a name-only rival", () => {
    const best = pickBestCompanyByAddress(
      "NLA",
      "10 Studio Road, London, SW18 1AA",
      [
        {
          name: "NLA JAPAN ASSOCIATION",
          number: "00000001",
          status: "active",
          address: "Tokyo",
          incorporatedOn: null,
        },
        {
          name: "NLA ARCHITECTS LTD",
          number: "11223344",
          status: "active",
          address: "10 Studio Road, London, SW18 1AA",
          incorporatedOn: null,
        },
      ],
    );
    expect(best?.company.number).toBe("11223344");
  });
});

describe("resolveCompanyContact address grounding", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uses advanced search + legal name for Hunter when address matches", async () => {
    advancedSearchCompanies.mockResolvedValue([
      {
        name: "NLA ARCHITECTS LTD",
        number: "11223344",
        status: "active",
        address: "10 Studio Road, London, SW18 1AA",
        incorporatedOn: "2018-01-01",
      },
    ]);
    getCompanyProfile.mockResolvedValue({
      name: "NLA ARCHITECTS LTD",
      number: "11223344",
      status: "active",
      incorporatedOn: "2018-01-01",
      sicCodes: [],
      registeredAddress: "10 Studio Road, London, SW18 1AA",
      lastAccountsPeriodEnd: null,
    });
    getCompanyOfficers.mockResolvedValue([
      { name: "Pat Lee", role: "director", appointedOn: "2018-01-01" },
    ]);
    hunterDomainSearch.mockResolvedValue({
      configured: true,
      domain: "nla-architects.co.uk",
      organization: "NLA Architects",
      results: [
        {
          email: "pat@nla-architects.co.uk",
          type: "personal",
          confidence: 91,
        },
      ],
    });
    hunterEmailFinder.mockResolvedValue({
      configured: true,
      found: true,
      email: "pat@nla-architects.co.uk",
      score: 91,
      status: "valid",
      sources: [],
    });
    hunterEmailVerifier.mockResolvedValue({
      configured: true,
      status: "valid",
    });

    const result = await resolveCompanyContact("NLA", {
      needEmail: true,
      address: "10 Studio Road, London, SW18 1AA",
    });

    expect(advancedSearchCompanies).toHaveBeenCalledWith({
      location: "SW18 1AA",
      companyNameIncludes: "NLA",
      status: "active",
      size: 20,
    });
    expect(hunterEmailFinder).toHaveBeenCalledWith(
      expect.objectContaining({
        company: "NLA ARCHITECTS LTD",
      }),
    );
    expect(result).toMatchObject({
      companyName: "NLA ARCHITECTS LTD",
      email: "pat@nla-architects.co.uk",
      emailSource: "hunter",
    });
  });

  it("fails closed when an address is supplied but no CH office matches", async () => {
    advancedSearchCompanies.mockResolvedValue([
      {
        name: "NLA SOMETHING ELSE LTD",
        number: "99999999",
        status: "active",
        address: "1 Other Place, Manchester, M1 1AA",
        incorporatedOn: null,
      },
    ]);
    searchCompanies.mockResolvedValue([
      {
        name: "NLA SOMETHING ELSE LTD",
        number: "99999999",
        status: "active",
        address: "1 Other Place, Manchester, M1 1AA",
        incorporatedOn: null,
      },
    ]);

    const result = await resolveCompanyContact("NLA", {
      needEmail: true,
      address: "10 Studio Road, London, SW18 1AA",
    });

    expect(result).toBeNull();
    expect(hunterDomainSearch).not.toHaveBeenCalled();
  });
});
