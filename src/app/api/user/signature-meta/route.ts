import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Body = { name?: string; title?: string };

export async function PATCH(req: Request) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as Body;
  const name = body.name?.trim();
  const title = body.title?.trim();

  await prisma.user.update({
    where: { id: ctx.user.id },
    data: {
      name: name || undefined,
      signatoryTitle: title || undefined,
    },
  });

  return NextResponse.json({ ok: true });
}
