import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, context: Ctx) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const template = await prisma.letterTemplate.findUnique({ where: { id } });
  if (!template || template.companyId !== ctx.company.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await req.json()) as {
    name?: string;
    subject?: string;
    bodyHtml?: string;
    kind?: string;
  };

  const allowedKinds = new Set(["outreach", "appeal_pitch"]);
  const updated = await prisma.letterTemplate.update({
    where: { id },
    data: {
      name: body.name?.trim() ?? undefined,
      subject: body.subject?.trim() ?? undefined,
      bodyHtml: body.bodyHtml ?? undefined,
      kind:
        body.kind && allowedKinds.has(body.kind) ? body.kind : undefined,
    },
  });

  return NextResponse.json({ template: updated });
}

export async function DELETE(_req: Request, context: Ctx) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (ctx.membership.role !== "owner" && ctx.membership.role !== "admin") {
    return NextResponse.json({ error: "Admin required" }, { status: 403 });
  }

  const { id } = await context.params;
  const template = await prisma.letterTemplate.findUnique({ where: { id } });
  if (!template || template.companyId !== ctx.company.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.letterTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
