import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Body = {
  name?: string;
  addressLines?: string;
  phone?: string;
  email?: string;
  websiteUrl?: string;
  letterFooter?: string;
};

function clean(v?: string): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export async function PATCH(req: Request) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (ctx.membership.role !== "owner" && ctx.membership.role !== "admin") {
    return NextResponse.json({ error: "Admin required" }, { status: 403 });
  }

  const body = (await req.json()) as Body;
  const name = clean(body.name);
  if (!name) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }

  const updated = await prisma.company.update({
    where: { id: ctx.company.id },
    data: {
      name,
      addressLines: clean(body.addressLines),
      phone: clean(body.phone),
      email: clean(body.email),
      websiteUrl: clean(body.websiteUrl),
      letterFooter: clean(body.letterFooter),
    },
  });

  return NextResponse.json({ company: updated });
}
