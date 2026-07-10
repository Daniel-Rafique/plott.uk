/**
 * Contact quality gates for postal and email outreach.
 */

import { captureServerEvent } from "@/lib/posthog-server";

const UK_POSTCODE =
  /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i;

const UK_POSTCODE_TRAILING =
  /^(.+?)\s+([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})$/i;

export function splitPostalLines(raw: string): string[] {
  return raw
    .split(/\n|,/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function normalizePostalKey(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().toUpperCase();
}

/** True when two address strings refer to the same location (ignoring line breaks). */
export function postalAddressesEquivalent(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = normalizePostalKey(a ?? "");
  const right = normalizePostalKey(b ?? "");
  return left.length > 0 && left === right;
}

/**
 * Split single-line UK addresses before the postcode so validation and
 * rendering can treat street and postcode as separate lines.
 */
export function formatUkPostalAddressLines(
  addressLines: string | null | undefined,
): string {
  const raw = (addressLines ?? "").trim();
  if (!raw) return "";

  const lines = splitPostalLines(raw);
  if (lines.length >= 2) return lines.join("\n");

  const match = raw.match(UK_POSTCODE_TRAILING);
  if (match) {
    const street = match[1].trim();
    const postcode = match[2].replace(/\s+/g, " ").toUpperCase();
    if (street.length >= 3) return `${street}\n${postcode}`;
  }

  return raw;
}

const WEAK_EMAIL_STATUSES = new Set([
  "invalid",
  "undeliverable",
  "do_not_mail",
  "risky",
  "unknown",
]);

export type PostalContactCheck = {
  ok: boolean;
  blocking: boolean;
  code: string;
  message: string;
};

export type EmailContactCheck = {
  ok: boolean;
  blocking: boolean;
  code: string;
  message: string;
  preferredEmail: string | null;
  preferredSource: "contact" | "agent" | "applicant" | null;
};

export function assessPostalAddress(addressLines: string | null | undefined): PostalContactCheck {
  const raw = formatUkPostalAddressLines(addressLines);
  if (!raw || raw.length < 8) {
    return {
      ok: false,
      blocking: true,
      code: "address_missing",
      message: "Add a usable postal address (street and postcode) before printing or marking sent.",
    };
  }
  const lines = splitPostalLines(raw);
  if (lines.length < 2) {
    return {
      ok: false,
      blocking: true,
      code: "address_too_thin",
      message: "Postal address needs at least two lines (e.g. street and town/postcode).",
    };
  }
  if (!UK_POSTCODE.test(raw)) {
    return {
      ok: false,
      blocking: false,
      code: "postcode_missing",
      message: "No UK postcode detected — double-check the address before sending.",
    };
  }
  return {
    ok: true,
    blocking: false,
    code: "address_ok",
    message: "Address looks usable.",
  };
}

function normalizeEmail(email: string | null | undefined): string | null {
  const t = email?.trim().toLowerCase() ?? "";
  if (!t || !t.includes("@")) return null;
  return t;
}

function emailStatusOk(status: string | null | undefined): boolean {
  if (!status) return true;
  return !WEAK_EMAIL_STATUSES.has(status.trim().toLowerCase());
}

/**
 * Prefer agent email when applicant email is missing or weak.
 */
function contactIsWeakApplicant(args: {
  contact: string;
  applicant: string | null;
  contactKind?: string | null;
  applicantWeak: boolean;
}): boolean {
  if (!args.applicantWeak) return false;
  if (args.contactKind === "applicant") return true;
  return args.applicant != null && args.contact === args.applicant;
}

export function assessEmailContact(args: {
  contactEmail?: string | null;
  contactKind?: string | null;
  agentEmail?: string | null;
  applicantEmail?: string | null;
  applicantEmailStatus?: string | null;
  applicantEmailConfidence?: number | null;
  force?: boolean;
}): EmailContactCheck {
  const contact = normalizeEmail(args.contactEmail);
  const agent = normalizeEmail(args.agentEmail);
  const applicant = normalizeEmail(args.applicantEmail);
  const applicantWeak =
    !applicant ||
    !emailStatusOk(args.applicantEmailStatus) ||
    (args.applicantEmailConfidence != null &&
      args.applicantEmailConfidence < 50);

  let preferredEmail: string | null = null;
  let preferredSource: EmailContactCheck["preferredSource"] = null;

  if (
    contact &&
    contactIsWeakApplicant({ contact, applicant, contactKind: args.contactKind, applicantWeak }) &&
    !args.force
  ) {
    return {
      ok: false,
      blocking: true,
      code: "email_low_confidence",
      message:
        "Applicant email looks weak. Prefer the agent email, re-enrich, or override to send anyway.",
      preferredEmail: agent ?? contact,
      preferredSource: agent ? "agent" : "applicant",
    };
  }

  if (contact) {
    preferredEmail = contact;
    if (agent && contact === agent) {
      preferredSource = "agent";
    } else if (applicant && contact === applicant) {
      preferredSource = "applicant";
    } else if (args.contactKind === "agent") {
      preferredSource = "agent";
    } else if (args.contactKind === "applicant") {
      preferredSource = "applicant";
    } else {
      preferredSource = "contact";
    }
  } else if (applicantWeak && agent) {
    preferredEmail = agent;
    preferredSource = "agent";
  } else if (applicant && !applicantWeak) {
    preferredEmail = applicant;
    preferredSource = "applicant";
  } else if (agent) {
    preferredEmail = agent;
    preferredSource = "agent";
  }

  if (!preferredEmail) {
    return {
      ok: false,
      blocking: !args.force,
      code: "email_missing",
      message: "No usable recipient email. Re-enrich the lead or send by post instead.",
      preferredEmail: null,
      preferredSource: null,
    };
  }

  if (
    preferredSource === "applicant" &&
    applicantWeak &&
    !args.force
  ) {
    return {
      ok: false,
      blocking: true,
      code: "email_low_confidence",
      message:
        "Applicant email looks weak. Prefer the agent email, re-enrich, or override to send anyway.",
      preferredEmail: agent ?? preferredEmail,
      preferredSource: agent ? "agent" : preferredSource,
    };
  }

  return {
    ok: true,
    blocking: false,
    code: "email_ok",
    message: "Email looks usable.",
    preferredEmail,
    preferredSource,
  };
}

export async function trackContactBlocked(args: {
  distinctId?: string;
  companyId: string;
  channel: "print" | "email";
  code: string;
}) {
  if (!args.distinctId) return;
  await captureServerEvent({
    distinctId: args.distinctId,
    event: "outreach_blocked_incomplete_contact",
    properties: {
      company_id: args.companyId,
      channel: args.channel,
      code: args.code,
    },
  });
}
