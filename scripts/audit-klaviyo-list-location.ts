/**
 * Audits Klaviyo list membership by imported Location column.
 *
 * Dry run:
 *   tsx scripts/audit-klaviyo-list-location.ts
 *
 * Apply removals from list membership only:
 *   tsx scripts/audit-klaviyo-list-location.ts --apply
 */

import { config as loadEnv } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), ".env.local"), override: true });

type Classification = "keep" | "remove_missing_location" | "remove_non_gb_eng_location";

type KlaviyoProfile = {
  id: string;
  type: "profile";
  attributes?: {
    email?: string | null;
    location?: unknown;
    properties?: Record<string, unknown> | null;
    [key: string]: unknown;
  };
};

type KlaviyoListProfilesResponse = {
  data: KlaviyoProfile[];
  links?: {
    next?: string | null;
  };
};

type AuditProfile = {
  id: string;
  email: string | null;
  classification: Classification;
  locationSource: string | null;
  locationValue: string | null;
};

type AuditReport = {
  generatedAt: string;
  listId: string;
  dryRun: boolean;
  totals: Record<Classification | "scanned" | "remove_total", number>;
  samples: Record<Classification, AuditProfile[]>;
  removableProfiles: AuditProfile[];
};

const LIST_ID = "WiMJtg";
const API_BASE_URL = "https://a.klaviyo.com/api";
const DEFAULT_KLAVIYO_API_REVISION = "2026-04-15";
const PAGE_SIZE = 100;
const REMOVE_BATCH_SIZE = 1000;
const REPORT_PATH = resolve(process.cwd(), "tmp/klaviyo-list-WiMJtg-audit.json");
const GB_ENG_PATTERN = /(^|[^a-z0-9])gb-eng([^a-z0-9]|$)/i;
const LOCATION_KEYS = new Set(["location"]);

function parseArgs(argv: string[]) {
  return {
    apply: argv.includes("--apply"),
  };
}

function klaviyoConfig() {
  const apiKey = process.env.KLAVIYO_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("KLAVIYO_API_KEY is not set (.env or .env.local).");
  }

  return {
    apiKey,
    revision: process.env.KLAVIYO_API_REVISION ?? DEFAULT_KLAVIYO_API_REVISION,
  };
}

function klaviyoHeaders(config: { apiKey: string; revision: string }) {
  return {
    Authorization: `Klaviyo-API-Key ${config.apiKey}`,
    Accept: "application/vnd.api+json",
    "Content-Type": "application/vnd.api+json",
    revision: config.revision,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePropertyKey(key: string) {
  return key.trim().toLowerCase();
}

function flattenStrings(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }

  if (Array.isArray(value)) {
    return value.flatMap(flattenStrings);
  }

  if (isRecord(value)) {
    return Object.values(value).flatMap(flattenStrings);
  }

  return [];
}

function displayValue(value: unknown) {
  const strings = flattenStrings(value);
  if (strings.length > 0) return strings.join(" | ");
  return null;
}

function findLocation(profile: KlaviyoProfile): {
  source: string | null;
  value: unknown;
  display: string | null;
} {
  const properties = profile.attributes?.properties;

  if (isRecord(properties)) {
    for (const [key, value] of Object.entries(properties)) {
      if (LOCATION_KEYS.has(normalizePropertyKey(key))) {
        return {
          source: `properties.${key}`,
          value,
          display: displayValue(value),
        };
      }
    }
  }

  if (profile.attributes && "location" in profile.attributes) {
    const value = profile.attributes.location;
    return {
      source: "attributes.location",
      value,
      display: displayValue(value),
    };
  }

  return {
    source: null,
    value: null,
    display: null,
  };
}

function classifyProfile(profile: KlaviyoProfile): AuditProfile {
  const location = findLocation(profile);
  const locationStrings = flattenStrings(location.value);
  const hasLocation = locationStrings.length > 0;
  const hasGbEngLocation = locationStrings.some((value) => GB_ENG_PATTERN.test(value));

  const classification: Classification = !hasLocation
    ? "remove_missing_location"
    : hasGbEngLocation
      ? "keep"
      : "remove_non_gb_eng_location";

  return {
    id: profile.id,
    email: profile.attributes?.email ?? null,
    classification,
    locationSource: location.source,
    locationValue: location.display,
  };
}

async function klaviyoJson<T>(url: string, init: RequestInit, context: string): Promise<T> {
  const response = await fetch(url, init);

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`${context} failed: ${response.status} ${body}`);
  }

  return (await response.json()) as T;
}

async function fetchListProfiles(config: { apiKey: string; revision: string }) {
  const profiles: KlaviyoProfile[] = [];
  let nextUrl: string | null =
    `${API_BASE_URL}/lists/${LIST_ID}/profiles/?page[size]=${PAGE_SIZE}`;

  while (nextUrl) {
    const page = await klaviyoJson<KlaviyoListProfilesResponse>(
      nextUrl,
      {
        headers: klaviyoHeaders(config),
      },
      "Klaviyo list profile fetch",
    );

    profiles.push(...page.data);
    console.log(`Fetched ${profiles.length} profiles...`);
    nextUrl = page.links?.next ?? null;
  }

  return profiles;
}

function buildReport(auditProfiles: AuditProfile[], dryRun: boolean): AuditReport {
  const totals = {
    scanned: auditProfiles.length,
    keep: auditProfiles.filter((profile) => profile.classification === "keep").length,
    remove_missing_location: auditProfiles.filter(
      (profile) => profile.classification === "remove_missing_location",
    ).length,
    remove_non_gb_eng_location: auditProfiles.filter(
      (profile) => profile.classification === "remove_non_gb_eng_location",
    ).length,
    remove_total: auditProfiles.filter((profile) => profile.classification !== "keep").length,
  };

  return {
    generatedAt: new Date().toISOString(),
    listId: LIST_ID,
    dryRun,
    totals,
    samples: {
      keep: auditProfiles.filter((profile) => profile.classification === "keep").slice(0, 10),
      remove_missing_location: auditProfiles
        .filter((profile) => profile.classification === "remove_missing_location")
        .slice(0, 10),
      remove_non_gb_eng_location: auditProfiles
        .filter((profile) => profile.classification === "remove_non_gb_eng_location")
        .slice(0, 10),
    },
    removableProfiles: auditProfiles.filter((profile) => profile.classification !== "keep"),
  };
}

function writeReport(report: AuditReport) {
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote audit report: ${REPORT_PATH}`);
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function removeProfilesFromList(
  config: { apiKey: string; revision: string },
  profiles: AuditProfile[],
) {
  const batches = chunk(profiles, REMOVE_BATCH_SIZE);
  let removed = 0;

  for (const [index, batch] of batches.entries()) {
    const response = await fetch(`${API_BASE_URL}/lists/${LIST_ID}/relationships/profiles/`, {
      method: "DELETE",
      headers: klaviyoHeaders(config),
      body: JSON.stringify({
        data: batch.map((profile) => ({
          type: "profile",
          id: profile.id,
        })),
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Klaviyo profile removal failed: ${response.status} ${body}`);
    }

    removed += batch.length;
    console.log(`Removed batch ${index + 1}/${batches.length}: ${batch.length} profiles`);
  }

  return removed;
}

function printSummary(report: AuditReport) {
  console.log("");
  console.log("Klaviyo list audit summary");
  console.log(`List: ${report.listId}`);
  console.log(`Mode: ${report.dryRun ? "dry-run" : "apply"}`);
  console.log(`Scanned: ${report.totals.scanned}`);
  console.log(`Keep: ${report.totals.keep}`);
  console.log(`Remove missing Location: ${report.totals.remove_missing_location}`);
  console.log(`Remove non-GB-ENG Location: ${report.totals.remove_non_gb_eng_location}`);
  console.log(`Remove total: ${report.totals.remove_total}`);
  console.log("");
  console.log("Sample removable profiles:");
  for (const profile of report.removableProfiles.slice(0, 10)) {
    console.log(
      `- ${profile.email ?? profile.id}: ${profile.classification}, ${profile.locationValue ?? "no location"}`,
    );
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const config = klaviyoConfig();
  const profiles = await fetchListProfiles(config);
  const auditProfiles = profiles.map(classifyProfile);
  const report = buildReport(auditProfiles, !args.apply);

  printSummary(report);
  writeReport(report);

  if (!args.apply) {
    console.log("");
    console.log("Dry run only. Re-run with --apply to remove profiles from this list.");
    return;
  }

  if (report.removableProfiles.length === 0) {
    console.log("No profiles need to be removed.");
    return;
  }

  const removed = await removeProfilesFromList(config, report.removableProfiles);
  console.log(`Removed ${removed} profiles from list ${LIST_ID}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
