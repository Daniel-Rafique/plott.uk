import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { clearSecondFactorVerification } from "@/lib/auth/second-factor";
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

async function deleteNeonAuthViaManagementApi(
  userId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const apiKey = process.env.NEON_API_KEY;
  const projectId = process.env.PLANNING_NEON_PROJECT_ID;
  const branchId = process.env.PLANNING_NEON_BRANCH_ID;
  if (!apiKey || !projectId || !branchId) {
    return {
      ok: false,
      status: 501,
      error:
        "Neon Auth management API is not configured (NEON_API_KEY / PLANNING_NEON_PROJECT_ID / PLANNING_NEON_BRANCH_ID).",
    };
  }

  const res = await fetch(
    `https://console.neon.tech/api/v2/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branchId)}/auth/users/${encodeURIComponent(userId)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    },
  );
  if (res.status === 204 || res.status === 404) {
    return { ok: true };
  }

  const body = (await res.json().catch(() => null)) as
    | { message?: string; error?: string }
    | null;
  return {
    ok: false,
    status: res.status,
    error:
      body?.message ??
      body?.error ??
      `Neon Auth management API delete failed with status ${res.status}.`,
  };
}

async function deleteNeonAuthViaSql(userId: string): Promise<boolean> {
  try {
    await prisma.$executeRawUnsafe(
      `DELETE FROM neon_auth."session" WHERE "userId" = $1::uuid`,
      userId,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM neon_auth."account" WHERE "userId" = $1::uuid`,
      userId,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM neon_auth."user" WHERE id = $1::uuid`,
      userId,
    );
    return true;
  } catch (err) {
    logger.warn({ err, userId }, "neon_auth_sql_delete_failed");
    return false;
  }
}

/**
 * Better Auth deleteUser requires the account password for credential users.
 * Falls back to Neon management API, then direct neon_auth SQL.
 */
async function deleteNeonAuthUser(options: {
  userId: string;
  password?: string;
}): Promise<{ ok: true; method: string } | { ok: false; error: string }> {
  const selfDelete = await auth
    .deleteUser(
      options.password ? { password: options.password } : undefined,
    )
    .catch((error) => ({
      data: null,
      error: {
        message:
          error instanceof Error ? error.message : "Could not delete account.",
        status: 500,
      },
    }));

  if (!selfDelete.error) {
    return { ok: true, method: "auth.deleteUser" };
  }

  const selfDeleteMessage =
    selfDelete.error.message ?? "Could not delete account.";
  logger.warn(
    {
      userId: options.userId,
      message: selfDeleteMessage,
      status: selfDelete.error.status,
    },
    "neon_auth_self_delete_failed",
  );

  const managed = await deleteNeonAuthViaManagementApi(options.userId);
  if (managed.ok) {
    return { ok: true, method: "neon_management_api" };
  }

  if (await deleteNeonAuthViaSql(options.userId)) {
    return { ok: true, method: "neon_auth_sql" };
  }

  return {
    ok: false,
    error: managed.error || selfDeleteMessage,
  };
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

  const ownedMemberships = await prisma.membership.findMany({
    where: { userId: ctx.user.id, role: "owner" },
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
  const recipientEmail = ctx.user.email?.trim() || null;
  const companyNameForEmail =
    ownedMemberships.find((m) => m.company.id === ctx.company.id)?.company
      .name ??
    ownedMemberships[0]?.company.name ??
    ctx.company.name;

  // Settle Stripe before wiping local rows so we still have customer/sub IDs.
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
        userId: ctx.user.id,
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

  // Remove Plott tenant data so a Neon Auth API failure cannot leave the
  // account half-deleted / still signed into the app workspace.
  try {
    await prisma.agentApproval.updateMany({
      where: { approvedById: ctx.user.id },
      data: { approvedById: null },
    });
    await prisma.invite.deleteMany({ where: { createdById: ctx.user.id } });
    await prisma.membership.deleteMany({ where: { userId: ctx.user.id } });
    await prisma.letter.deleteMany({ where: { userId: ctx.user.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: ctx.user.id } });
    await deleteOwnedCompanies(ownedCompanyIds);
  } catch (err) {
    captureError(err, {
      userId: ctx.user.id,
      companyId: ctx.company.id,
      extra: { action: "account_delete_local" },
    });
    return NextResponse.json(
      { error: "Could not delete local account data. Please contact support." },
      { status: 500 },
    );
  }

  const authDelete = await deleteNeonAuthUser({
    userId: ctx.user.id,
    password: accountSummary.hasCredentialAccount ? password : undefined,
  });
  if (!authDelete.ok) {
    // Local + Stripe are already settled — still succeed so the user is logged
    // out of Plott. Log the auth cleanup failure for support follow-up.
    captureError(new Error(authDelete.error), {
      userId: ctx.user.id,
      companyId: ctx.company.id,
      extra: { action: "account_delete_neon_auth" },
    });
    logger.error(
      { userId: ctx.user.id, error: authDelete.error },
      "account_deleted_local_but_neon_auth_remains",
    );
  } else {
    logger.info(
      { userId: ctx.user.id, method: authDelete.method },
      "account_delete_neon_auth_ok",
    );
  }

  await clearSecondFactorVerification();

  const totalRefunded = stripeResults.reduce(
    (sum, r) => sum + r.refundedAmount,
    0,
  );
  const refundCurrency =
    stripeResults.find((r) => r.currency)?.currency ?? null;

  if (recipientEmail) {
    try {
      await sendAccountDeletedEmail({
        to: recipientEmail,
        companyName: companyNameForEmail,
        refundedAmount: totalRefunded,
        currency: refundCurrency,
      });
    } catch (err) {
      captureError(err, {
        userId: ctx.user.id,
        companyId: ctx.company.id,
        extra: { action: "account_delete_email" },
      });
      logger.error(
        { err, userId: ctx.user.id, to: recipientEmail },
        "account_delete_email_failed",
      );
    }
  }

  logger.info(
    {
      userId: ctx.user.id,
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
