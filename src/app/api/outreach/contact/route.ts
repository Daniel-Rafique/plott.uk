/**
 * GET /api/outreach/contact
 *
 * Unified addressee resolver for the View Applicant and Proprietor & Letter
 * modals. Returns an `OutreachContactBundle` (see `src/lib/outreach-contact.ts`)
 * with ranked candidates, the full enrichment record, and the aggregated
 * source/confidence metadata.
 */

import { NextResponse } from "next/server";
import { requireSubscribedTenant } from "@/lib/tenant";
import { resolveOutreachContact } from "@/lib/outreach-contact";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const gate = await requireSubscribedTenant();
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });
  const { ctx } = gate;

  const rl = await checkRateLimit("outreachContact", ctx.company.id);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);

  const { searchParams } = new URL(req.url);
  const reference = searchParams.get("reference");
  const planningEntityRaw = searchParams.get("planning_entity");
  if (!reference || !planningEntityRaw) {
    return NextResponse.json(
      { error: "reference and planning_entity are required" },
      { status: 400 },
    );
  }
  const planningEntity = Number(planningEntityRaw);
  if (!Number.isFinite(planningEntity) || planningEntity <= 0) {
    return NextResponse.json(
      { error: "planning_entity must be a positive integer" },
      { status: 400 },
    );
  }

  const organisationEntity =
    searchParams.get("organisation_entity") ??
    searchParams.get("organisationEntity") ??
    null;
  const lpaWebsite = searchParams.get("lpa_website") ?? null;
  const siteAddress = searchParams.get("site_address") ?? null;
  const seedApplicant = searchParams.get("seed_applicant") ?? null;
  const seedAgent = searchParams.get("seed_agent") ?? null;
  const seedAgentAddress = searchParams.get("seed_agent_address") ?? null;

  try {
    const bundle = await resolveOutreachContact({
      ctx: { companyId: ctx.company.id, userId: ctx.user.id },
      reference,
      planningEntity,
      organisationEntity,
      lpaWebsite,
      siteAddress,
      seed: {
        applicant: seedApplicant,
        agent: seedAgent,
        agentAddress: seedAgentAddress,
      },
    });
    return NextResponse.json(bundle);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
