import { NextResponse } from "next/server";
import { requireSubscribedTenant } from "@/lib/tenant";
import { resolveApplicationWithAi } from "@/lib/ai/agents/enrichment-agent";
import type { ResolvedApplication } from "@/lib/enrichment";

export const runtime = "nodejs";

export type ApplicantResponse = {
  reference: string;
  address?: string | null;
  url?: string | null;
  councilWebsite?: string | null;
  applicantNamesNotInFeed?: boolean;
  applicant: {
    name?: string | null;
    company?: string | null;
    address?: string | null;
    email?: string | null;
    emailSource?: string | null;
    emailConfidence?: number | null;
    emailStatus?: string | null;
    agent?: string | null;
    agentAddress?: string | null;
    agentEmail?: string | null;
    agentEmailSource?: string | null;
    agentEmailConfidence?: number | null;
    agentEmailStatus?: string | null;
    agentPhone?: string | null;
  };
  caseOfficer?: string | null;
  ward?: string | null;
  confidence: "low" | "medium" | "high";
  sources: string[];
  source?: string;
};

function toApplicantResponse(
  r: ResolvedApplication,
  reference: string,
): ApplicantResponse {
  return {
    reference,
    address: r.siteAddress ?? null,
    url: r.url ?? null,
    councilWebsite: r.councilWebsite ?? null,
    applicantNamesNotInFeed: r.applicantNamesNotInFeed,
    applicant: {
      name: r.applicantName ?? null,
      company: null,
      address: r.applicantAddress ?? null,
      email: r.applicantEmail ?? null,
      emailSource: r.applicantEmailSource ?? null,
      emailConfidence: r.applicantEmailConfidence ?? null,
      emailStatus: r.applicantEmailStatus ?? null,
      agent: r.agentName ?? null,
      agentAddress: r.agentAddress ?? null,
      agentEmail: r.agentEmail ?? null,
      agentEmailSource: r.agentEmailSource ?? null,
      agentEmailConfidence: r.agentEmailConfidence ?? null,
      agentEmailStatus: r.agentEmailStatus ?? null,
      agentPhone: r.agentPhone ?? null,
    },
    caseOfficer: r.caseOfficer ?? null,
    ward: r.ward ?? null,
    confidence: r.confidence,
    sources: r.sources ?? [r.source],
    source: r.source,
  };
}

export async function GET(req: Request) {
  const gate = await requireSubscribedTenant();
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });
  const { ctx } = gate;

  const { searchParams } = new URL(req.url);
  const reference = searchParams.get("reference");
  const organisationEntity =
    searchParams.get("organisation_entity") ??
    searchParams.get("organisationEntity");
  const council = searchParams.get("council");
  const planningEntity = searchParams.get("planning_entity");
  const lpaWebsite = searchParams.get("lpa_website") ?? undefined;
  const siteAddress = searchParams.get("site_address") ?? undefined;
  const seedApplicant = searchParams.get("seed_applicant") ?? undefined;
  const seedAgent = searchParams.get("seed_agent") ?? undefined;
  const seedAgentAddress =
    searchParams.get("seed_agent_address") ?? undefined;

  if (!reference) {
    return NextResponse.json(
      { error: "Missing reference parameter" },
      { status: 400 }
    );
  }

  try {
    const data = await resolveApplicationWithAi({
      reference,
      organisationEntity: organisationEntity ?? undefined,
      councilId: council ?? undefined,
      planningEntity: planningEntity ? Number(planningEntity) : undefined,
      lpaWebsite,
      siteAddress,
      companyId: ctx.company.id,
      userId: ctx.user.id,
      seedApplicant,
      seedAgent,
      seedAgentAddress,
    });

    if (!data) {
      return NextResponse.json(
        { error: "Application not found in any source" },
        { status: 404 },
      );
    }

    return NextResponse.json(toApplicantResponse(data, reference));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
