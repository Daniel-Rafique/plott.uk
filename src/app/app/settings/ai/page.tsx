import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { getCompanyTier, tierDef } from "@/lib/ai/tiers";
import { AiSettingsClient } from "./ai-settings-client";

export const dynamic = "force-dynamic";

const LETTER_APPROVAL_KINDS = ["outreach_letter", "appeal_pitch_letter"] as const;

const RESEARCH_KINDS = ["applicant_research", "enrichment_agent"] as const;
const SCORING_KINDS = ["icp_classifier", "appeal_classifier"] as const;
const COMPLIANCE_KIND = "compliance_guardrail";
const LETTER_RUN_KINDS = ["outreach_drafter", "appeal_pitch_drafter"] as const;

function sumRunCounts(
  rows: { kind: string; status: string; _count: { _all: number } }[],
  kinds: readonly string[],
  status: string,
): number {
  let n = 0;
  for (const row of rows) {
    if (row.status === status && kinds.includes(row.kind)) {
      n += row._count._all;
    }
  }
  return n;
}

function sumRunCountsForKind(
  rows: { kind: string; status: string; _count: { _all: number } }[],
  kind: string,
  status: string,
): number {
  let n = 0;
  for (const row of rows) {
    if (row.kind === kind && row.status === status) {
      n += row._count._all;
    }
  }
  return n;
}

function sumOtherSucceeded(
  rows: { kind: string; status: string; _count: { _all: number } }[],
): number {
  const excluded = new Set<string>([
    ...RESEARCH_KINDS,
    ...SCORING_KINDS,
    COMPLIANCE_KIND,
    ...LETTER_RUN_KINDS,
  ]);
  let n = 0;
  for (const row of rows) {
    if (row.status === "succeeded" && !excluded.has(row.kind)) {
      n += row._count._all;
    }
  }
  return n;
}

function sumApprovalKinds(
  rows: { kind: string; status: string; _count: { _all: number } }[],
  kinds: readonly string[],
): number {
  const set = new Set(kinds);
  let n = 0;
  for (const row of rows) {
    if (set.has(row.kind)) n += row._count._all;
  }
  return n;
}

async function fetchLast24hAiActivity(companyId: string) {
  const sinceYesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const window: Prisma.AgentRunWhereInput = {
    companyId,
    createdAt: { gte: sinceYesterday },
  };

  const [agg, runsByKindStatus, runsByStatus, approvalsByKindStatus] =
    await Promise.all([
      prisma.agentRun.aggregate({
        where: window,
        _sum: { costGbp: true, totalTokens: true },
        _count: { _all: true },
      }),
      prisma.agentRun.groupBy({
        by: ["kind", "status"],
        where: window,
        _count: { _all: true },
      }),
      prisma.agentRun.groupBy({
        by: ["status"],
        where: window,
        _count: { _all: true },
      }),
      prisma.agentApproval.groupBy({
        by: ["kind", "status"],
        where: {
          companyId,
          createdAt: { gte: sinceYesterday },
          kind: { in: [...LETTER_APPROVAL_KINDS] },
        },
        _count: { _all: true },
      }),
    ]);

  const lettersDrafted = sumApprovalKinds(
    approvalsByKindStatus,
    [...LETTER_APPROVAL_KINDS],
  );
  const applicantsResearched = sumRunCounts(
    runsByKindStatus,
    RESEARCH_KINDS,
    "succeeded",
  );
  const leadsScored = sumRunCounts(runsByKindStatus, SCORING_KINDS, "succeeded");
  const complianceChecks = sumRunCountsForKind(
    runsByKindStatus,
    COMPLIANCE_KIND,
    "succeeded",
  );
  const otherCompleted = sumOtherSucceeded(runsByKindStatus);

  const completedWorkTotal =
    lettersDrafted +
    applicantsResearched +
    leadsScored +
    complianceChecks +
    otherCompleted;

  const runsSucceeded =
    runsByStatus.find((r) => r.status === "succeeded")?._count._all ?? 0;
  const runsFailed =
    runsByStatus.find((r) => r.status === "failed")?._count._all ?? 0;
  const runsRunning =
    runsByStatus.find((r) => r.status === "running")?._count._all ?? 0;

  return {
    costGbp: Number(agg._sum.costGbp ?? 0),
    tokens: agg._sum.totalTokens ?? 0,
    runs: agg._count._all,
    breakdown: {
      lettersDrafted,
      applicantsResearched,
      leadsScored,
      complianceChecks,
      otherCompleted,
    },
    completedWorkTotal,
    runStatus: { succeeded: runsSucceeded, failed: runsFailed, running: runsRunning },
  };
}

export default async function AiSettingsPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/auth/sign-in");

  const company = await prisma.company.findUnique({
    where: { id: ctx.company.id },
    select: {
      id: true,
      aiEnabled: true,
      aiDailyBudgetGbp: true,
      aiMonthlySpendGbp: true,
      subscriptionStatus: true,
      subscriptionPriceId: true,
    },
  });
  const tier = company ? getCompanyTier(company) : "free";
  const tierInfo = tierDef(tier);
  const icp = await prisma.icpProfile.findUnique({
    where: { companyId: ctx.company.id },
  });

  const activity = await fetchLast24hAiActivity(ctx.company.id);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">AI assistant</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Plott can automatically research applicants, draft outreach letters,
          and filter leads to match your business. Control your spend and tell
          us what projects you&apos;re looking for.
        </p>
      </header>
      <AiSettingsClient
        initial={{
          aiEnabled: company?.aiEnabled ?? true,
          aiDailyBudgetGbp: Number(company?.aiDailyBudgetGbp ?? 5),
          aiMonthlySpendGbp: Number(company?.aiMonthlySpendGbp ?? 0),
          tier: {
            id: tierInfo.id,
            label: tierInfo.label,
            monthlyBudgetCapGbp: tierInfo.monthlyBudgetCapGbp,
            allowedKinds: Array.from(tierInfo.allowedKinds),
          },
          today: {
            costGbp: activity.costGbp,
            tokens: activity.tokens,
            runs: activity.runs,
            completedWorkTotal: activity.completedWorkTotal,
            breakdown: activity.breakdown,
            runStatus: activity.runStatus,
          },
          icp: icp
            ? {
                description: icp.description,
                keywords: icp.keywords,
                preferredStatuses: icp.preferredStatuses,
                excludedKeywords: icp.excludedKeywords,
                minProjectValueGbp: icp.minProjectValueGbp,
                targetRefusals: icp.targetRefusals,
                appealServiceType: icp.appealServiceType,
              }
            : null,
        }}
      />
    </div>
  );
}
