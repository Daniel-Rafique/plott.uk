/**
 * Compliance guardrail for outbound letters.
 *
 * Two-layer check:
 * 1. Deterministic regex/substring checks for obvious red-flags (PII leakage,
 *    prohibited claims, script tags, missing opt-out).
 * 2. Claude Haiku classification for nuanced issues (misleading claims,
 *    unverified professional credentials, aggressive tone).
 */

import { z } from "zod";
import { runObject } from "@/lib/ai/runtime";
import { logger } from "@/lib/logger";

export type ComplianceLetterPurpose = "default" | "planning_b2b_outreach";

export type ComplianceIssue = {
  severity: "error" | "warn";
  code: string;
  message: string;
};

export type ComplianceResult = {
  passed: boolean;
  /** 0 = safe to auto-send, 1 = blocked. Used for auto-approve thresholds. */
  riskScore: number;
  issues: ComplianceIssue[];
};

const BANNED_PATTERNS: Array<{ regex: RegExp; code: string; message: string; emailOnly?: boolean }> = [
  { regex: /<script/i, code: "script_tag", message: "Letter contains a <script> tag.", emailOnly: true },
  {
    regex: /guarantee(d)? approval/i,
    code: "guarantee_claim",
    message: "Do not guarantee planning approval.",
  },
  {
    regex: /100% success/i,
    code: "absolute_claim",
    message: "Do not claim 100% success.",
  },
];

const OPT_OUT_HINTS = [
  "opt out",
  "unsubscribe",
  "no further",
  "do not wish",
  "remove",
  "contact us",
  "get in touch",
  "reply",
  "respond",
];

// NOTE: avoid `.max()` on arrays (generates `maxItems` which Anthropic/Bedrock
// strict-mode schemas reject) and avoid `.max()` on strings (AI occasionally
// returns longer messages, triggering Zod validation failures that abort the call).
const haikuSchema = z.object({
  ok: z.boolean(),
  issues: z.array(
    z.object({
      severity: z.enum(["error", "warn"]),
      code: z.string(),
      message: z.string().min(4),
    }),
  ),
  confidence: z.number().min(0).max(1),
});

export async function runComplianceGuardrail(args: {
  ctx: { companyId: string; userId?: string };
  subject: string;
  bodyHtml: string;
  recipientKind?: "applicant" | "agent";
  /** Physical printed letters have different compliance requirements than emails */
  channel?: "email" | "print";
  /**
   * Narrows Haiku review for planning-sector B2B cold letters (vs generic UK consumer marketing).
   * Deterministic checks are unchanged regardless of letterPurpose.
   */
  letterPurpose?: ComplianceLetterPurpose;
}): Promise<ComplianceResult> {
  const issues: ComplianceIssue[] = [];
  const isEmail = args.channel === "email";
  const letterPurpose = args.letterPurpose ?? "default";

  for (const pat of BANNED_PATTERNS) {
    if (pat.emailOnly && !isEmail) continue;
    if (pat.regex.test(args.bodyHtml) || pat.regex.test(args.subject)) {
      issues.push({ severity: "error", code: pat.code, message: pat.message });
    }
  }

  const plainBody = args.bodyHtml.replace(/<[^>]+>/g, " ").toLowerCase();
  
  // Opt-out check is softer for print letters - just having contact info is sufficient
  const hasContactOption = OPT_OUT_HINTS.some((h) => plainBody.includes(h));
  if (!hasContactOption && isEmail) {
    issues.push({
      severity: "warn",
      code: "missing_opt_out",
      message: "No clear opt-out / unsubscribe instruction detected.",
    });
  }

  if (plainBody.length < 120) {
    issues.push({
      severity: "warn",
      code: "too_short",
      message: "Letter body is unusually short.",
    });
  }

  // Ballpark figures in outreach must carry the fixed indicative disclaimer.
  const hasPoundFigure = /£\s?\d/.test(args.bodyHtml) || /£\s?\d/.test(args.subject);
  const hasBallparkDisclaimer =
    /indicative ballpark/i.test(plainBody) &&
    /not a formal quotation/i.test(plainBody) &&
    /site survey/i.test(plainBody);
  if (hasPoundFigure && !hasBallparkDisclaimer) {
    issues.push({
      severity: "error",
      code: "ballpark_missing_disclaimer",
      message:
        "Price figures require the indicative ballpark disclaimer (not a formal quotation; site survey required).",
    });
  }

  // Deterministic failure — don't bother paying the Haiku call.
  if (issues.some((i) => i.severity === "error")) {
    return { passed: false, riskScore: 1, issues };
  }

  try {
    const channelContext = isEmail
      ? "This is an EMAIL letter. Check for: missing unsubscribe/opt-out instructions, inline JavaScript handlers, script tags."
      : "This is a PRINTED PHYSICAL letter. Do NOT flag missing unsubscribe links, inline handlers, or script tags - these are irrelevant for print. Focus only on content issues.";

    const genericPolicy = `You review UK outreach letters for compliance. Flag issues such as:
- Misleading or absolute professional claims
- Implying an existing relationship that doesn't exist
- Aggressive / high-pressure tone
- PII that shouldn't be in marketing letters
- GDPR legitimate-interest overreach`;

    const planningB2bPolicy = `You review UK PLANNING-SECTOR B2B cold letters — legitimate-interest style introductions referencing a publicly visible planning application.

Flag substantive problems:
- Misleading or absolute guarantees about planning outcomes (except normal caveated professional language)
- Deceptive credentials or unverified professional claims
- Aggressive / high-pressure or coercive tone
- GDPR / legitimate-interest overreach beyond proportionate professional introduction

Context-specific guidance (IMPORTANT):
- A planning reference, site/property address, or other detail clearly tied to the public planning record is NORMAL business specificity — do NOT classify that as inappropriate "PII" for unsolicited consumer marketing for this letter type.
- Still flag clearly unrelated sensitive personal data when present (e.g. NI numbers, bank/medical/private third-party identifiers).
- "Implied relationship" means falsely suggesting an existing contractual retainer, client relationship, mandate, or prior dealings — NOT neutral factual reference to information from public planning listings when worded appropriately.

${channelContext}

Only flag REAL issues.`;

    const system =
      letterPurpose === "planning_b2b_outreach"
        ? `${planningB2bPolicy}

Only flag REAL technical delivery issues that apply to THIS channel's HTML fragment.
Output JSON only matching the schema.`
        : `${genericPolicy}

${channelContext}

Only flag REAL issues. Do NOT flag technical HTML artifacts that are harmless in the delivery channel.
Output JSON only matching the schema.`;
    const prompt = `Channel: ${isEmail ? "email" : "print"}
Recipient kind: ${args.recipientKind ?? "unknown"}
Subject: ${args.subject}
Body (HTML):
${args.bodyHtml}`;

    const haiku = await runObject({
      kind: "compliance_guardrail",
      ctx: args.ctx,
      system,
      prompt,
      schema: haikuSchema,
      traceName: "compliance-review",
    });

    for (const i of haiku.data.issues) issues.push(i);
    const errorCount = issues.filter((i) => i.severity === "error").length;
    const warnCount = issues.filter((i) => i.severity === "warn").length;
    // Map (errors, warns, Haiku confidence) → [0, 1] risk score.
    // Any error ⇒ 1. Otherwise warnings bump risk from a baseline driven by Haiku uncertainty.
    const riskScore =
      errorCount > 0
        ? 1
        : Math.min(1, (1 - haiku.data.confidence) * 0.5 + warnCount * 0.15);
    return { passed: errorCount === 0 && haiku.data.ok, riskScore, issues };
  } catch (err) {
    logger.warn({ err }, "compliance haiku unavailable — deterministic-only");
    const errorCount = issues.filter((i) => i.severity === "error").length;
    return {
      passed: errorCount === 0,
      riskScore: errorCount > 0 ? 1 : 0.5,
      issues,
    };
  }
}
