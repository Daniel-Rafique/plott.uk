import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Body = { emailPdfOnPrint?: boolean };

export async function PATCH(req: Request) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Body;
  if (typeof body.emailPdfOnPrint !== "boolean") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: ctx.user.id },
    data: { emailPdfOnPrint: body.emailPdfOnPrint },
  });

  return NextResponse.json({ ok: true });
}
