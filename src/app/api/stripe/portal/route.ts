import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST() {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!ctx.company.stripeCustomerId) {
    return NextResponse.json(
      { error: "No Stripe customer on file. Subscribe first." },
      { status: 400 },
    );
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "https://plott.uk";
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: ctx.company.stripeCustomerId,
    return_url: `${origin}/app/settings/billing`,
  });

  return NextResponse.json({ url: session.url });
}
