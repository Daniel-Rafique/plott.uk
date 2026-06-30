export type OutreachDraftDisplay = {
  subject?: string;
  bodyHtml?: string;
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
};

export type PreviewChannel = "email" | "letter";

function normalizeEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
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
