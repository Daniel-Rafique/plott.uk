import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { deleteBlob } from "@/lib/blob";

export const runtime = "nodejs";

export async function DELETE() {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (ctx.membership.role !== "owner" && ctx.membership.role !== "admin") {
    return NextResponse.json({ error: "Admin required" }, { status: 403 });
  }

  if (ctx.company.logoBlobUrl) {
    await deleteBlob(ctx.company.logoBlobUrl);
  }
  await prisma.company.update({
    where: { id: ctx.company.id },
    data: { logoBlobUrl: null, logoBlobPathname: null },
  });

  return NextResponse.json({ ok: true });
}
