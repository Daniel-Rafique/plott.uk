import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { deleteBlob } from "@/lib/blob";
import { sanitizeInlineSvg } from "@/lib/sanitize-html";

export const runtime = "nodejs";

type Body = { svg?: string };

export async function POST(req: Request) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as Body;
  const svg = body.svg?.trim() ?? "";
  if (!svg.startsWith("<svg") || svg.length > 1024 * 256) {
    return NextResponse.json({ error: "Invalid SVG" }, { status: 400 });
  }
  const sanitized = sanitizeInlineSvg(svg);

  const prev = await prisma.user.findUnique({
    where: { id: ctx.user.id },
    select: { signatureBlobUrl: true },
  });
  if (prev?.signatureBlobUrl) {
    await deleteBlob(prev.signatureBlobUrl);
  }

  await prisma.user.update({
    where: { id: ctx.user.id },
    data: { signatureSvg: sanitized, signatureBlobUrl: null },
  });

  return NextResponse.json({ ok: true });
}
