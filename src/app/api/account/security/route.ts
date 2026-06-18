import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { clearSecondFactorVerification } from "@/lib/auth/second-factor";

export const runtime = "nodejs";

type PatchBody = {
  twoFactorEmailEnabled?: boolean;
  password?: string;
};

type DeleteBody = {
  confirm?: string;
  password?: string;
};

async function getAccountSummary(): Promise<{
  hasCredentialAccount: boolean;
  known: boolean;
}> {
  const result = await auth.listAccounts().catch(() => ({ data: null }));
  if (!Array.isArray(result.data)) {
    return { hasCredentialAccount: true, known: false };
  }
  return {
    hasCredentialAccount: result.data.some(
      (account) => account.providerId === "credential",
    ),
    known: true,
  };
}

async function hasFreshSession(maxAgeSeconds = 15 * 60): Promise<boolean> {
  const result = await auth
    .getSession({ query: { disableCookieCache: "true" } })
    .catch(() => ({ data: null }));
  const createdAt = result.data?.session?.createdAt;
  const createdAtMs =
    createdAt instanceof Date
      ? createdAt.getTime()
      : typeof createdAt === "string"
        ? Date.parse(createdAt)
        : Number.NaN;
  if (!Number.isFinite(createdAtMs)) return false;
  return Date.now() - createdAtMs <= maxAgeSeconds * 1000;
}

async function verifyPassword(email: string | null, password: unknown) {
  if (!email || typeof password !== "string" || password.length < 1) {
    return false;
  }
  const result = await auth.signIn.email({ email, password });
  return !result.error;
}

export async function PATCH(req: Request) {
  const ctx = await getTenantContext({
    requireVerified: true,
    requireSecondFactor: false,
  });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as PatchBody;
  if (typeof body.twoFactorEmailEnabled !== "boolean") {
    return NextResponse.json({ error: "2FA setting required" }, { status: 400 });
  }
  const accountSummary = await getAccountSummary();
  if (
    accountSummary.hasCredentialAccount &&
    !(await verifyPassword(ctx.user.email, body.password))
  ) {
    return NextResponse.json(
      { error: "Enter your current password to change this setting." },
      { status: 403 },
    );
  }
  if (!accountSummary.hasCredentialAccount && !(await hasFreshSession())) {
    return NextResponse.json(
      { error: "Please sign in with Google again before changing this setting." },
      { status: 403 },
    );
  }

  await prisma.user.update({
    where: { id: ctx.user.id },
    data: { twoFactorEmailEnabled: body.twoFactorEmailEnabled },
  });

  if (!body.twoFactorEmailEnabled) {
    await clearSecondFactorVerification();
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as DeleteBody;
  if (body.confirm !== "DELETE") {
    return NextResponse.json(
      { error: "Type DELETE to confirm account deletion." },
      { status: 400 },
    );
  }
  const accountSummary = await getAccountSummary();
  if (
    accountSummary.hasCredentialAccount &&
    !(await verifyPassword(ctx.user.email, body.password))
  ) {
    return NextResponse.json(
      { error: "Enter your current password to delete your account." },
      { status: 403 },
    );
  }
  if (!accountSummary.hasCredentialAccount && !(await hasFreshSession())) {
    return NextResponse.json(
      { error: "Please sign in with Google again before deleting your account." },
      { status: 403 },
    );
  }

  const ownedTeamWorkspace = await prisma.membership.findFirst({
    where: {
      userId: ctx.user.id,
      role: "owner",
      company: {
        memberships: {
          some: {
            userId: { not: ctx.user.id },
          },
        },
      },
    },
    select: { company: { select: { name: true } } },
  });
  if (ownedTeamWorkspace) {
    return NextResponse.json(
      {
        error: `Transfer ownership of ${ownedTeamWorkspace.company.name} before deleting your account.`,
      },
      { status: 409 },
    );
  }

  const ownedCompanyIds = await prisma.membership.findMany({
    where: { userId: ctx.user.id, role: "owner" },
    select: { companyId: true },
  });

  const authDelete = await auth.deleteUser();
  if (authDelete.error) {
    return NextResponse.json(
      { error: authDelete.error.message ?? "Could not delete account." },
      { status: authDelete.error.status ?? 500 },
    );
  }

  await prisma.$transaction([
    prisma.agentApproval.updateMany({
      where: { approvedById: ctx.user.id },
      data: { approvedById: null },
    }),
    prisma.invite.deleteMany({ where: { createdById: ctx.user.id } }),
    prisma.user.deleteMany({ where: { id: ctx.user.id } }),
    prisma.company.deleteMany({
      where: {
        id: { in: ownedCompanyIds.map((membership) => membership.companyId) },
        memberships: { none: {} },
      },
    }),
  ]);
  await clearSecondFactorVerification();

  return NextResponse.json({ ok: true });
}
