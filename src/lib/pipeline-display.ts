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
  applicantPerson?: {
    position?: string | null;
    seniority?: string | null;
    employer?: string | null;
    linkedin?: string | null;
  } | null;
  agentName?: string | null;
  agentEmail?: string | null;
  agentPerson?: {
    position?: string | null;
    seniority?: string | null;
    employer?: string | null;
    linkedin?: string | null;
  } | null;
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
  /** Compact role chip e.g. "Director · Acme Ltd". */
  personRole: string | null;
  personLinkedin: string | null;
};

export type PipelineEstimateJson = {
  workType?: string;
  scopeSummary?: string;
};

/** Max length for the persisted short job label shown in Pipeline. */
export const WORK_LABEL_MAX_LENGTH = 72;

const GENERIC_WORK_TYPES = new Set(["general_works", "general_work"]);

const USELESS_LABEL_PATTERNS = [
  /^indicative scope from planning description\.?$/i,
  /^general works?\.?$/i,
  /^planning[- ]led works?\.?$/i,
  /no description provided/i,
  /work type,?\s+scope and scale/i,
  /description (is )?(unknown|missing|not available)/i,
  /^unknown$/i,
  /planning application\s+\S+/i,
];

function normalizeEmail(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.includes("@") ? trimmed : null;
}

export function formatWorkTypeLabel(workType: string | null | undefined): string | null {
  const key = workType?.trim();
  if (!key) return null;
  if (GENERIC_WORK_TYPES.has(key.toLowerCase())) return null;
  return key
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function isGenericWorkType(workType: string | null | undefined): boolean {
  const key = workType?.trim().toLowerCase();
  if (!key) return true;
  return GENERIC_WORK_TYPES.has(key);
}

export function isUselessWorkLabel(text: string | null | undefined): boolean {
  const value = text?.trim();
  if (!value || value.length < 4) return true;
  return USELESS_LABEL_PATTERNS.some((pattern) => pattern.test(value));
}

function capitalizeSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function tidyWorkPhrase(raw: string): string | null {
  let text = raw
    .replace(/\s+/g, " ")
    .replace(/^[\s,.;:—-]+/, "")
    .replace(/[\s,.;:—-]+$/, "")
    .trim();

  text = text.replace(
    /^(the\s+)?(installation|construction|erection|provision)\s+of\s+/i,
    "",
  );
  text = text.replace(/^(a|an|the)\s+/i, "");
  text = text.replace(/\s+\((?:ref:?\s*)?[^)]+\)\s*$/i, "");

  if (isUselessWorkLabel(text)) return null;
  if (text.length < 4) return null;

  if (text.length > WORK_LABEL_MAX_LENGTH) {
    const cut = text.slice(0, WORK_LABEL_MAX_LENGTH - 1);
    const lastSpace = cut.lastIndexOf(" ");
    text = `${(lastSpace > 24 ? cut.slice(0, lastSpace) : cut).trim()}…`;
  }

  return capitalizeSentence(text);
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

/**
 * Pull a short job phrase from outreach letter HTML.
 * e.g. "…sought for the installation of a safety guardrail system to the roof
 * perimeter at 68 Oakhill…" → "Safety guardrail system to the roof perimeter"
 */
export function extractWorkSnippetFromOutreachHtml(
  html: string | null | undefined,
): string | null {
  if (!html?.trim()) return null;
  const text = htmlToPlainText(html);
  if (!text) return null;

  const patterns = [
    /\b(?:sought|proposed|submitted)\s+for\s+(.+?)\s+at\s+(?:the\s+)?(?:property|site|address|\d)/i,
    /\bfor\s+(.+?)\s+at\s+(?:the\s+)?(?:property|site|address|\d|[A-Z])/i,
    /application[^.]{0,100}?\bfor\s+([^.]{8,120})(?:\s+at\b|\s+\(|$)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const candidate = match?.[1] ? tidyWorkPhrase(match[1]) : null;
    if (candidate) return candidate;
  }

  return null;
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

/**
 * Derive a short persisted work label from the best available source.
 * Prefer letter body → concrete estimate scope → planning description → typed workType.
 */
export function deriveShortWorkLabel(args: {
  workLabel?: string | null;
  letterHtml?: string | null;
  outreachSnippet?: string | null;
  scopeSummary?: string | null;
  description?: string | null;
  workType?: string | null;
}): string | null {
  if (args.workLabel && !isUselessWorkLabel(args.workLabel)) {
    return tidyWorkPhrase(args.workLabel) ?? args.workLabel.trim();
  }

  const fromLetter =
    extractWorkSnippetFromOutreachHtml(args.letterHtml) ??
    (args.outreachSnippet ? tidyWorkPhrase(args.outreachSnippet) : null);
  if (fromLetter) return fromLetter;

  if (args.scopeSummary && !isUselessWorkLabel(args.scopeSummary)) {
    const fromScope = tidyWorkPhrase(args.scopeSummary);
    if (fromScope) return fromScope;
  }

  if (args.description && !isUselessWorkLabel(args.description)) {
    const fromDescription = tidyWorkPhrase(args.description);
    if (fromDescription) return fromDescription;
  }

  return formatWorkTypeLabel(args.workType);
}

/** @deprecated Prefer deriveShortWorkLabel + persisted workLabel. */
export function pipelineWorkTypeLabel(args: {
  workLabel?: string | null;
  workType: string | null;
  scopeSummary: string | null;
  description: string | null;
  outreachSnippet?: string | null;
}): string | null {
  return deriveShortWorkLabel(args);
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

  const person =
    (agentEmail ? enrichment?.agentPerson : null) ??
    enrichment?.applicantPerson ??
    enrichment?.agentPerson ??
    null;
  const personRole = person
    ? [person.position?.trim(), person.employer?.trim()]
        .filter(Boolean)
        .join(" · ") || null
    : null;

  return {
    applicantName,
    applicantAddress,
    applicantEmail,
    applicantEmailLabel,
    agentName,
    agentEmail,
    primaryEmail,
    primaryEmailLabel,
    personRole,
    personLinkedin: person?.linkedin?.trim() || null,
  };
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
  workLabel: string | null;
  workType: string | null;
  scopeSummary: string | null;
  workTypeLabel: string | null;
  contact: PipelineContactSummary;
};

export type PipelineTeamMember = PipelineAssigneeUser;
