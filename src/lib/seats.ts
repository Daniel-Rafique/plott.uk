import { prisma } from "@/lib/prisma";
import {
  getCompanyBillingInterval,
  getCompanyPlan,
  type Plan,
} from "@/lib/pricing";
import {
  fetchStripePricesById,
  formatPriceMinor,
  priceMinorUnits,
} from "@/lib/stripe/price-display";
import {
  planAllowsExtraSeats,
  resolveExtraSeatPriceId,
} from "@/lib/stripe/seat-prices";
import { planForPriceId } from "@/lib/stripe/plan-prices";

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
  /** Whether the company allows seat overages (Stripe extra-seat price configured). */
  overageAllowed: boolean;
  /** Human-readable price for each overage seat, from Stripe when available. */
  overagePriceLabel: string | null;
  /** The current plan. */
  plan: Plan;
};

async function extraSeatPriceLabelForCompany(company: {
  subscriptionPriceId: string | null;
}): Promise<string | null> {
  const planId = planForPriceId(company.subscriptionPriceId ?? undefined);
  if (!planId || !planAllowsExtraSeats(planId)) return null;
  const interval = getCompanyBillingInterval(company);
  const priceId = resolveExtraSeatPriceId(planId, interval);
  if (!priceId) return null;
  const byId = await fetchStripePricesById([priceId]);
  const price = byId.get(priceId);
  if (!price) return null;
  const minor = priceMinorUnits(price);
  if (minor == null || !price.currency) return null;
  return `${formatPriceMinor(minor, price.currency)}/seat`;
}

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
  const overageAllowed = planAllowsExtraSeats(plan.id);
  const overagePriceLabel = overageAllowed
    ? await extraSeatPriceLabelForCompany(company)
    : null;

  return {
    members,
    pendingInvites,
    total,
    limit: plan.seatLimit,
    overage,
    overageAllowed,
    overagePriceLabel,
    plan,
  };
}
