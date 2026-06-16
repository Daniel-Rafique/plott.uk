/**
 * PropertyData API client (server-only).
 * @see https://propertydata.co.uk/api/documentation
 */

import { hasPostcode } from "@/lib/address-format";

const PROPERTYDATA_BASE = "https://api.propertydata.co.uk";

function getKey(): string {
  const key = process.env.PROPERTYDATA_API_KEY;
  if (!key?.trim()) {
    throw new Error("PROPERTYDATA_API_KEY is not configured.");
  }
  return key.trim();
}

async function pdFetch(path: string, params: Record<string, string>): Promise<unknown> {
  const key = getKey();
  const url = new URL(`${PROPERTYDATA_BASE}${path}`);
  url.searchParams.set("key", key);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    next: { revalidate: 0 },
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(
      `PropertyData ${path} returned non-JSON (${res.status}): ${text.slice(0, 200)}`,
    );
  }
  if (!res.ok) {
    const msg =
      typeof json === "object" && json !== null && "message" in json
        ? String((json as { message?: string }).message)
        : text.slice(0, 300);
    throw new Error(`PropertyData ${path} failed (${res.status}): ${msg}`);
  }
  return json;
}

export type AddressMatchRow = {
  uprn?: string | number;
  address?: string;
  latitude?: number;
  longitude?: number;
  classificationCode?: string;
  classificationCodeDesc?: string;
};

export type AddressMatchResponse = {
  results?: AddressMatchRow[];
  status?: string;
  [key: string]: unknown;
};

export async function addressMatchUprn(address: string): Promise<AddressMatchResponse> {
  const trimmed = address.trim();
  if (!trimmed) throw new Error("Address is required.");
  // PropertyData /address-match-uprn rejects any address without a recognisable
  // UK postcode with a 400 "Postcode not recognised". Skip the HTTP call when
  // we know the address lacks a postcode — saves an API hit, avoids false-
  // positive errors in observability, and lets callers handle the empty result
  // the same way they handle a genuine no-match.
  if (!hasPostcode(trimmed)) {
    return { results: [], status: "no_postcode" };
  }
  const json = (await pdFetch("/address-match-uprn", {
    address: trimmed,
  })) as AddressMatchResponse;
  return json;
}

export type UprnTitleResponse = {
  title?: string;
  titles?: string[];
  freehold?: string;
  leasehold?: string[];
  status?: string;
  [key: string]: unknown;
};

export async function uprnTitle(uprn: string): Promise<UprnTitleResponse> {
  const u = String(uprn).trim();
  if (!u) throw new Error("UPRN is required.");
  return (await pdFetch("/uprn-title", { uprn: u })) as UprnTitleResponse;
}

export type TitleDetailsResponse = {
  title?: string;
  ownership_type?: string;
  /** Corporate owner details when applicable */
  owner?: unknown;
  corporate_owner?: unknown;
  company_owned?: boolean;
  [key: string]: unknown;
}

export async function titleDetails(titleNumber: string): Promise<TitleDetailsResponse> {
  const t = titleNumber.trim();
  if (!t) throw new Error("Title number is required.");
  return (await pdFetch("/title", { title: t })) as TitleDetailsResponse;
}

export type LandRegistryDocumentsParams = {
  title: string;
  /** e.g. "register", "plan", "both" — per PropertyData docs */
  documents: string;
  extract_proprietor_data?: boolean;
  allow_repurchases?: boolean;
  /** Simulated response without charge */
  test?: "true" | "out_of_hours" | "false";
};

export type LandRegistryDocumentsResponse = {
  document_status?: string;
  document_url?: string;
  proprietor_data_url?: string;
  proprietor_data?: unknown;
  pending_until?: string;
  [key: string]: unknown;
};

export async function landRegistryDocuments(
  params: LandRegistryDocumentsParams,
): Promise<LandRegistryDocumentsResponse> {
  const q: Record<string, string> = {
    title: params.title,
    documents: params.documents,
  };
  if (params.extract_proprietor_data) q.extract_proprietor_data = "true";
  if (params.allow_repurchases) q.allow_repurchases = "true";
  if (params.test) q.test = params.test;
  return (await pdFetch("/land-registry-documents", q)) as LandRegistryDocumentsResponse;
}

/**
 * Fetch JSON from proprietor_data_url when Land Registry processing completes.
 */
export async function fetchProprietorDataJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 0 },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Proprietor data URL returned ${res.status}: ${text.slice(0, 200)}`,
    );
  }
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Proprietor data URL returned non-JSON: ${text.slice(0, 200)}`);
  }
}
