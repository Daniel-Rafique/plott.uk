import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { planningEntityToNumber } from "@/lib/planning-entity-bigint";
import { isBodyOnlyHtml } from "@/lib/letter-renderer";
import { sanitizeHtmlFragment } from "@/lib/sanitize-html";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: Ctx) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;

  const letter = await prisma.letter.findUnique({
    where: { id },
    include: {
      user: { select: { name: true, email: true } },
      reminders: { select: { id: true, dueAt: true, done: true, note: true } },
    },
  });

  if (!letter || letter.companyId !== ctx.company.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    letter: {
      ...letter,
      planningEntity: planningEntityToNumber(letter.planningEntity),
    },
  });
}

export async function PATCH(req: Request, context: Ctx) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const body = (await req.json().catch(() => ({}))) as {
    recipientName?: string;
    addressLines?: string;
    subject?: string;
    bodyHtml?: string;
  };

  const letter = await prisma.letter.findUnique({ where: { id } });
  if (!letter || letter.companyId !== ctx.company.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Letter bodies must be body-only HTML fragments — the letterhead and
  // signature are composed at render time from Company + User. Reject any
  // attempt to persist full-document HTML (usually a stale client or bad AI
  // output) so the shape can't drift again.
  if (typeof body.bodyHtml === "string" && !isBodyOnlyHtml(body.bodyHtml)) {
    return NextResponse.json(
      {
        error:
          "bodyHtml must be a body-only HTML fragment (no <!DOCTYPE>, <html>, <head>, <body>, <style>, <img>, <script>, <iframe>, <link>, <meta>, <title>).",
      },
      { status: 400 },
    );
  }

  const updated = await prisma.letter.update({
    where: { id },
    data: {
      recipientName: body.recipientName ?? letter.recipientName,
      addressLines: body.addressLines ?? letter.addressLines,
      subject: body.subject ?? letter.subject,
      bodyHtml:
        typeof body.bodyHtml === "string"
          ? sanitizeHtmlFragment(body.bodyHtml)
          : letter.bodyHtml,
      status: "draft",
    },
  });

  return NextResponse.json({
    letter: {
      ...updated,
      planningEntity: planningEntityToNumber(updated.planningEntity),
    },
  });
}

export async function DELETE(req: Request, context: Ctx) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const { searchParams } = new URL(req.url);
  const force = searchParams.get("force") === "true";

  const letter = await prisma.letter.findUnique({ where: { id } });
  if (!letter || letter.companyId !== ctx.company.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (letter.status === "sent" && !force) {
    return NextResponse.json(
      {
        error: "Sent letters are retained for record-keeping. Pass ?force=true to confirm deletion.",
        requiresConfirmation: true,
      },
      { status: 409 },
    );
  }

  await prisma.letter.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  return NextResponse.json({ success: true });
}
