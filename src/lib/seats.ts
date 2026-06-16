import { prisma } from "@/lib/prisma";
import { getCompanyPlan, type Plan } from "@/lib/pricing";

export type SeatUsage = {
  /** Number of active team members (accepted memberships). */
  members: number;
  /** Number of pending invites (not yet accepted, not expired). */
  pendingInvites: number;
  /** Total seats in use (members + pending invites). */
  total: number;
  /** Seats included in the current plan. */
  limit: number;
  /** Number of seats over the limit. */
  overage: number;
  /** Whether the company allows seat overages (has extraSeatPrice). */
  overageAllowed: boolean;
  /** Human-readable price for each overage seat, if applicable. */
  overagePriceLabel: string | null;
  /** The current plan. */
  plan: Plan;
};

/**
 * Get seat usage for a company.
 */
export async function getSeatUsage(companyId: string): Promise<SeatUsage> {
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    select: {
      subscriptionStatus: true,
      subscriptionPriceId: true,
      _count: {
        select: {
          memberships: true,
        },
      },
    },
  });

  const pendingInvites = await prisma.invite.count({
    where: {
      companyId,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
  });

  const plan = getCompanyPlan(company);
  const members = company._count.memberships;
  const total = members + pendingInvites;
  const overage = Math.max(0, total - plan.seatLimit);

  return {
    members,
    pendingInvites,
    total,
    limit: plan.seatLimit,
    overage,
    overageAllowed: plan.extraSeatPrice !== null,
    overagePriceLabel: plan.extraSeatPriceLabel ?? null,
    plan,
  };
}

