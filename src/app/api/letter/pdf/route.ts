import { NextResponse } from "next/server";
import { getTenantContext, hasActiveSubscription } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { storeBlob } from "@/lib/blob";
import { renderLetterPdfBuffer } from "@/lib/letter-pdf";
import { stripHtmlToText } from "@/lib/letter-renderer";
import { captureServerEvent } from "@/lib/posthog-server";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  letterId?: string;
  save?: boolean;
};

async function renderLetterPdfResponse(
  ctx: NonNullable<Awaited<ReturnType<typeof getTenantContext>>>,
  letterId: string,
  options: { save?: boolean; disposition?: "inline" | "attachment" } = {},
) {
  const letter = await prisma.letter.findUnique({ where: { id: letterId } });
  if (!letter || letter.companyId !== ctx.company.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const user = await prisma.user.findUnique({
    where: { id: letter.userId },
    select: { name: true, signatoryTitle: true, signatureBlobUrl: true },
  });

  const pdf = await renderLetterPdfBuffer({
    company: ctx.company,
    signerName: user?.name ?? ctx.user.name ?? ctx.company.name,
    signerTitle: user?.signatoryTitle ?? "Director",
    signatureImageUrl: user?.signatureBlobUrl ?? null,
    addresseeName: letter.recipientName,
    addressLines: letter.addressLines,
    reference: letter.applicationRef,
    siteAddress: letter.siteAddress,
    description: null,
    planningUrl: null,
    bodyText: stripHtmlToText(letter.bodyHtml),
    footerText:
      ctx.company.letterFooter ??
      "This letter was generated for business outreach regarding public planning records. Direct marketing must comply with UK GDPR and PECR.",
  });

  void captureServerEvent({
    distinctId: ctx.user.email ?? ctx.user.id,
    event: "letter_pdf_downloaded",
    properties: {
      letter_id: letterId,
      company_id: ctx.company.id,
      disposition: options.save ? "save" : (options.disposition ?? "inline"),
      planning_reference: letter.applicationRef ?? null,
    },
  });

  if (options.save) {
    const blob = await storeBlob({
      companyId: ctx.company.id,
      kind: "letter",
      filename: `letter-${letter.id}.pdf`,
      contentType: "application/pdf",
      data: pdf,
    });
    await prisma.letter.update({
      where: { id: letter.id },
      data: { pdfBlobUrl: blob.url, pdfBlobPathname: blob.pathname },
    });
    return NextResponse.json({
      url: `/api/letter/${letter.id}/stored-pdf`,
      blobUrl: blob.url,
    });
  }

  const disposition = options.disposition ?? "inline";
  return new NextResponse(pdf as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="letter-${letter.id}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

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
  if (!body.letterId) {
    return NextResponse.json({ error: "letterId required" }, { status: 400 });
  }

  return renderLetterPdfResponse(ctx, body.letterId, { save: body.save });
}

/**
 * GET /api/letter/pdf?id=<letterId>&download=1
 *
 * Returns the letter as a PDF for direct display in a new tab. This is the
 * Print path: opening the PDF in the browser's built-in viewer gives a clean
 * print dialog with no URL/page-number footer and no <title> header.
 */
export async function GET(req: Request) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasActiveSubscription(ctx.company)) {
    return NextResponse.json(
      { error: "Active subscription required" },
      { status: 403 },
    );
  }

  const url = new URL(req.url);
  const letterId = url.searchParams.get("id") ?? url.searchParams.get("letterId");
  if (!letterId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const disposition =
    url.searchParams.get("download") === "1" ? "attachment" : "inline";

  return renderLetterPdfResponse(ctx, letterId, { disposition });
}
