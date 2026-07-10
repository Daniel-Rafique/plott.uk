/**
 * Rank digest candidates by ICP fit, enrichment confidence, then recency.
 */

import type { PlanningApplicationEntity } from "@/lib/planning-data";

const CONFIDENCE_RANK: Record<string, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export type RankedDigestLead = PlanningApplicationEntity & {
  icpScore?: number;
  icpFit?: boolean;
  ballpark?: {
    minGbp: number;
    maxGbp: number;
    weeks: number;
  } | null;
  contactQuality?: "high" | "medium" | "low" | "unknown";
};

function enrichmentRank(app: PlanningApplicationEntity): number {
  const c = app.enrichment?.confidence?.toLowerCase?.() ?? "low";
  return CONFIDENCE_RANK[c] ?? 0;
}

function hasUsableContact(app: PlanningApplicationEntity): number {
  const e = app.enrichment;
  if (!e) return 0;
  let score = 0;
  if (e.applicantName || e.agentName) score += 1;
  if (e.applicantEmail || e.agentEmail) score += 1;
  return score;
}

export function rankDigestCandidates(
  apps: RankedDigestLead[],
): RankedDigestLead[] {
  return [...apps].sort((a, b) => {
    const icpA = a.icpScore ?? -1;
    const icpB = b.icpScore ?? -1;
    if (icpB !== icpA) return icpB - icpA;
    const conf = enrichmentRank(b) - enrichmentRank(a);
    if (conf !== 0) return conf;
    const contact = hasUsableContact(b) - hasUsableContact(a);
    if (contact !== 0) return contact;
    // Prefer higher entity ids as a weak recency proxy when dates absent
    return (b.entity ?? 0) - (a.entity ?? 0);
  });
}

export function contactQualityFromEnrichment(
  app: PlanningApplicationEntity,
): "high" | "medium" | "low" | "unknown" {
  const e = app.enrichment;
  if (!e) return "unknown";
  const hasName = Boolean(e.applicantName || e.agentName);
  const hasEmail = Boolean(e.applicantEmail || e.agentEmail);
  const conf = e.confidence ?? "low";
  if (hasName && hasEmail && conf === "high") return "high";
  if (hasName && (hasEmail || conf === "medium")) return "medium";
  if (hasName) return "low";
  return "unknown";
}
