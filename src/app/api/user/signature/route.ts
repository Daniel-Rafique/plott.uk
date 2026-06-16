import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { deleteBlob } from "@/lib/blob";

export const runtime = "nodejs";

export async function DELETE() {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prev = await prisma.user.findUnique({
    where: { id: ctx.user.id },
    select: { signatureBlobUrl: true },
  });
  if (prev?.signatureBlobUrl) await deleteBlob(prev.signatureBlobUrl);

  await prisma.user.update({
    where: { id: ctx.user.id },
    data: { signatureSvg: null, signatureBlobUrl: null },
  });

  return NextResponse.json({ ok: true });
}
