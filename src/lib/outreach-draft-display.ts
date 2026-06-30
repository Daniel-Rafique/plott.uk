import type { Prisma } from "@prisma/client";

export type OutreachDraftDisplay = {
  subject?: string;
  /** Legacy single body — fallback for letter and email. */
  bodyHtml?: string;
  letterBodyHtml?: string;
  emailSubject?: string;
  emailBodyHtml?: string;
  recipient?: { name?: string; addressLines?: string };
  contact?: { kind?: string; email?: string | null };
  enrichment?: {
    applicantName?: string | null;
    applicantEmail?: string | null;
    applicantEmailSource?: string | null;
    applicantEmailConfidence?: number | null;
    agentName?: string | null;
    agentEmail?: string | null;
  };
  siteAddress?: string | null;
};

export type PreviewChannel = "email" | "letter";

function normalizeEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export function letterBodyHtml(
  draft: OutreachDraftDisplay | null | undefined,
): string {
  return (
    draft?.letterBodyHtml?.trim() ||
    draft?.bodyHtml?.trim() ||
    ""
  );
}

export function emailBodyHtml(
  draft: OutreachDraftDisplay | null | undefined,
): string {
  return (
    draft?.emailBodyHtml?.trim() ||
    draft?.bodyHtml?.trim() ||
    letterBodyHtml(draft) ||
    ""
  );
}

export function emailSubject(
  draft: OutreachDraftDisplay | null | undefined,
): string {
  return draft?.emailSubject?.trim() || draft?.subject?.trim() || "";
}

export function letterSubject(
  draft: OutreachDraftDisplay | null | undefined,
): string {
  return draft?.subject?.trim() || "";
}

export function recipientEmail(
  draft: OutreachDraftDisplay | null | undefined,
): string | null {
  return (
    normalizeEmail(draft?.contact?.email) ??
    normalizeEmail(draft?.enrichment?.agentEmail) ??
    normalizeEmail(draft?.enrichment?.applicantEmail)
  );
}

export function defaultPreviewChannel(
  draft: OutreachDraftDisplay | null | undefined,
): PreviewChannel {
  return recipientEmail(draft) ? "email" : "letter";
}

export function emailSourceLabel(
  draft: OutreachDraftDisplay | null | undefined,
): string | null {
  if (!draft) return null;
  const email = recipientEmail(draft);
  if (!email) return null;

  const contactEmail = normalizeEmail(draft.contact?.email);
  const agentEmail = normalizeEmail(draft.enrichment?.agentEmail);
  const applicantEmail = normalizeEmail(draft.enrichment?.applicantEmail);

  let role = "Contact";
  if (contactEmail && email === contactEmail) {
    role = draft.contact?.kind === "agent" ? "Planning agent" : "Applicant";
  } else if (agentEmail && email === agentEmail) {
    role = "Planning agent";
  } else if (applicantEmail && email === applicantEmail) {
    role = "Applicant";
  }

  const source = draft.enrichment?.applicantEmailSource?.trim();
  const confidence = draft.enrichment?.applicantEmailConfidence;
  const parts = [role];
  if (source) {
    parts.push(source === "hunter" ? "via Hunter" : `via ${source}`);
  }
  if (typeof confidence === "number" && Number.isFinite(confidence)) {
    parts.push(`${confidence}% confidence`);
  }
  return parts.join(" · ");
}

/** Merge AI draft fields into draftJson shape stored on AgentApproval. */
export function toStoredDraftJson(
  draft: {
    subject: string;
    letterBodyHtml: string;
    emailSubject?: string;
    emailBodyHtml?: string;
    recipient: { name: string; addressLines: string };
    legalBasis?: string;
  },
  extras: Record<string, unknown>,
): Prisma.InputJsonValue {
  return {
    subject: draft.subject,
    letterBodyHtml: draft.letterBodyHtml,
    bodyHtml: draft.letterBodyHtml,
    ...(draft.emailSubject ? { emailSubject: draft.emailSubject } : {}),
    ...(draft.emailBodyHtml ? { emailBodyHtml: draft.emailBodyHtml } : {}),
    recipient: draft.recipient,
    ...(draft.legalBasis ? { legalBasis: draft.legalBasis } : {}),
    ...extras,
  };
}
