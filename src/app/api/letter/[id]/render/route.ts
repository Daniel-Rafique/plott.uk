/**
 * Compose a full letter document from the stored body-only HTML plus the
 * current Company + User records. Used by the edit modal, the AI assist
 * drawer, and anywhere else that needs a pixel-accurate preview.
 *
 * GET:  Render the letter as-saved (uses letter.bodyHtml verbatim).
 * POST: Render with an override body (for live "what does this look like?"
 *       previews during AI rewrite or manual edit).
 */

import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { renderLetterHtml } from "@/lib/letter-renderer";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

async function compose(
  ctx: NonNullable<Awaited<ReturnType<typeof getTenantContext>>>,
  letterId: string,
  overrideBody?: string,
): Promise<{ html: string } | { error: string; status: number }> {
  const letter = await prisma.letter.findUnique({ where: { id: letterId } });
  if (!letter || letter.companyId !== ctx.company.id) {
    return { error: "Not found", status: 404 };
  }

  const user = await prisma.user.findUnique({
    where: { id: letter.userId },
    select: {
      id: true,
      email: true,
      name: true,
      signatureSvg: true,
      signatureBlobUrl: true,
      signatoryTitle: true,
    },
  });

  const { html } = renderLetterHtml({
    company: ctx.company,
    user: {
      id: user?.id ?? letter.userId,
      email: user?.email ?? null,
      name: user?.name ?? null,
      signatureSvg: user?.signatureSvg ?? null,
      signatureBlobUrl: user?.signatureBlobUrl ?? null,
      signatoryTitle: user?.signatoryTitle ?? null,
    },
    addresseeName: letter.recipientName,
    addressLines: letter.addressLines,
    reference: letter.applicationRef ?? undefined,
    siteAddress: letter.siteAddress ?? undefined,
    templateBodyHtml: overrideBody ?? letter.bodyHtml,
  });

  return { html };
}

export async function GET(_req: Request, context: Ctx) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const result = await compose(ctx, id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return new NextResponse(result.html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}

export async function POST(req: Request, context: Ctx) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const body = (await req.json().catch(() => ({}))) as { bodyHtml?: string };
  const override =
    typeof body.bodyHtml === "string" && body.bodyHtml.length > 0
      ? body.bodyHtml
      : undefined;

  // Preview is a read-only, tenant-scoped response. We don't enforce
  // body-only here because the primary write-path guards (PATCH /api/letter,
  // /api/ai/approvals) already prevent legacy full-document HTML from being
  // persisted, and blocking previews of legacy rows would break UX for any
  // drafts that predate the shape change.
  const result = await compose(ctx, id, override);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return new NextResponse(result.html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}
