import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, context: Ctx) {
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

  // Defaults are scoped per-kind so each purpose (outreach vs appeal pitch)
  // can independently have its own default template.
  await prisma.$transaction([
    prisma.letterTemplate.updateMany({
      where: {
        companyId: ctx.company.id,
        kind: template.kind,
        isDefault: true,
      },
      data: { isDefault: false },
    }),
    prisma.letterTemplate.update({
      where: { id },
      data: { isDefault: true },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
