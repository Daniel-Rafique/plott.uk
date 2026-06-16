import { prisma } from "@/lib/prisma";
import { getSessionUser, type SessionUser } from "@/lib/auth/session";
import { choosePreferredMembership } from "@/lib/tenant-selection";
import { hasSubscriptionAccess } from "@/lib/subscription-entitlement";
import type { Company, Membership, User } from "@prisma/client";

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

export type TenantContext = {
  user: SessionUser;
  company: Company;
  membership: Membership;
};

function slugFromEmail(email: string | null): string {
  const base = (email ?? "workspace")
    .split("@")[0]
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "workspace";
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}

function nameFromEmail(email: string | null): string {
  if (!email) return "My Workspace";
  const local = email.split("@")[0];
  if (!local) return "My Workspace";
  return `${local.charAt(0).toUpperCase()}${local.slice(1)}'s Workspace`;
}

/**
 * Upserts the user row (email/name from Neon Auth) without creating a Company.
 * Idempotent per request.
 */
export async function upsertUserFromSession(
  session: SessionUser,
): Promise<User> {
  // Mirror `emailVerified` from Neon Auth to our own DB column so downstream
  // jobs (email sends, analytics, background workers) don't have to hit Neon
  // Auth. We only move the timestamp forward — never back — so a transient
  // session missing the verified flag won't undo a genuine verification.
  const nowIfVerified = session.emailVerified ? new Date() : undefined;
  return prisma.user.upsert({
    where: { id: session.id },
    create: {
      id: session.id,
      email: session.email,
      name: session.name,
      emailVerifiedAt: nowIfVerified ?? null,
    },
    update: {
      email: session.email ?? undefined,
      name: session.name ?? undefined,
      emailVerifiedAt: nowIfVerified,
      updatedAt: new Date(),
    },
  });
}

/**
 * Upserts the user row and guarantees the user has at least one Company +
 * Membership. Existing active-company selection wins over creation order so
 * invited team members stay in the team workspace that accepted them.
 */
export async function ensureUserAndPersonalCompany(
  session: SessionUser,
): Promise<{ user: User; company: Company; membership: Membership }> {
  const user = await upsertUserFromSession(session);

  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    include: { company: true },
    orderBy: { createdAt: "asc" },
  });
  let membership = choosePreferredMembership(user, memberships);

  if (!membership) {
    const company = await prisma.company.create({
      data: {
        name: nameFromEmail(session.email),
        slug: slugFromEmail(session.email),
        email: session.email ?? undefined,
      },
    });
    membership = await prisma.membership.create({
      data: {
        userId: user.id,
        companyId: company.id,
        role: "owner",
      },
      include: { company: true },
    });
  }

  const activeId =
    user.activeCompanyId && user.activeCompanyId === membership.companyId
      ? user.activeCompanyId
      : membership.companyId;

  if (user.activeCompanyId !== activeId) {
    await prisma.user.update({
      where: { id: user.id },
      data: { activeCompanyId: activeId },
    });
  }

  return { user, company: membership.company, membership: membership };
}

export type TenantContextOptions = {
  /**
   * If true, unverified users are treated as unauthenticated (returns null)
   * and no personal company is materialized. Defaults to false so onboarding
   * surfaces (verify-email, subscribe, onboarding wizard) still work.
   *
   * All API routes under `/api/app/*` or anything that performs real
   * per-tenant work should pass `{ requireVerified: true }`.
   */
  requireVerified?: boolean;
};

/**
 * Resolves the active Company for the current session user, creating one if
 * missing. Throws a typed null for use in API routes — check with `!ctx`.
 */
export async function getTenantContext(
  opts: TenantContextOptions = {},
): Promise<TenantContext | null> {
  const user = await getSessionUser();
  if (!user) return null;
  if (opts.requireVerified && !user.emailVerified) return null;
  const { company, membership } = await ensureUserAndPersonalCompany(user);
  return { user, company, membership };
}

export function hasActiveSubscription(company: Company): boolean {
  if (process.env.SKIP_SUBSCRIPTION_CHECK === "true" && !isProductionRuntime()) {
    return true;
  }
  return hasSubscriptionAccess(company);
}

/**
 * Convenience: resolve tenant context and enforce auth + subscription gates for
 * an API route. Returns either a NextResponse to send back, or the context.
 *
 * Verified email is required — routes that are OK with unverified users should
 * call `getTenantContext()` directly.
 */
export async function requireSubscribedTenant(): Promise<
  | { ok: true; ctx: TenantContext }
  | { ok: false; status: number; body: { error: string } }
> {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return { ok: false, status: 401, body: { error: "Unauthorized" } };
  if (!hasActiveSubscription(ctx.company)) {
    return {
      ok: false,
      status: 403,
      body: { error: "Active subscription required" },
    };
  }
  return { ok: true, ctx };
}
