/**
 * ICP fit classifier. Claude Haiku reads the tenant's ICP profile and a
 * candidate planning application, returns a JSON verdict (fit/not + rationale).
 *
 * Returns `{ fit: false }` with a deterministic reason when no ICP is
 * configured so the outreach pipeline stops cleanly.
 */

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { runObject } from "@/lib/ai/runtime";

const icpClassifierRawSchema = z.object({
  fit: z.union([z.boolean(), z.string()]),
  score: z.union([z.number(), z.string()]),
  reason: z.string(),
});

export type IcpClassification = {
  fit: boolean;
  score: number;
  reason: string;
};

function normalizeIcpClassification(
  raw: z.infer<typeof icpClassifierRawSchema>,
): IcpClassification {
  const fit =
    typeof raw.fit === "boolean"
      ? raw.fit
      : String(raw.fit).toLowerCase() === "true";
  const score = Math.min(1, Math.max(0, Number(raw.score) || 0));
  let reason = raw.reason.trim();
  if (reason.length < 4) reason = reason.padEnd(4, ".");
  if (reason.length > 400) reason = reason.slice(0, 400);
  return { fit, score, reason };
}

export async function classifyIcpFit(args: {
  ctx: { companyId: string; userId?: string };
  candidate: {
    planningEntity: number;
    reference: string;
    siteAddress: string | null;
    description: string | null;
    status?: string | null;
    applicationType?: string | null;
  };
}): Promise<IcpClassification> {
  const icp = await prisma.icpProfile.findUnique({
    where: { companyId: args.ctx.companyId },
  });
  if (!icp) {
    return {
      fit: false,
      score: 0,
      reason: "No ICP profile configured — skipping outreach.",
    };
  }

  const system = `You classify UK planning applications for outreach fit. You must answer strictly in JSON matching the schema.

Rules:
- "fit: true" only if the application materially matches the ICP description AND none of the excluded keywords appear.
- Apply conservative judgement — it's better to drop borderline leads than spam the wrong party.
- Score is your confidence in the fit classification.`;

  const prompt = `ICP description:
${icp.description}

Preferred keywords: ${icp.keywords.join(", ") || "(none)"}
Preferred statuses: ${icp.preferredStatuses.join(", ") || "(any)"}
Excluded keywords: ${icp.excludedKeywords.join(", ") || "(none)"}
Minimum project value: ${icp.minProjectValueGbp ? `£${icp.minProjectValueGbp}` : "(any)"}

Candidate application:
- Reference: ${args.candidate.reference}
- Site address: ${args.candidate.siteAddress ?? "unknown"}
- Description: ${args.candidate.description ?? "unknown"}
- Status: ${args.candidate.status ?? "unknown"}
- Application type: ${args.candidate.applicationType ?? "unknown"}

Return JSON only.`;

  try {
    const result = await runObject({
      kind: "icp_classifier",
      ctx: args.ctx,
      system,
      prompt,
      schema: icpClassifierRawSchema,
      traceName: `icp-classify ref=${args.candidate.reference}`,
    });
    return normalizeIcpClassification(result.data);
  } catch {
    // Fall back to letting the human decide rather than dropping silently.
    return { fit: true, score: 0.3, reason: "Classifier unavailable — deferring to human review." };
  }
}
