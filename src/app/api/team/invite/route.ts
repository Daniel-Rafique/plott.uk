import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";
import { sendInviteEmail } from "@/lib/email";
import { randomBytes } from "node:crypto";
import { captureServerEvent } from "@/lib/posthog-server";
import { getCompanyBillingInterval, getCompanyPlan } from "@/lib/pricing";
import { syncSeatBilling } from "@/lib/stripe/sync-seat-billing";
import {
  planAllowsExtraSeats,
  resolveExtraSeatPriceId,
} from "@/lib/stripe/seat-prices";
import {
  fetchStripePricesById,
  formatPriceMinor,
  priceMinorUnits,
} from "@/lib/stripe/price-display";
import { planForPriceId } from "@/lib/stripe/plan-prices";

export const runtime = "nodejs";

type Body = { email?: string; role?: string };

const INVITE_TTL_DAYS = 14;

export async function POST(req: Request) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (ctx.membership.role !== "owner" && ctx.membership.role !== "admin") {
    return NextResponse.json(
      { error: "Admin role required" },
      { status: 403 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!/.+@.+\..+/.test(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }
  const role = body.role === "admin" ? "admin" : "member";

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    const already = await prisma.membership.findUnique({
      where: { userId_companyId: { userId: existingUser.id, companyId: ctx.company.id } },
    });
    if (already) {
      return NextResponse.json(
        { error: "User is already a member" },
        { status: 409 },
      );
    }
  }

  const inviteeStatus: "existing" | "new" = existingUser ? "existing" : "new";

  // Seat limit enforcement
  const plan = getCompanyPlan(ctx.company);
  const [memberCount, pendingInviteCount] = await Promise.all([
    prisma.membership.count({ where: { companyId: ctx.company.id } }),
    prisma.invite.count({
      where: {
        companyId: ctx.company.id,
        expiresAt: { gt: new Date() },
      },
    }),
  ]);
  const totalSeats = memberCount + pendingInviteCount;

  if (totalSeats >= plan.seatLimit) {
    if (!planAllowsExtraSeats(plan.id)) {
      // No overage allowed — must upgrade
      return NextResponse.json(
        {
          error: "Seat limit reached",
          seatLimit: plan.seatLimit,
          currentSeats: totalSeats,
          upgrade: true,
        },
        { status: 403 },
      );
    }
    // Overage allowed — warn but proceed (billing handled via Stripe subscription quantity)
  }

  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(
    Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  const invite = await prisma.invite.create({
    data: {
      companyId: ctx.company.id,
      email,
      role,
      token,
      createdById: ctx.user.id,
      expiresAt,
    },
  });

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "https://plott.uk";
  const acceptUrl = `${origin}/invites/${token}`;
  await sendInviteEmail({
    to: email,
    companyName: ctx.company.name,
    inviterName: ctx.user.name ?? ctx.user.email ?? "A teammate",
    acceptUrl,
    inviteeStatus,
  });

  const isOverage = totalSeats >= plan.seatLimit;
  await syncSeatBilling(ctx.company.id).catch(() => {});

  let overagePrice: string | null = null;
  if (planAllowsExtraSeats(plan.id)) {
    const planId = planForPriceId(ctx.company.subscriptionPriceId ?? undefined);
    const interval = getCompanyBillingInterval(ctx.company);
    const seatPriceId =
      planId && planId !== "starter"
        ? resolveExtraSeatPriceId(planId, interval)
        : null;
    if (seatPriceId) {
      const byId = await fetchStripePricesById([seatPriceId]);
      const price = byId.get(seatPriceId);
      const minor = price ? priceMinorUnits(price) : null;
      if (price && minor != null && price.currency) {
        overagePrice = `${formatPriceMinor(minor, price.currency)}/seat`;
      }
    }
  }

  await captureServerEvent({
    distinctId: ctx.user.email ?? ctx.user.id,
    event: "team_member_invited",
    properties: {
      company_id: ctx.company.id,
      invitee_role: role,
      plan_id: plan.id,
      seat_limit: plan.seatLimit,
      current_seats: totalSeats + 1,
      is_overage: isOverage,
    },
  });

  return NextResponse.json({
    id: invite.id,
    acceptUrl,
    seatUsage: {
      current: totalSeats + 1,
      limit: plan.seatLimit,
      isOverage,
      overagePrice,
    },
  });
}
