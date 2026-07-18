/**
 * Hunter.io enrichment tools. These are server-only helpers for structured
 * email discovery; they deliberately fail closed when the API key is absent.
 */

import { tool } from "ai";
import { z } from "zod";

const BASE = "https://api.hunter.io/v2";
const DEFAULT_TIMEOUT_MS = 12_000;

export type HunterEmail = {
  email: string;
  type: string | null;
  confidence: number | null;
  firstName: string | null;
  lastName: string | null;
  position: string | null;
  department: string | null;
  seniority: string | null;
  sourceDomain: string | null;
};

export type HunterDomainSearchResult =
  | {
      configured: false;
      results: [];
    }
  | {
      configured: true;
      domain: string | null;
      organization: string | null;
      results: HunterEmail[];
      error?: string;
    };

export type HunterEmailFinderResult =
  | {
      configured: false;
      found: false;
    }
  | {
      configured: true;
      found: boolean;
      email: string | null;
      score: number | null;
      status: string | null;
      sources: string[];
      error?: string;
    };

export type HunterEmailVerifierResult =
  | {
      configured: false;
      verified: false;
    }
  | {
      configured: true;
      verified: boolean;
      email: string;
      status: string | null;
      score: number | null;
      result: string | null;
      error?: string;
    };

export type HunterCompanyEnrichmentResult =
  | {
      configured: false;
      domain: null;
      name: null;
    }
  | {
      configured: true;
      domain: string | null;
      name: string | null;
      error?: string;
    };

type HunterDomainSearchResponse = {
  data?: {
    domain?: string | null;
    organization?: string | null;
    emails?: Array<{
      value?: string;
      type?: string | null;
      confidence?: number | null;
      first_name?: string | null;
      last_name?: string | null;
      position?: string | null;
      department?: string | null;
      seniority?: string | null;
      sources?: Array<{ domain?: string | null }>;
    }>;
  };
};

type HunterEmailFinderResponse = {
  data?: {
    email?: string | null;
    score?: number | null;
    verification?: { status?: string | null };
    sources?: Array<{ uri?: string | null; domain?: string | null }>;
  };
};

type HunterEmailVerifierResponse = {
  data?: {
    email?: string;
    status?: string | null;
    score?: number | null;
    result?: string | null;
  };
};

type HunterCompanyEnrichmentResponse = {
  data?: {
    domain?: string | null;
    name?: string | null;
    legalName?: string | null;
  };
};

function apiKey(): string | null {
  const key = process.env.HUNTER_API_KEY?.trim();
  return key ? key : null;
}

function cleanDomain(domain: string): string {
  const trimmed = domain.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return url.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return trimmed
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .split("/")[0]
      .toLowerCase();
  }
}

async function hunterFetch<T>(
  path: string,
  params: Record<string, string | number | undefined>,
): Promise<{ data: T | null; error?: string }> {
  const key = apiKey();
  if (!key) return { data: null, error: "not_configured" };

  const url = new URL(`${BASE}${path}`);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && String(value).trim()) {
      url.searchParams.set(name, String(value));
    }
  }

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "X-API-KEY": key },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
    if (!res.ok) return { data: null, error: `HTTP ${res.status}` };
    return { data: (await res.json()) as T };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Hunter request failed",
    };
  }
}

export async function hunterDomainSearch(args: {
  domain?: string | null;
  company?: string | null;
  limit?: number;
  type?: "personal" | "generic";
}): Promise<HunterDomainSearchResult> {
  if (!apiKey()) return { configured: false, results: [] };

  const domain = args.domain ? cleanDomain(args.domain) : undefined;
  const { data, error } = await hunterFetch<HunterDomainSearchResponse>(
    "/domain-search",
    {
      domain,
      company: args.company?.trim(),
      limit: Math.min(Math.max(args.limit ?? 5, 1), 10),
      type: args.type,
    },
  );

  const emails = data?.data?.emails ?? [];
  return {
    configured: true,
    domain: data?.data?.domain ?? domain ?? null,
    organization: data?.data?.organization ?? args.company ?? null,
    results: emails
      .filter((item) => Boolean(item.value))
      .slice(0, Math.min(Math.max(args.limit ?? 5, 1), 10))
      .map((item) => ({
        email: item.value!,
        type: item.type ?? null,
        confidence: item.confidence ?? null,
        firstName: item.first_name ?? null,
        lastName: item.last_name ?? null,
        position: item.position ?? null,
        department: item.department ?? null,
        seniority: item.seniority ?? null,
        sourceDomain: item.sources?.[0]?.domain ?? null,
      })),
    ...(error ? { error } : {}),
  };
}

export async function hunterEmailFinder(args: {
  domain?: string | null;
  company?: string | null;
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  maxDuration?: number;
}): Promise<HunterEmailFinderResult> {
  if (!apiKey()) return { configured: false, found: false };

  const domain = args.domain ? cleanDomain(args.domain) : undefined;
  const { data, error } = await hunterFetch<HunterEmailFinderResponse>(
    "/email-finder",
    {
      domain,
      company: args.company?.trim(),
      full_name: args.fullName?.trim(),
      first_name: args.firstName?.trim(),
      last_name: args.lastName?.trim(),
      max_duration: Math.min(Math.max(args.maxDuration ?? 5, 3), 20),
    },
  );

  const email = data?.data?.email ?? null;
  return {
    configured: true,
    found: Boolean(email),
    email,
    score: data?.data?.score ?? null,
    status: data?.data?.verification?.status ?? null,
    sources: (data?.data?.sources ?? [])
      .map((source) => source.uri ?? source.domain ?? null)
      .filter((source): source is string => Boolean(source)),
    ...(error ? { error } : {}),
  };
}

export async function hunterEmailVerifier(
  email: string,
): Promise<HunterEmailVerifierResult> {
  if (!apiKey()) return { configured: false, verified: false };

  const { data, error } = await hunterFetch<HunterEmailVerifierResponse>(
    "/email-verifier",
    { email: email.trim() },
  );
  const status = data?.data?.status ?? null;
  const result = data?.data?.result ?? null;
  return {
    configured: true,
    verified: status === "valid" || result === "deliverable",
    email: data?.data?.email ?? email,
    status,
    score: data?.data?.score ?? null,
    result,
    ...(error ? { error } : {}),
  };
}

/**
 * Company Enrichment (`/companies/find`) requires a domain. When only a company
 * name is provided we first resolve a domain via Domain Search, then enrich.
 */
export async function hunterCompanyEnrichment(args: {
  company?: string | null;
  domain?: string | null;
}): Promise<HunterCompanyEnrichmentResult> {
  if (!apiKey()) return { configured: false, domain: null, name: null };

  let domain = args.domain ? cleanDomain(args.domain) : "";
  if (!domain && args.company?.trim()) {
    const search = await hunterDomainSearch({
      company: args.company.trim(),
      limit: 1,
    });
    if (search.configured && search.domain) {
      domain = cleanDomain(search.domain);
    }
  }
  if (!domain) {
    return {
      configured: true,
      domain: null,
      name: args.company?.trim() || null,
      error: "domain_unresolved",
    };
  }

  const { data, error } = await hunterFetch<HunterCompanyEnrichmentResponse>(
    "/companies/find",
    { domain },
  );

  return {
    configured: true,
    domain: data?.data?.domain ?? domain,
    name: data?.data?.name ?? data?.data?.legalName ?? args.company?.trim() ?? null,
    ...(error ? { error } : {}),
  };
}

export const hunterDomainSearchTool = tool({
  description:
    "Search Hunter for email addresses associated with a company domain or company name. Prefer this before broad web search when an organisation email is missing.",
  inputSchema: z.object({
    domain: z
      .string()
      .nullable()
      .optional()
      .describe("Company domain, e.g. example.com or https://example.com."),
    company: z
      .string()
      .nullable()
      .optional()
      .describe("Company or organisation name when the domain is unknown."),
    limit: z.number().int().min(1).max(10).default(5),
    type: z.enum(["personal", "generic"]).optional(),
  }),
  execute: hunterDomainSearch,
});

export const hunterEmailFinderTool = tool({
  description:
    "Find the most likely email for a named person at a domain or company using Hunter. Use when you have a person's name plus an organisation.",
  inputSchema: z.object({
    domain: z.string().nullable().optional(),
    company: z.string().nullable().optional(),
    fullName: z.string().nullable().optional(),
    firstName: z.string().nullable().optional(),
    lastName: z.string().nullable().optional(),
    maxDuration: z.number().int().min(3).max(20).default(5),
  }),
  execute: hunterEmailFinder,
});

export const hunterEmailVerifierTool = tool({
  description:
    "Verify an email candidate with Hunter before storing or using it. Use for emails found outside Hunter or when confidence is unclear.",
  inputSchema: z.object({
    email: z.string().email(),
  }),
  execute: async ({ email }) => hunterEmailVerifier(email),
});

export const hunterCompanyEnrichmentTool = tool({
  description:
    "Resolve a company domain (and firmographic name) via Hunter Company Enrichment. Use when Domain Search did not return a domain for a known company name, or to confirm the organisation behind a domain before Email Finder.",
  inputSchema: z.object({
    company: z
      .string()
      .nullable()
      .optional()
      .describe("Company or organisation name when the domain is unknown."),
    domain: z
      .string()
      .nullable()
      .optional()
      .describe("Known company domain, e.g. example.com."),
  }),
  execute: hunterCompanyEnrichment,
});
