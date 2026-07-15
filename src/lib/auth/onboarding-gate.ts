/**
 * Shared onboarding stage resolver.
 *
 * Every gated page in the signup funnel calls `resolveStage()` and redirects
 * forward if the user has already advanced. This keeps back/forward navigation
 * idempotent and guarantees that no page in `/app/*` is ever reachable without
 * usable subscription access.
 */
import { getSessionUser } from "@/lib/auth/session";
import { ensureUserAndPersonalCompany } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { hasSubscriptionAccess } from "@/lib/subscription-entitlement";
import { userNeedsSecondFactor } from "@/lib/auth/second-factor";
import { sanitizeNext } from "@/lib/auth/sanitize-next";
import type { Company, Membership, User } from "@prisma/client";
import type { SessionUser } from "@/lib/auth/session";

export type OnboardingStage =
  | { stage: "unauthenticated" }
  | { stage: "unverified"; user: SessionUser }
  | { stage: "pending_invite"; user: SessionUser; invitePath: string }
  | {
      stage: "needs_company";
      user: SessionUser;
      dbUser: User;
      company: Company;
      membership: Membership;
    }
  | {
      stage: "needs_plan";
      user: SessionUser;
      dbUser: User;
      company: Company;
      membership: Membership;
    }
  | {
      stage: "ready";
      user: SessionUser;
      dbUser: User;
      company: Company;
      membership: Membership;
    };

export const STAGE_REDIRECTS = {
  unauthenticated: "/auth/sign-in",
  unverified: "/auth/verify-email",
  pending_invite: "/invites",
  needs_company: "/onboarding",
  needs_plan: "/subscribe",
  ready: "/app/dashboard",
} as const;

function hasActiveSub(
  company: Pick<
    Company,
    "subscriptionStatus" | "subscriptionCurrentPeriodEnd" | "trialEndsAt"
  >,
): boolean {
  if (process.env.SKIP_SUBSCRIPTION_CHECK === "true") return true;
  return hasSubscriptionAccess(company);
}

export function redirectForStage(stage: OnboardingStage): string {
  if (stage.stage === "pending_invite") return stage.invitePath;
  return STAGE_REDIRECTS[stage.stage];
}

/**
 * Single post-auth destination for `/continue` (and similar entry points).
 * Applies preferred `next` when safe, and routes ready users who still need
 * email 2FA straight to `/auth/two-factor` — avoiding /app → 2FA bounce.
 */
export async function resolvePostAuthPath(
  stage: OnboardingStage,
  preferredNext?: string | null,
): Promise<string> {
  const next = sanitizeNext(preferredNext);

  if (stage.stage === "unauthenticated") {
    return next
      ? `/auth/sign-in?next=${encodeURIComponent(next)}`
      : STAGE_REDIRECTS.unauthenticated;
  }

  if (stage.stage === "ready") {
    if (await userNeedsSecondFactor(stage.dbUser.id)) {
      return "/auth/two-factor";
    }
    if (next) return next;
    return STAGE_REDIRECTS.ready;
  }

  if (stage.stage === "needs_company") {
    if (next?.startsWith("/subscribe")) {
      return `/onboarding?next=${encodeURIComponent(next)}`;
    }
    return STAGE_REDIRECTS.needs_company;
  }

  if (stage.stage === "needs_plan") {
    if (next?.startsWith("/subscribe")) return next;
    return STAGE_REDIRECTS.needs_plan;
  }

  return redirectForStage(stage);
}

export async function resolveStage(): Promise<OnboardingStage> {
  const user = await getSessionUser();
  if (!user) return { stage: "unauthenticated" };
  if (!user.emailVerified) return { stage: "unverified", user };

  const email = user.email?.toLowerCase();
  if (email) {
    const pendingInvite = await prisma.invite.findFirst({
      where: {
        email,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { token: true },
      orderBy: { createdAt: "desc" },
    });
    if (pendingInvite) {
      return {
        stage: "pending_invite",
        user,
        invitePath: `/invites/${pendingInvite.token}`,
      };
    }
  }

  // Only materialise tenant rows once verified - keeps the DB clean if the
  // user abandons at the verification step.
  const { user: dbUser, company, membership } =
    await ensureUserAndPersonalCompany(user);

  if (!company.onboardingCompletedAt) {
    return { stage: "needs_company", user, dbUser, company, membership };
  }

  if (!hasActiveSub(company)) {
    // Fallback: check if user belongs to any team with usable paid access.
    // Invited team members should be covered by the team's plan, not need their own.
    const teamMemberships = await prisma.membership.findMany({
      where: {
        userId: user.id,
      },
      include: { company: true },
    });
    const teamMembership = teamMemberships.find((membership) =>
      hasActiveSub(membership.company),
    );

    if (!teamMembership) {
      return { stage: "needs_plan", user, dbUser, company, membership };
    }

    if (dbUser.activeCompanyId !== teamMembership.companyId) {
      await prisma.user.update({
        where: { id: dbUser.id },
        data: { activeCompanyId: teamMembership.companyId },
      });
    }

    return {
      stage: "ready",
      user,
      dbUser: { ...dbUser, activeCompanyId: teamMembership.companyId },
      company: teamMembership.company,
      membership: teamMembership,
    };
  }

  return { stage: "ready", user, dbUser, company, membership };
}
