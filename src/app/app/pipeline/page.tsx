import { redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { planningEntityToNumber } from "@/lib/planning-entity-bigint";
import { PipelineBoard } from "./pipeline-board";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/auth/sign-in");

  const leads = await prisma.pipelineLead.findMany({
    where: { companyId: ctx.company.id },
    orderBy: [{ stageUpdatedAt: "desc" }, { createdAt: "desc" }],
    take: 200,
  });

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10 overflow-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Track planning leads from first contact through to won or lost jobs.
        </p>
      </header>
      <PipelineBoard
        initialLeads={leads.map((l) => ({
          id: l.id,
          planningEntity: planningEntityToNumber(l.planningEntity),
          applicationRef: l.applicationRef,
          siteAddress: l.siteAddress,
          description: l.description,
          stage: l.stage,
          stageUpdatedAt: l.stageUpdatedAt.toISOString(),
          notes: l.notes,
          lostReason: l.lostReason,
          estimateMinGbp: l.estimateMinGbp,
          estimateMaxGbp: l.estimateMaxGbp,
          estimateWeeks: l.estimateWeeks,
          includeBallparkInOutreach: l.includeBallparkInOutreach,
        }))}
      />
    </div>
  );
}
