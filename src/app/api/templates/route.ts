import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Body = {
  name?: string;
  subject?: string;
  bodyHtml?: string;
  isDefault?: boolean;
  kind?: string;
};

const VALID_KINDS = new Set(["outreach", "appeal_pitch"]);

export async function POST(req: Request) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (ctx.membership.role !== "owner" && ctx.membership.role !== "admin") {
    return NextResponse.json({ error: "Admin required" }, { status: 403 });
  }

  const body = (await req.json()) as Body;
  if (!body.name || !body.subject || !body.bodyHtml) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const kind =
    body.kind && VALID_KINDS.has(body.kind) ? body.kind : "outreach";

  const createAsDefault = Boolean(body.isDefault);
  if (createAsDefault) {
    // Defaults are scoped per-kind so each purpose has one default template.
    await prisma.letterTemplate.updateMany({
      where: { companyId: ctx.company.id, kind, isDefault: true },
      data: { isDefault: false },
    });
  }

  const template = await prisma.letterTemplate.create({
    data: {
      companyId: ctx.company.id,
      name: body.name.trim(),
      subject: body.subject.trim(),
      bodyHtml: body.bodyHtml,
      kind,
      isDefault: createAsDefault,
    },
  });

  return NextResponse.json({ template });
}
