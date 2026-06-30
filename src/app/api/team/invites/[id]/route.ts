import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";
import { sendInviteEmail } from "@/lib/email";
import { syncSeatBilling } from "@/lib/stripe/sync-seat-billing";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, context: Ctx) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (ctx.membership.role !== "owner" && ctx.membership.role !== "admin") {
    return NextResponse.json({ error: "Admin required" }, { status: 403 });
  }

  const { id } = await context.params;
  const invite = await prisma.invite.findUnique({ where: { id } });
  if (!invite || invite.companyId !== ctx.company.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (invite.expiresAt < new Date()) {
    return NextResponse.json({ error: "Invite has expired" }, { status: 400 });
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: invite.email },
  });
  const inviteeStatus: "existing" | "new" = existingUser ? "existing" : "new";

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "https://plott.uk";
  const acceptUrl = `${origin}/invites/${invite.token}`;

  await sendInviteEmail({
    to: invite.email,
    companyName: ctx.company.name,
    inviterName: ctx.user.name ?? ctx.user.email ?? "A teammate",
    acceptUrl,
    inviteeStatus,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, context: Ctx) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (ctx.membership.role !== "owner" && ctx.membership.role !== "admin") {
    return NextResponse.json({ error: "Admin required" }, { status: 403 });
  }

  const { id } = await context.params;
  const invite = await prisma.invite.findUnique({ where: { id } });
  if (!invite || invite.companyId !== ctx.company.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await prisma.invite.delete({ where: { id } });
  await syncSeatBilling(ctx.company.id).catch(() => {});
  return NextResponse.json({ ok: true });
}
