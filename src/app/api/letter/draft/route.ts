import { NextResponse } from "next/server";
import { requireSubscribedTenant } from "@/lib/tenant";
import { renderLetterHtml, type LetterInput } from "@/lib/letter-renderer";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { captureServerEvent } from "@/lib/posthog-server";
import { planningEntityToDb } from "@/lib/planning-entity-bigint";

export const runtime = "nodejs";

type ContactKind = "agent" | "applicant" | "proprietor" | "manual";

type Body = {
  addresseeName?: string;
  addressLines?: string;
  reference?: string;
  description?: string;
  planningUrl?: string;
  siteAddress?: string;
  templateId?: string;
  planningEntity?: number | null;
  persist?: boolean;
  /** Enriched contact context (optional; falls back to ApplicationEnrichment cache). */
  contactKind?: ContactKind;
  applicantName?: string | null;
  agentName?: string | null;
  agentAddress?: string | null;
  agentEmail?: string | null;
  agentPhone?: string | null;
  caseOfficer?: string | null;
  ward?: string | null;
};

export async function POST(req: Request) {
  const gate = await requireSubscribedTenant();
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });
  const { ctx } = gate;

  const rl = await checkRateLimit("letter", ctx.user.id);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const addresseeName = (body.addresseeName ?? "").trim() || "Sir or Madam";
  const addressLines = (body.addressLines ?? "").trim();
  const reference = (body.reference ?? "").trim();
  const description = (body.description ?? "").trim();
  const planningUrl = (body.planningUrl ?? "").trim();
  const siteAddress = (body.siteAddress ?? "").trim();

  if (!addressLines) {
    return NextResponse.json(
      { error: "addressLines is required" },
      { status: 400 },
    );
  }

  // Backfill enrichment fields from the cache if the client didn't supply
  // them — so letter templates can reference agent/case officer even when
  // called from the old "Create letter (no lookup)" path.
  let applicantName = body.applicantName ?? null;
  let agentName = body.agentName ?? null;
  let agentAddress = body.agentAddress ?? null;
  let agentEmail = body.agentEmail ?? null;
  let agentPhone = body.agentPhone ?? null;
  let caseOfficer = body.caseOfficer ?? null;
  let ward = body.ward ?? null;

  const needsLookup =
    !applicantName &&
    !agentName &&
    !agentAddress &&
    !agentEmail &&
    !agentPhone &&
    !caseOfficer &&
    !ward;

  if (needsLookup && body.planningEntity != null) {
    const row = await prisma.applicationEnrichment
      .findUnique({
        where: { planningEntity: BigInt(body.planningEntity) },
      })
      .catch(() => null);
    if (row && row.expiresAt > new Date()) {
      applicantName = applicantName ?? row.applicantName;
      agentName = agentName ?? row.agentName;
      agentAddress = agentAddress ?? row.agentAddress;
      agentEmail = agentEmail ?? row.agentEmail;
      agentPhone = agentPhone ?? row.agentPhone;
      caseOfficer = caseOfficer ?? row.caseOfficer;
      ward = ward ?? row.ward;
    }
  }

  let templateBody: string | null = null;
  let templateSubject: string | null = null;
  if (body.templateId) {
    const tpl = await prisma.letterTemplate.findFirst({
      where: { id: body.templateId, companyId: ctx.company.id },
    });
    if (tpl) {
      templateBody = tpl.bodyHtml;
      templateSubject = tpl.subject;
    }
  }
  if (!templateBody) {
    // Manual View Applicant / Proprietor letters are outreach — never pick an
    // appeal_pitch default (which leaves {{decisionDate}} etc. unresolved).
    const tpl =
      (await prisma.letterTemplate.findFirst({
        where: {
          companyId: ctx.company.id,
          kind: "outreach",
          isDefault: true,
        },
      })) ??
      (await prisma.letterTemplate.findFirst({
        where: { companyId: ctx.company.id, kind: "outreach" },
        orderBy: { createdAt: "asc" },
      }));
    if (tpl) {
      templateBody = tpl.bodyHtml;
      templateSubject = tpl.subject;
    }
  }

  const userRow = await prisma.user.findUnique({
    where: { id: ctx.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      signatureSvg: true,
      signatureBlobUrl: true,
      signatoryTitle: true,
    },
  });

  const input: LetterInput = {
    company: ctx.company,
    user: {
      id: ctx.user.id,
      email: ctx.user.email,
      name: userRow?.name ?? ctx.user.name,
      signatureSvg: userRow?.signatureSvg ?? null,
      signatureBlobUrl: userRow?.signatureBlobUrl ?? null,
      signatoryTitle: userRow?.signatoryTitle ?? null,
    },
    addresseeName,
    addressLines,
    reference,
    description,
    planningUrl,
    siteAddress,
    contactKind: body.contactKind,
    applicantName,
    agentName,
    agentAddress,
    agentEmail,
    agentPhone,
    caseOfficer,
    ward,
    templateBodyHtml: templateBody,
    templateSubject,
  };

  const { html, subject, body: bodyOnly } = renderLetterHtml(input);

  let letterId: string | undefined;
  if (body.persist) {
    const created = await prisma.letter.create({
      data: {
        companyId: ctx.company.id,
        userId: ctx.user.id,
        applicationRef: reference || null,
        planningEntity: planningEntityToDb(body.planningEntity ?? null),
        siteAddress: siteAddress || null,
        recipientName: addresseeName,
        addressLines,
        subject,
        bodyHtml: bodyOnly,
        status: "draft",
      },
    });
    letterId = created.id;
    await captureServerEvent({
      distinctId: ctx.user.email ?? ctx.user.id,
      event: "letter_created",
      properties: {
        letter_id: letterId,
        company_id: ctx.company.id,
        planning_reference: reference || null,
        has_template: Boolean(templateBody),
        contact_kind: body.contactKind ?? null,
      },
    });
  }

  return NextResponse.json({ subject, html, body: bodyOnly, letterId });
}
