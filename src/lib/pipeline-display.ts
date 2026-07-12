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
}): string | null {
  const fromWorkType = formatWorkTypeLabel(args.workType);
  if (fromWorkType) return fromWorkType;
  if (args.scopeSummary) return args.scopeSummary;
  const description = args.description?.trim();
  if (!description) return null;
  if (description.length <= 120) return description;
  return `${description.slice(0, 117)}…`;
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
