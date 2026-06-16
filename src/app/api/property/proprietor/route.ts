import { NextResponse } from "next/server";
import { requireSubscribedTenant } from "@/lib/tenant";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import {
  addressMatchUprn,
  fetchProprietorDataJson,
  landRegistryDocuments,
  titleDetails,
  uprnTitle,
  type AddressMatchRow,
  type TitleDetailsResponse,
} from "@/lib/propertydata";
import { ukAddressSearchVariants, hasPostcode } from "@/lib/address-format";

export const runtime = "nodejs";
export const maxDuration = 180;

type Body = {
  address?: string;
  postcode?: string;
  purchaseDocuments?: boolean;
};

function pickTitleNumber(ut: Awaited<ReturnType<typeof uprnTitle>>): string | null {
  if (typeof ut.freehold === "string" && ut.freehold.trim()) {
    return ut.freehold.trim();
  }
  if (Array.isArray(ut.leasehold) && ut.leasehold.length > 0) {
    const first = ut.leasehold[0];
    if (typeof first === "string" && first.trim()) return first.trim();
  }
  if (typeof ut.title === "string" && ut.title.trim()) {
    return ut.title.trim();
  }
  if (Array.isArray(ut.titles) && ut.titles.length > 0) {
    const t = ut.titles[0];
    if (typeof t === "string" && t.trim()) return t.trim();
  }
  return null;
}

function extractCorporateName(td: TitleDetailsResponse): string | null {
  const tryStr = (v: unknown): string | null => {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (v && typeof v === "object" && "name" in v) {
      const n = (v as { name?: unknown }).name;
      if (typeof n === "string" && n.trim()) return n.trim();
    }
    return null;
  };

  const o = tryStr(td.corporate_owner);
  if (o) return o;
  const o2 = tryStr(td.owner);
  if (o2) return o2;

  if (td.company_owned === true) {
    const o3 = tryStr((td as { owners?: unknown }).owners);
    if (o3) return o3;
  }

  return null;
}

function extractNamesFromProprietorJson(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const out: string[] = [];
  const o = data as Record<string, unknown>;

  if (typeof o.proprietor_name === "string" && o.proprietor_name.trim()) {
    out.push(o.proprietor_name.trim());
  }
  if (Array.isArray(o.proprietors)) {
    for (const p of o.proprietors) {
      if (typeof p === "string" && p.trim()) out.push(p.trim());
      else if (p && typeof p === "object" && "name" in p) {
        const n = (p as { name?: unknown }).name;
        if (typeof n === "string" && n.trim()) out.push(n.trim());
      }
    }
  }
  if (typeof o.name === "string" && o.name.trim()) {
    out.push(o.name.trim());
  }
  return [...new Set(out)];
}

function addressMatchRows(match: Record<string, unknown>): AddressMatchRow[] {
  if (Array.isArray(match.results)) return match.results as AddressMatchRow[];
  if (Array.isArray(match.data)) return match.data as AddressMatchRow[];
  if (Array.isArray(match.matches)) return match.matches as AddressMatchRow[];
  return [];
}

async function addressMatchUprnWithVariants(
  address: string,
): Promise<{
  rows: AddressMatchRow[];
  tried: string[];
  lastMatch: Record<string, unknown> | null;
  apiError?: string;
}> {
  const tried = ukAddressSearchVariants(address);
  let lastMatch: Record<string, unknown> | null = null;
  let lastApiError: string | undefined;
  for (const line of tried) {
    try {
      const match = (await addressMatchUprn(line)) as Record<string, unknown>;
      lastMatch = match;
      const results = addressMatchRows(match);
      if (results.length > 0) {
        return { rows: results, tried, lastMatch };
      }
    } catch (err) {
      // PropertyData returns 400 "Postcode not recognised" when no postcode is
      // present. Treat each variant failure as "no match" rather than aborting
      // the whole loop so we can still try reformatted variants.
      lastApiError =
        err instanceof Error ? err.message : "Unknown PropertyData error";
    }
  }
  return { rows: [], tried, lastMatch, apiError: lastApiError };
}

async function pollProprietorDataUrl(
  url: string,
  maxMs: number,
  intervalMs: number,
): Promise<{ names: string[]; raw?: unknown } | null> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const json = await fetchProprietorDataJson(url);
      const names = extractNamesFromProprietorJson(json);
      if (names.length > 0) return { names, raw: json };
    } catch {
      /* not ready yet */
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

export async function POST(req: Request) {
  const gate = await requireSubscribedTenant();
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  const rl = await checkRateLimit("proprietor", gate.ctx.user.id);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawAddress = typeof body.address === "string" ? body.address.trim() : "";
  if (!rawAddress) {
    return NextResponse.json({ error: "Missing address" }, { status: 400 });
  }

  // When the caller supplies a separate postcode (e.g. from PlanWire) and the
  // address string doesn't already contain one, append it so PropertyData can
  // match the UPRN.
  const suppliedPc = typeof body.postcode === "string" ? body.postcode.trim() : "";
  let address = rawAddress;
  if (suppliedPc && !hasPostcode(rawAddress)) {
    address = `${rawAddress}, ${suppliedPc}`;
  }

  const purchaseDocuments = Boolean(body.purchaseDocuments);
  const warnings: string[] = [];

  try {
    const { rows: results, tried, apiError } = await addressMatchUprnWithVariants(address);
    if (results.length === 0) {
      // Distinguish between "no postcode supplied" (a fixable input problem)
      // and "searched but found nothing" so the UI can show a targeted message.
      const missingPostcode = !hasPostcode(address);
      const noPostcodeHint = missingPostcode
        ? "The address doesn't appear to include a UK postcode. " +
          "PropertyData requires a postcode to look up a UPRN — paste the full address including postcode (e.g. from the planning portal or Royal Mail) and try again."
        : null;

      const genericHint =
        "No UPRN match for this address. PropertyData matches best with comma-separated lines and a full UK postcode. " +
        (tried.length > 1
          ? `Tried ${tried.length} formatted variants; you can paste the address from a clearer source (e.g. title deed).`
          : "Try commas between street, town, and postcode.");

      return NextResponse.json({
        uprn: null,
        titleNumber: null,
        corporateOwner: null,
        proprietorName: null,
        proprietorNames: [] as string[],
        proprietorSource: "none" as const,
        pending: false,
        warnings: [noPostcodeHint ?? genericHint],
        ...(apiError ? { apiError } : {}),
      });
    }

    const first = results[0];
    const uprn = first.uprn != null ? String(first.uprn) : null;
    if (!uprn) {
      warnings.push("Matched row had no UPRN.");
      return NextResponse.json({
        uprn: null,
        titleNumber: null,
        corporateOwner: null,
        proprietorName: null,
        proprietorNames: [],
        proprietorSource: "none" as const,
        pending: false,
        warnings,
      });
    }

    const ut = await uprnTitle(uprn);
    const titleNumber = pickTitleNumber(ut);
    if (!titleNumber) {
      warnings.push("Could not resolve a Land Registry title for this UPRN.");
      return NextResponse.json({
        uprn,
        titleNumber: null,
        corporateOwner: null,
        proprietorName: null,
        proprietorNames: [],
        proprietorSource: "none" as const,
        pending: false,
        warnings,
      });
    }

    const td = await titleDetails(titleNumber);
    const corporate = extractCorporateName(td);
    if (corporate) {
      return NextResponse.json({
        uprn,
        titleNumber,
        matchedAddress: first.address ?? null,
        corporateOwner: corporate,
        proprietorName: corporate,
        proprietorNames: [corporate],
        proprietorSource: "title_corporate" as const,
        pending: false,
        warnings,
      });
    }

    if (!purchaseDocuments) {
      warnings.push(
        "No corporate owner on title. Purchase a Land Registry extract (paid) to read registered proprietor names for individuals.",
      );
      return NextResponse.json({
        uprn,
        titleNumber,
        matchedAddress: first.address ?? null,
        corporateOwner: null,
        proprietorName: null,
        proprietorNames: [],
        proprietorSource: "needs_purchase" as const,
        pending: false,
        warnings,
      });
    }

    const lr = await landRegistryDocuments({
      title: titleNumber,
      documents: "both",
      extract_proprietor_data: true,
      allow_repurchases: true,
    });

    if (lr.proprietor_data) {
      const names = extractNamesFromProprietorJson(lr.proprietor_data);
      const primary = names[0] ?? null;
      return NextResponse.json({
        uprn,
        titleNumber,
        matchedAddress: first.address ?? null,
        corporateOwner: null,
        proprietorName: primary,
        proprietorNames: names,
        proprietorSource: "land_registry_extract" as const,
        pending: false,
        landRegistry: {
          document_status: lr.document_status,
          document_url: lr.document_url,
        },
        warnings,
      });
    }

    const pUrl =
      typeof lr.proprietor_data_url === "string" ? lr.proprietor_data_url : null;
    if (pUrl) {
      const polled = await pollProprietorDataUrl(pUrl, 120_000, 4000);
      if (polled?.names.length) {
        return NextResponse.json({
          uprn,
          titleNumber,
          matchedAddress: first.address ?? null,
          corporateOwner: null,
          proprietorName: polled.names[0],
          proprietorNames: polled.names,
          proprietorSource: "land_registry_extract" as const,
          pending: false,
          warnings,
        });
      }
    }

    return NextResponse.json({
      uprn,
      titleNumber,
      matchedAddress: first.address ?? null,
      corporateOwner: null,
      proprietorName: null,
      proprietorNames: [],
      proprietorSource: "land_registry_extract" as const,
      pending: Boolean(
        String(lr.document_status ?? "").toLowerCase() === "pending",
      ),
      landRegistry: {
        document_status: lr.document_status,
        document_url: lr.document_url,
        proprietor_data_url: lr.proprietor_data_url,
      },
      warnings: [
        ...warnings,
        "Land Registry documents were requested; proprietor names could not be read yet. Check PropertyData for pending purchases or try again later.",
      ],
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    // Surface PropertyData errors as a 200 with a warning rather than a 5xx
    // so the client can display a helpful message rather than a generic failure.
    if (
      message.includes("Postcode not recognised") ||
      message.includes("address-match-uprn")
    ) {
      return NextResponse.json({
        uprn: null,
        titleNumber: null,
        corporateOwner: null,
        proprietorName: null,
        proprietorNames: [] as string[],
        proprietorSource: "none" as const,
        pending: false,
        warnings: [
          "The address doesn't include a recognised UK postcode. " +
            "Add the postcode (e.g. NW1 8AN) and try again.",
        ],
        apiError: message,
      });
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
