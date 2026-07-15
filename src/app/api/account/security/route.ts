import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { clearSecondFactorVerification } from "@/lib/auth/second-factor";
import { eraseNeonAuthIdentity } from "@/lib/auth/erase-neon-auth";
import { logger } from "@/lib/logger";
import { captureError } from "@/lib/observability";
import { cancelSubscriptionWithUnusedTimeRefund } from "@/lib/stripe/cancel-with-refund";
import { sendAccountDeletedEmail } from "@/lib/email";

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

async function deleteOwnedCompanies(companyIds: string[]): Promise<void> {
  for (const companyId of companyIds) {
    await prisma.invite.deleteMany({ where: { companyId } });
    await prisma.membership.deleteMany({ where: { companyId } });
    await prisma.letter.deleteMany({ where: { companyId } }).catch(() => {});
    await prisma.savedSearch.deleteMany({ where: { companyId } }).catch(() => {});
    await prisma.letterTemplate
      .deleteMany({ where: { companyId } })
      .catch(() => {});
    await prisma.pinnedApplication
      .deleteMany({ where: { companyId } })
      .catch(() => {});
    await prisma.agentRun.deleteMany({ where: { companyId } }).catch(() => {});
    await prisma.pipelineLead
      .deleteMany({ where: { companyId } })
      .catch(() => {});
    await prisma.icpProfile.deleteMany({ where: { companyId } }).catch(() => {});
    await prisma.companyRateCard
      .deleteMany({ where: { companyId } })
      .catch(() => {});
    await prisma.user.updateMany({
      where: { activeCompanyId: companyId },
      data: { activeCompanyId: null },
    });
    await prisma.company.delete({ where: { id: companyId } }).catch((err) => {
      logger.warn({ err, companyId }, "account_delete_company_failed");
    });
  }
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
  const password =
    typeof body.password === "string" && body.password.length > 0
      ? body.password
      : undefined;

  if (accountSummary.hasCredentialAccount) {
    if (!password) {
      return NextResponse.json(
        { error: "Enter your current password to delete your account." },
        { status: 403 },
      );
    }
    if (!(await verifyPassword(ctx.user.email, password))) {
      return NextResponse.json(
        { error: "Enter your current password to delete your account." },
        { status: 403 },
      );
    }
  } else if (!(await hasFreshSession())) {
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

  const userId = ctx.user.id;
  const recipientEmail = ctx.user.email?.trim() || null;
  if (!recipientEmail) {
    return NextResponse.json(
      {
        error:
          "Your account has no email on file, so we cannot complete GDPR erasure. Contact support@plott.uk.",
      },
      { status: 400 },
    );
  }

  const ownedMemberships = await prisma.membership.findMany({
    where: { userId, role: "owner" },
    select: {
      companyId: true,
      company: {
        select: {
          id: true,
          name: true,
          stripeCustomerId: true,
          stripeSubscriptionId: true,
          subscriptionStatus: true,
        },
      },
    },
  });
  const ownedCompanyIds = ownedMemberships.map((m) => m.companyId);
  const companyNameForEmail =
    ownedMemberships.find((m) => m.company.id === ctx.company.id)?.company
      .name ??
    ownedMemberships[0]?.company.name ??
    ctx.company.name;

  // 1) Settle Stripe while customer/sub IDs still exist.
  const stripeResults: Array<{
    companyId: string;
    subscriptionId: string | null;
    canceled: boolean;
    refundedAmount: number;
    currency: string | null;
    skippedReason?: string;
  }> = [];
  for (const membership of ownedMemberships) {
    try {
      const result = await cancelSubscriptionWithUnusedTimeRefund({
        companyId: membership.company.id,
        stripeCustomerId: membership.company.stripeCustomerId,
        stripeSubscriptionId: membership.company.stripeSubscriptionId,
      });
      stripeResults.push(result);
    } catch (err) {
      captureError(err, {
        userId,
        companyId: membership.company.id,
        extra: { action: "account_delete_stripe" },
      });
      return NextResponse.json(
        {
          error:
            "Could not cancel your Stripe subscription and issue a refund. Please try again or contact support@plott.uk.",
        },
        { status: 502 },
      );
    }
  }

  // 2) Erase Neon Auth identity and verify the email is free before wiping Plott.
  //    Soft-success here previously left neon_auth.user and blocked re-signup (GDPR).
  const authDelete = await eraseNeonAuthIdentity({
    userId,
    email: recipientEmail,
    password: accountSummary.hasCredentialAccount ? password : undefined,
  });
  if (!authDelete.ok) {
    captureError(new Error(authDelete.error), {
      userId,
      companyId: ctx.company.id,
      extra: { action: "account_delete_neon_auth" },
    });
    logger.error(
      { userId, email: recipientEmail, error: authDelete.error },
      "account_delete_neon_auth_failed",
    );
    return NextResponse.json(
      {
        error:
          "Could not fully erase your sign-in identity. Your subscription was settled, but please try again or contact support@plott.uk so we can complete deletion and free your email.",
      },
      { status: 502 },
    );
  }
  logger.info(
    { userId, email: recipientEmail, method: authDelete.method },
    "account_delete_neon_auth_ok",
  );

  // 3) Wipe Plott tenant data + email-keyed invites / marketing leads.
  try {
    await prisma.agentApproval.updateMany({
      where: { approvedById: userId },
      data: { approvedById: null },
    });
    await prisma.invite.deleteMany({ where: { createdById: userId } });
    await prisma.invite.deleteMany({
      where: { email: { equals: recipientEmail, mode: "insensitive" } },
    });
    await prisma.marketingLead
      .deleteMany({
        where: { email: { equals: recipientEmail, mode: "insensitive" } },
      })
      .catch(() => {});
    await prisma.membership.deleteMany({ where: { userId } });
    await prisma.letter.deleteMany({ where: { userId } }).catch(() => {});
    await prisma.user.delete({ where: { id: userId } });
    await deleteOwnedCompanies(ownedCompanyIds);
  } catch (err) {
    captureError(err, {
      userId,
      companyId: ctx.company.id,
      extra: { action: "account_delete_local" },
    });
    return NextResponse.json(
      {
        error:
          "Your sign-in identity was erased, but local workspace data could not be fully removed. Contact support@plott.uk.",
      },
      { status: 500 },
    );
  }

  await clearSecondFactorVerification();

  const totalRefunded = stripeResults.reduce(
    (sum, r) => sum + r.refundedAmount,
    0,
  );
  const refundCurrency =
    stripeResults.find((r) => r.currency)?.currency ?? null;

  try {
    await sendAccountDeletedEmail({
      to: recipientEmail,
      companyName: companyNameForEmail,
      refundedAmount: totalRefunded,
      currency: refundCurrency,
    });
  } catch (err) {
    captureError(err, {
      userId,
      companyId: ctx.company.id,
      extra: { action: "account_delete_email" },
    });
    logger.error(
      { err, userId, to: recipientEmail },
      "account_delete_email_failed",
    );
  }

  logger.info(
    {
      userId,
      email: recipientEmail,
      stripeResults,
      totalRefunded,
    },
    "account_delete_complete",
  );

  return NextResponse.json({
    ok: true,
    refundedAmount: totalRefunded,
    currency: refundCurrency,
  });
}
