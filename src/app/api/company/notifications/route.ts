import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Body = {
  autoEmailPdf?: boolean;
  pdfEmailRecipients?: string[];
  prospectEmailOutreachEnabled?: boolean;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function PATCH(req: Request) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (ctx.membership.role !== "owner" && ctx.membership.role !== "admin") {
    return NextResponse.json({ error: "Admin required" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  if (typeof body.autoEmailPdf !== "boolean") {
    return NextResponse.json({ error: "autoEmailPdf required" }, { status: 400 });
  }
  if (typeof body.prospectEmailOutreachEnabled !== "boolean") {
    return NextResponse.json(
      { error: "prospectEmailOutreachEnabled required" },
      { status: 400 },
    );
  }
  const rawRecipients = Array.isArray(body.pdfEmailRecipients)
    ? body.pdfEmailRecipients
    : [];
  // De-duplicate + validate. Invalid entries are dropped silently to keep
  // the UX forgiving when the list is manipulated from multiple places.
  const cleaned = Array.from(
    new Set(
      rawRecipients
        .map((v) => (typeof v === "string" ? v.trim().toLowerCase() : ""))
        .filter((v) => EMAIL_RE.test(v)),
    ),
  );
  if (cleaned.length > 20) {
    return NextResponse.json(
      { error: "Maximum of 20 recipients" },
      { status: 400 },
    );
  }
  if (body.autoEmailPdf && cleaned.length === 0) {
    return NextResponse.json(
      {
        error:
          "Add at least one shared recipient before enabling workspace PDF delivery.",
      },
      { status: 400 },
    );
  }

  await prisma.company.update({
    where: { id: ctx.company.id },
    data: {
      autoEmailPdf: body.autoEmailPdf,
      pdfEmailRecipients: cleaned,
      prospectEmailOutreachEnabled: body.prospectEmailOutreachEnabled,
    },
  });

  return NextResponse.json({ ok: true, recipients: cleaned });
}
