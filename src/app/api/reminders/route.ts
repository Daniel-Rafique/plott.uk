import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Body = {
  letterId?: string;
  dueAt?: string;
  note?: string;
};

export async function POST(req: Request) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as Body;
  if (!body.dueAt) {
    return NextResponse.json({ error: "dueAt required" }, { status: 400 });
  }
  const due = new Date(body.dueAt);
  if (Number.isNaN(due.getTime())) {
    return NextResponse.json({ error: "Invalid dueAt" }, { status: 400 });
  }

  if (body.letterId) {
    const letter = await prisma.letter.findUnique({
      where: { id: body.letterId },
    });
    if (!letter || letter.companyId !== ctx.company.id) {
      return NextResponse.json({ error: "Letter not found" }, { status: 404 });
    }
  }

  const reminder = await prisma.reminder.create({
    data: {
      companyId: ctx.company.id,
      userId: ctx.user.id,
      letterId: body.letterId ?? null,
      dueAt: due,
      note: body.note?.trim() || null,
    },
  });

  return NextResponse.json({ reminder });
}
