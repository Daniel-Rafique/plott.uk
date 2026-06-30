import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";
import { syncSeatBilling } from "@/lib/stripe/sync-seat-billing";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, context: Ctx) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (ctx.membership.role !== "owner" && ctx.membership.role !== "admin") {
    return NextResponse.json({ error: "Admin required" }, { status: 403 });
  }

  const { id } = await context.params;
  const target = await prisma.membership.findUnique({ where: { id } });
  if (!target || target.companyId !== ctx.company.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (target.userId === ctx.user.id) {
    return NextResponse.json(
      { error: "Use a different owner to remove yourself" },
      { status: 400 },
    );
  }
  if (target.role === "owner") {
    const owners = await prisma.membership.count({
      where: { companyId: ctx.company.id, role: "owner" },
    });
    if (owners <= 1) {
      return NextResponse.json(
        { error: "Cannot remove the last owner" },
        { status: 400 },
      );
    }
  }

  await prisma.membership.delete({ where: { id } });
  await syncSeatBilling(ctx.company.id).catch(() => {});
  return NextResponse.json({ ok: true });
}
