import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import {
  PIPELINE_ASSIGNEE_SELECT,
  serializePipelineLeadsWithEnrichment,
  type SerializedPipelineLead,
} from "@/lib/pipeline";
import {
  PipelineBoard,
  type PipelineTeamMember,
} from "./pipeline-board";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/auth/sign-in");

  const [leads, memberships] = await Promise.all([
    prisma.pipelineLead.findMany({
      where: { companyId: ctx.company.id },
      orderBy: [{ stageUpdatedAt: "desc" }, { createdAt: "desc" }],
      take: 200,
      include: { assignedUser: { select: PIPELINE_ASSIGNEE_SELECT } },
    }),
    prisma.membership.findMany({
      where: { companyId: ctx.company.id },
      include: { user: { select: PIPELINE_ASSIGNEE_SELECT } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const serializedLeads: SerializedPipelineLead[] =
    await serializePipelineLeadsWithEnrichment(leads);

  const teamMembers: PipelineTeamMember[] = memberships.map((membership) => ({
    id: membership.user.id,
    name: membership.user.name,
    email: membership.user.email,
  }));

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10 overflow-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Track planning leads from first contact through to won or lost jobs.
        </p>
      </header>
      <Suspense fallback={<p className="text-sm text-zinc-600">Loading pipeline…</p>}>
        <PipelineBoard
          currentUserId={ctx.user.id}
          initialLeads={serializedLeads}
          teamMembers={teamMembers}
        />
      </Suspense>
    </div>
  );
}
