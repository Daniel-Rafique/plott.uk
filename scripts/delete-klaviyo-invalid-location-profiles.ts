/**
 * Deletes Klaviyo profiles whose imported Location value is missing or is not GB-ENG.
 *
 * Dry run:
 *   tsx scripts/delete-klaviyo-invalid-location-profiles.ts
 *
 * Apply GDPR-style profile deletion jobs:
 *   tsx scripts/delete-klaviyo-invalid-location-profiles.ts --apply
 */

import { config as loadEnv } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { dirname, resolve } from "node:path";

loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), ".env.local"), override: true });

type Classification = "keep" | "delete_missing_location" | "delete_non_gb_eng_location";

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

type KlaviyoProfilesResponse = {
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
  dryRun: boolean;
  totals: Record<Classification | "scanned" | "delete_total", number>;
  samples: Record<Classification, AuditProfile[]>;
  deletableProfiles: AuditProfile[];
};

const API_BASE_URL = "https://a.klaviyo.com/api";
const DEFAULT_KLAVIYO_API_REVISION = "2026-04-15";
const PAGE_SIZE = 100;
const DELETE_DELAY_MS = 1100;
const REPORT_PATH = resolve(process.cwd(), "tmp/klaviyo-invalid-location-profile-delete-audit.json");
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
    ? "delete_missing_location"
    : hasGbEngLocation
      ? "keep"
      : "delete_non_gb_eng_location";

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

async function fetchProfiles(config: { apiKey: string; revision: string }) {
  const profiles: KlaviyoProfile[] = [];
  let nextUrl: string | null =
    `${API_BASE_URL}/profiles/?page[size]=${PAGE_SIZE}&fields[profile]=email,location,properties`;

  while (nextUrl) {
    const page: KlaviyoProfilesResponse = await klaviyoJson(
      nextUrl,
      {
        headers: klaviyoHeaders(config),
      },
      "Klaviyo profile fetch",
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
    delete_missing_location: auditProfiles.filter(
      (profile) => profile.classification === "delete_missing_location",
    ).length,
    delete_non_gb_eng_location: auditProfiles.filter(
      (profile) => profile.classification === "delete_non_gb_eng_location",
    ).length,
    delete_total: auditProfiles.filter((profile) => profile.classification !== "keep").length,
  };

  return {
    generatedAt: new Date().toISOString(),
    dryRun,
    totals,
    samples: {
      keep: auditProfiles.filter((profile) => profile.classification === "keep").slice(0, 10),
      delete_missing_location: auditProfiles
        .filter((profile) => profile.classification === "delete_missing_location")
        .slice(0, 10),
      delete_non_gb_eng_location: auditProfiles
        .filter((profile) => profile.classification === "delete_non_gb_eng_location")
        .slice(0, 10),
    },
    deletableProfiles: auditProfiles.filter((profile) => profile.classification !== "keep"),
  };
}

function writeReport(report: AuditReport) {
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote audit report: ${REPORT_PATH}`);
}

function retryAfterMs(response: Response) {
  const retryAfter = response.headers.get("retry-after");
  if (!retryAfter) return null;

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) return Math.max(seconds * 1000, DELETE_DELAY_MS);

  const dateMs = Date.parse(retryAfter);
  if (Number.isFinite(dateMs)) return Math.max(dateMs - Date.now(), DELETE_DELAY_MS);

  return null;
}

async function requestProfileDeletion(
  config: { apiKey: string; revision: string },
  profile: AuditProfile,
) {
  const body = JSON.stringify({
    data: {
      type: "data-privacy-deletion-job",
      attributes: {
        profile: {
          data: {
            type: "profile",
            id: profile.id,
          },
        },
      },
    },
  });

  for (let attempt = 1; attempt <= 5; attempt++) {
    const response = await fetch(`${API_BASE_URL}/data-privacy-deletion-jobs`, {
      method: "POST",
      headers: klaviyoHeaders(config),
      body,
    });

    if (response.ok) return;

    if (response.status === 404) {
      console.warn(`Profile already deleted: ${profile.email ?? profile.id}`);
      return;
    }

    if (response.status === 429 || response.status >= 500) {
      const waitMs = retryAfterMs(response) ?? DELETE_DELAY_MS * attempt;
      console.warn(
        `Deletion job retry ${attempt}/5 for ${profile.email ?? profile.id} after ${waitMs}ms`,
      );
      await sleep(waitMs);
      continue;
    }

    const responseBody = await response.text().catch(() => "");
    throw new Error(
      `Klaviyo deletion job failed for ${profile.email ?? profile.id}: ${response.status} ${responseBody}`,
    );
  }

  throw new Error(`Klaviyo deletion job failed after retries for ${profile.email ?? profile.id}`);
}

async function deleteProfiles(config: { apiKey: string; revision: string }, profiles: AuditProfile[]) {
  let submitted = 0;

  for (const profile of profiles) {
    await requestProfileDeletion(config, profile);
    submitted += 1;

    if (submitted % 25 === 0 || submitted === profiles.length) {
      console.log(`Submitted deletion jobs: ${submitted}/${profiles.length}`);
    }

    await sleep(DELETE_DELAY_MS);
  }

  return submitted;
}

function printSummary(report: AuditReport) {
  console.log("");
  console.log("Klaviyo invalid-location profile deletion audit");
  console.log(`Mode: ${report.dryRun ? "dry-run" : "apply"}`);
  console.log(`Scanned: ${report.totals.scanned}`);
  console.log(`Keep: ${report.totals.keep}`);
  console.log(`Delete missing Location: ${report.totals.delete_missing_location}`);
  console.log(`Delete non-GB-ENG Location: ${report.totals.delete_non_gb_eng_location}`);
  console.log(`Delete total: ${report.totals.delete_total}`);
  console.log("");
  console.log("Sample deletable profiles:");
  for (const profile of report.deletableProfiles.slice(0, 10)) {
    console.log(
      `- ${profile.email ?? profile.id}: ${profile.classification}, ${profile.locationValue ?? "no location"}`,
    );
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const config = klaviyoConfig();
  const profiles = await fetchProfiles(config);
  const auditProfiles = profiles.map(classifyProfile);
  const report = buildReport(auditProfiles, !args.apply);

  printSummary(report);
  writeReport(report);

  if (!args.apply) {
    console.log("");
    console.log("Dry run only. Re-run with --apply to request permanent Klaviyo profile deletion.");
    return;
  }

  if (report.deletableProfiles.length === 0) {
    console.log("No profiles need deletion.");
    return;
  }

  const submitted = await deleteProfiles(config, report.deletableProfiles);
  console.log(`Submitted ${submitted} Klaviyo profile deletion jobs.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
