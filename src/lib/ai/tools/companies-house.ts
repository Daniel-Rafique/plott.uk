/**
 * Companies House tools. Uses the free UK government API at
 * https://developer.company-information.service.gov.uk — auth is HTTP Basic
 * with your API key as the username and empty password.
 */

import { tool } from "ai";
import { z } from "zod";

const BASE = "https://api.company-information.service.gov.uk";
const REVALIDATE_SECONDS = 6 * 60 * 60;

type CompanySearchItem = {
  company_name?: string;
  company_number?: string;
  company_status?: string;
  address_snippet?: string;
  date_of_creation?: string;
  links?: { self?: string };
};

export function isCompaniesHouseConfigured(): boolean {
  return Boolean(process.env.COMPANIES_HOUSE_API_KEY);
}

function authHeader(): string | null {
  const key = process.env.COMPANIES_HOUSE_API_KEY;
  if (!key) return null;
  return `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
}

async function chFetch<T>(path: string): Promise<T | null> {
  const auth = authHeader();
  if (!auth) return null;
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: auth, Accept: "application/json" },
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export type CompaniesHouseSearchResult = {
  name: string;
  number: string;
  status: string;
  address: string;
  incorporatedOn: string | null;
};

/** Plain helper: search Companies House by name. Empty array when unconfigured. */
export async function searchCompanies(
  query: string,
  limit = 5,
): Promise<CompaniesHouseSearchResult[]> {
  if (!authHeader()) return [];
  const data = await chFetch<{ items?: CompanySearchItem[] }>(
    `/search/companies?q=${encodeURIComponent(query)}&items_per_page=${limit}`,
  );
  return (data?.items ?? []).map((i) => ({
    name: i.company_name ?? "",
    number: i.company_number ?? "",
    status: i.company_status ?? "",
    address: i.address_snippet ?? "",
    incorporatedOn: i.date_of_creation ?? null,
  }));
}

export const companiesHouseSearchTool = tool({
  description:
    "Search UK Companies House for companies matching a name. Returns up to 5 candidates with company number, status, incorporation date, and registered address. Use to identify corporate applicants or agents.",
  inputSchema: z.object({
    query: z
      .string()
      .min(2)
      .describe("Company name or partial name to search for."),
  }),
  execute: async ({ query }) => {
    const auth = authHeader();
    if (!auth) {
      return { configured: false as const, results: [] };
    }
    const data = await chFetch<{ items?: CompanySearchItem[] }>(
      `/search/companies?q=${encodeURIComponent(query)}&items_per_page=5`,
    );
    const items = data?.items ?? [];
    return {
      configured: true as const,
      results: items.map((i) => ({
        name: i.company_name ?? "",
        number: i.company_number ?? "",
        status: i.company_status ?? "",
        address: i.address_snippet ?? "",
        incorporatedOn: i.date_of_creation ?? null,
      })),
    };
  },
});

type CompanyProfile = {
  company_name?: string;
  company_number?: string;
  company_status?: string;
  date_of_creation?: string;
  sic_codes?: string[];
  registered_office_address?: {
    address_line_1?: string;
    address_line_2?: string;
    locality?: string;
    postal_code?: string;
    country?: string;
  };
  accounts?: {
    last_accounts?: { period_end_on?: string };
  };
};

export type CompaniesHouseProfile = {
  name: string;
  number: string;
  status: string;
  incorporatedOn: string | null;
  sicCodes: string[];
  registeredAddress: string;
  lastAccountsPeriodEnd: string | null;
};

/** Plain helper: fetch a company profile by number. Null when not found/unconfigured. */
export async function getCompanyProfile(
  companyNumber: string,
): Promise<CompaniesHouseProfile | null> {
  const data = await chFetch<CompanyProfile>(
    `/company/${encodeURIComponent(companyNumber)}`,
  );
  if (!data) return null;
  const addr = data.registered_office_address ?? {};
  const addressLines = [
    addr.address_line_1,
    addr.address_line_2,
    addr.locality,
    addr.postal_code,
    addr.country,
  ]
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .join(", ");
  return {
    name: data.company_name ?? "",
    number: data.company_number ?? companyNumber,
    status: data.company_status ?? "",
    incorporatedOn: data.date_of_creation ?? null,
    sicCodes: data.sic_codes ?? [],
    registeredAddress: addressLines,
    lastAccountsPeriodEnd: data.accounts?.last_accounts?.period_end_on ?? null,
  };
}

export const companiesHouseProfileTool = tool({
  description:
    "Fetch a Companies House company profile by company number. Returns registered office, SIC codes (industry), last accounts date, and status.",
  inputSchema: z.object({
    companyNumber: z
      .string()
      .min(1)
      .describe("Companies House 8-character company number, e.g. 12345678."),
  }),
  execute: async ({ companyNumber }) => {
    const profile = await getCompanyProfile(companyNumber);
    if (!profile) return { found: false as const };
    return { found: true as const, ...profile };
  },
});

type OfficerItem = {
  name?: string;
  officer_role?: string;
  appointed_on?: string;
  resigned_on?: string;
};

export type CompaniesHouseOfficer = {
  name: string;
  role: string;
  appointedOn: string | null;
};

/** Plain helper: list up to 10 active officers for a company. */
export async function getCompanyOfficers(
  companyNumber: string,
): Promise<CompaniesHouseOfficer[]> {
  const data = await chFetch<{ items?: OfficerItem[] }>(
    `/company/${encodeURIComponent(companyNumber)}/officers?items_per_page=20`,
  );
  const items = data?.items ?? [];
  return items
    .filter((i) => !i.resigned_on)
    .slice(0, 10)
    .map((o) => ({
      name: o.name ?? "",
      role: o.officer_role ?? "",
      appointedOn: o.appointed_on ?? null,
    }));
}

export const companiesHouseOfficersTool = tool({
  description:
    "List current officers (directors, secretaries) of a UK company by number. Returns up to 10 active officers.",
  inputSchema: z.object({
    companyNumber: z.string().min(1),
  }),
  execute: async ({ companyNumber }) => {
    return { officers: await getCompanyOfficers(companyNumber) };
  },
});
