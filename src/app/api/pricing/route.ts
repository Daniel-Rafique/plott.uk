import { NextResponse } from "next/server";
import { loadPlans } from "@/lib/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const plans = await loadPlans();
  return NextResponse.json({
    plans: plans.map((p) => ({
      id: p.id,
      name: p.name,
      tagline: p.tagline,
      features: p.features,
      priceLabel: p.priceLabel ?? null,
      interval: p.interval ?? null,
      highlight: Boolean(p.highlight),
      aiBudgetGbp: p.aiBudgetGbp,
      savedSearchLimit: p.savedSearchLimit,
      pinnedApplicationLimit: p.pinnedApplicationLimit,
      seatLimit: p.seatLimit,
      extraSeatPriceLabel: p.extraSeatPriceLabel ?? null,
    })),
  });
}
