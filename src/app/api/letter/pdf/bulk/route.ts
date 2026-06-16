import { NextResponse } from "next/server";
import JSZip from "jszip";
import { getTenantContext, hasActiveSubscription } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { renderLetterPdfBuffer } from "@/lib/letter-pdf";
import { stripHtmlToText } from "@/lib/letter-renderer";

export const runtime = "nodejs";
export const maxDuration = 300;

type Body = { letterIds?: string[] };

export async function POST(req: Request) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasActiveSubscription(ctx.company)) {
    return NextResponse.json(
      { error: "Active subscription required" },
      { status: 403 },
    );
  }

  const body = (await req.json()) as Body;
  const ids = (body.letterIds ?? []).filter(Boolean);
  if (ids.length === 0 || ids.length > 250) {
    return NextResponse.json(
      { error: "Provide between 1 and 250 letterIds" },
      { status: 400 },
    );
  }

  const letters = await prisma.letter.findMany({
    where: { id: { in: ids }, companyId: ctx.company.id },
  });

  const userIds = Array.from(new Set(letters.map((l) => l.userId)));
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      name: true,
      signatoryTitle: true,
      signatureBlobUrl: true,
    },
  });
  const byUser = new Map(users.map((u) => [u.id, u]));

  const zip = new JSZip();
  for (const letter of letters) {
    const user = byUser.get(letter.userId);
    const pdf = await renderLetterPdfBuffer({
      company: ctx.company,
      signerName: user?.name ?? ctx.company.name,
      signerTitle: user?.signatoryTitle ?? "Director",
      signatureImageUrl: user?.signatureBlobUrl ?? null,
      addresseeName: letter.recipientName,
      addressLines: letter.addressLines,
      reference: letter.applicationRef,
      siteAddress: letter.siteAddress,
      description: null,
      planningUrl: null,
      bodyText: stripHtmlToText(letter.bodyHtml),
      footerText: ctx.company.letterFooter ?? "",
    });
    const safeRef = (letter.applicationRef ?? letter.id).replace(
      /[^a-zA-Z0-9._-]/g,
      "-",
    );
    zip.file(`${safeRef}-${letter.recipientName.slice(0, 24).replace(/[^a-zA-Z0-9]/g, "-")}.pdf`, pdf);
  }

  const buf = await zip.generateAsync({ type: "nodebuffer" });
  return new NextResponse(buf as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="letters-${new Date().toISOString().slice(0, 10)}.zip"`,
    },
  });
}
