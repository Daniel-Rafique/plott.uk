/**
 * Client-safe helpers for Pipeline lead display (contact, work type).
 */

export const PIPELINE_WORK_TYPES = [
  "loft_conversion",
  "rear_extension",
  "side_extension",
  "re_roof",
  "new_build",
  "general_works",
] as const;

export type PipelineWorkType = (typeof PIPELINE_WORK_TYPES)[number];

export type PipelineEnrichmentInput = {
  applicantName?: string | null;
  applicantAddress?: string | null;
  applicantEmail?: string | null;
  applicantEmailSource?: string | null;
  applicantEmailConfidence?: number | null;
  applicantEmailStatus?: string | null;
  agentName?: string | null;
  agentEmail?: string | null;
};

export type PipelineContactSummary = {
  applicantName: string | null;
  applicantAddress: string | null;
  applicantEmail: string | null;
  applicantEmailLabel: string | null;
  agentName: string | null;
  agentEmail: string | null;
  primaryEmail: string | null;
  primaryEmailLabel: string | null;
};

export type PipelineEstimateJson = {
  workType?: string;
  scopeSummary?: string;
};

function normalizeEmail(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.includes("@") ? trimmed : null;
}

export function formatWorkTypeLabel(workType: string | null | undefined): string | null {
  const key = workType?.trim();
  if (!key) return null;
  return key
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

const GENERIC_WORK_TYPES = new Set(["general_works", "general_work"]);

const GENERIC_SCOPE_SUMMARIES = [
  /^indicative scope from planning description\.?$/i,
  /^general works?\.?$/i,
  /^planning[- ]led works?\.?$/i,
];

export function isGenericWorkType(workType: string | null | undefined): boolean {
  const key = workType?.trim().toLowerCase();
  if (!key) return true;
  return GENERIC_WORK_TYPES.has(key);
}

export function isGenericScopeSummary(
  scopeSummary: string | null | undefined,
): boolean {
  const text = scopeSummary?.trim();
  if (!text) return true;
  return GENERIC_SCOPE_SUMMARIES.some((pattern) => pattern.test(text));
}

function truncatePipelineLabel(text: string, max = 120): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, ". ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Pull a concrete job phrase from outreach letter HTML when available. */
export function extractWorkSnippetFromOutreachHtml(
  html: string | null | undefined,
): string | null {
  if (!html?.trim()) return null;
  const text = htmlToPlainText(html);
  if (!text) return null;

  const forAtMatch = text.match(
    /\bfor\s+(.+?)\s+at\s+(?:the\s+)?(?:property|site|address|[\dA-Z])/i,
  );
  if (forAtMatch?.[1]) {
    const snippet = forAtMatch[1].trim();
    if (snippet.length >= 8 && !/^your\b/i.test(snippet)) {
      return snippet;
    }
  }

  const applicationForMatch = text.match(
    /application[^.]{0,80}?\bfor\s+([^.]{8,160})/i,
  );
  if (applicationForMatch?.[1]) {
    const snippet = applicationForMatch[1].trim();
    if (!/^your\b/i.test(snippet)) return snippet;
  }

  const firstSentence = text.split(/[.!?]/).find((part) => part.trim().length >= 16);
  return firstSentence?.trim() ?? null;
}

export function extractEstimateFields(
  estimateJson: unknown,
): { workType: string | null; scopeSummary: string | null } {
  if (!estimateJson || typeof estimateJson !== "object") {
    return { workType: null, scopeSummary: null };
  }
  const record = estimateJson as PipelineEstimateJson;
  const workType =
    typeof record.workType === "string" && record.workType.trim()
      ? record.workType.trim()
      : null;
  const scopeSummary =
    typeof record.scopeSummary === "string" && record.scopeSummary.trim()
      ? record.scopeSummary.trim()
      : null;
  return { workType, scopeSummary };
}

function formatEmailLabel(args: {
  source?: string | null;
  confidence?: number | null;
  role: string;
}): string {
  const parts = [args.role];
  const source = args.source?.trim();
  if (source) parts.push(`via ${source}`);
  if (args.confidence != null && Number.isFinite(args.confidence)) {
    parts.push(`${Math.round(args.confidence)}% confidence`);
  }
  return parts.join(" · ");
}

export function buildPipelineContactSummary(
  enrichment: PipelineEnrichmentInput | null | undefined,
): PipelineContactSummary {
  const applicantName = enrichment?.applicantName?.trim() || null;
  const applicantAddress = enrichment?.applicantAddress?.trim() || null;
  const applicantEmail = normalizeEmail(enrichment?.applicantEmail);
  const agentName = enrichment?.agentName?.trim() || null;
  const agentEmail = normalizeEmail(enrichment?.agentEmail);

  const applicantEmailLabel = applicantEmail
    ? formatEmailLabel({
        role: "Applicant",
        source: enrichment?.applicantEmailSource,
        confidence: enrichment?.applicantEmailConfidence,
      })
    : null;

  const agentEmailLabel = agentEmail
    ? formatEmailLabel({ role: "Planning agent" })
    : null;

  const primaryEmail = agentEmail ?? applicantEmail;
  const primaryEmailLabel = agentEmail ? agentEmailLabel : applicantEmailLabel;

  return {
    applicantName,
    applicantAddress,
    applicantEmail,
    applicantEmailLabel,
    agentName,
    agentEmail,
    primaryEmail,
    primaryEmailLabel,
  };
}

export function pipelineWorkTypeLabel(args: {
  workType: string | null;
  scopeSummary: string | null;
  description: string | null;
  outreachSnippet?: string | null;
}): string | null {
  if (!isGenericWorkType(args.workType)) {
    return formatWorkTypeLabel(args.workType);
  }

  if (!isGenericScopeSummary(args.scopeSummary) && args.scopeSummary) {
    return truncatePipelineLabel(args.scopeSummary);
  }

  const outreachSnippet = args.outreachSnippet?.trim();
  if (outreachSnippet) {
    return truncatePipelineLabel(outreachSnippet);
  }

  const description = args.description?.trim();
  if (description) {
    return truncatePipelineLabel(description);
  }

  if (args.scopeSummary?.trim()) {
    return truncatePipelineLabel(args.scopeSummary);
  }

  if (args.workType) {
    return formatWorkTypeLabel(args.workType);
  }

  return null;
}

export type PipelineAssigneeUser = {
  id: string;
  name: string | null;
  email: string | null;
};

export type PipelineLeadRow = {
  id: string;
  planningEntity: number | null;
  applicationRef: string | null;
  siteAddress: string | null;
  description: string | null;
  stage: string;
  stageUpdatedAt: string;
  notes: string | null;
  lostReason: string | null;
  estimateMinGbp: number | null;
  estimateMaxGbp: number | null;
  estimateWeeks: number | null;
  includeBallparkInOutreach: boolean;
  assignedUserId: string | null;
  assignedAt: string | null;
  assignedUser: PipelineAssigneeUser | null;
  workType: string | null;
  scopeSummary: string | null;
  workTypeLabel: string | null;
  contact: PipelineContactSummary;
};

export type PipelineTeamMember = PipelineAssigneeUser;
