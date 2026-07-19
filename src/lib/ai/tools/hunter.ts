/**
 * Hunter.io enrichment tools. These are server-only helpers for structured
 * email discovery; they deliberately fail closed when the API key is absent.
 *
 * Architecture decision: Plott calls Hunter via this REST client only.
 * Do not wire Hunter MCP (https://mcp.hunter.io/mcp) into enrichment,
 * research, or outreach agents — extend this module for new endpoints.
 * MCP remains fine for external assistants (Claude / ChatGPT / Cursor)
 * on the same Hunter plan; see AGENTS.md “Hunter.io (enrichment)”.
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

/** Business-relevant person fields from Hunter `/people/find`. */
export type HunterPersonData = {
  email: string;
  firstName: string | null;
  lastName: string | null;
  position: string | null;
  seniority: string | null;
  department: string | null;
  employer: string | null;
  linkedin: string | null;
  twitter: string | null;
  location: string | null;
};

export type HunterPersonEnrichmentResult =
  | {
      configured: false;
      found: false;
      person: null;
    }
  | {
      configured: true;
      found: boolean;
      person: HunterPersonData | null;
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

type HunterPersonEnrichmentResponse = {
  data?: {
    email?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    location?: string | null;
    employment?: {
      title?: string | null;
      role?: string | null;
      seniority?: string | null;
      department?: string | null;
      name?: string | null;
      domain?: string | null;
    } | null;
    linkedin?: { handle?: string | null } | null;
    twitter?: string | null;
  } | null;
};

function linkedinUrlFromHandle(handle: string | null | undefined): string | null {
  const cleaned = handle?.trim().replace(/^@/, "") ?? "";
  if (!cleaned) return null;
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  return `https://linkedin.com/in/${cleaned.replace(/^in\//i, "")}`;
}

function mapPersonData(
  email: string,
  data: NonNullable<HunterPersonEnrichmentResponse["data"]>,
): HunterPersonData {
  return {
    email: data.email ?? email,
    firstName: data.first_name ?? null,
    lastName: data.last_name ?? null,
    position: data.employment?.title ?? data.employment?.role ?? null,
    seniority: data.employment?.seniority ?? null,
    department: data.employment?.department ?? null,
    employer: data.employment?.name ?? null,
    linkedin: linkedinUrlFromHandle(data.linkedin?.handle),
    twitter: data.twitter ?? null,
    location: data.location ?? null,
  };
}

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

/**
 * Person Enrichment (`/people/find`) looks up title, seniority, employer and
 * LinkedIn from a known email. Fail closed when the API key is absent.
 */
export async function hunterPersonEnrichment(args: {
  email: string;
}): Promise<HunterPersonEnrichmentResult> {
  if (!apiKey()) return { configured: false, found: false, person: null };

  const email = args.email.trim().toLowerCase();
  if (!email.includes("@")) {
    return { configured: true, found: false, person: null, error: "invalid_email" };
  }

  const { data, error } = await hunterFetch<HunterPersonEnrichmentResponse>(
    "/people/find",
    { email },
  );

  const payload = data?.data ?? null;
  if (!payload) {
    return {
      configured: true,
      found: false,
      person: null,
      ...(error ? { error } : {}),
    };
  }

  return {
    configured: true,
    found: true,
    person: mapPersonData(email, payload),
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

export const hunterPersonEnrichmentTool = tool({
  description:
    "Enrich a person from a known email via Hunter Person Enrichment. Returns job title, seniority, employer, LinkedIn and location. Use when you already have a verified email and need role context for outreach or a research briefing.",
  inputSchema: z.object({
    email: z.string().email().describe("Email address to enrich."),
  }),
  execute: async ({ email }) => hunterPersonEnrichment({ email }),
});
