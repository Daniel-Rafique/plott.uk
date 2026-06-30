import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";

export function priceMinorUnits(price: Stripe.Price): number | null {
  if (!price.currency) return null;
  if (price.unit_amount != null) return price.unit_amount;
  if (price.unit_amount_decimal != null) {
    return Math.round(parseFloat(String(price.unit_amount_decimal)));
  }
  return null;
}

export function formatPriceMinor(minor: number, currency: string): string {
  const n = minor / 100;
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  }).format(n);
}

export function formatStripePriceAmount(price: Stripe.Price): {
  priceLabel: string;
  currency: string;
  interval?: string;
} | null {
  const minor = priceMinorUnits(price);
  if (minor == null || !price.currency) return null;
  return {
    priceLabel: formatPriceMinor(minor, price.currency),
    currency: price.currency.toUpperCase(),
    interval: price.recurring?.interval ?? undefined,
  };
}

export function formatPriceLabelWithInterval(
  price: Stripe.Price | null,
): string | null {
  const formatted = price ? formatStripePriceAmount(price) : null;
  if (!formatted) return null;
  return formatted.interval
    ? `${formatted.priceLabel} / ${formatted.interval}`
    : formatted.priceLabel;
}

export function annualEffectiveMonthlyLabel(price: Stripe.Price): string | null {
  const minor = priceMinorUnits(price);
  if (minor == null || minor <= 0 || !price.currency) return null;
  const effective = minor / 12 / 100;
  const label = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: price.currency.toUpperCase(),
    maximumFractionDigits: effective % 1 === 0 ? 0 : 2,
  }).format(effective);
  return `~${label}/mo`;
}

export async function fetchStripePricesById(
  priceIds: string[],
): Promise<Map<string, Stripe.Price>> {
  const unique = [...new Set(priceIds.filter(Boolean))];
  if (!unique.length || !process.env.STRIPE_SECRET_KEY) {
    return new Map();
  }

  const stripe = getStripe();
  const prices = await Promise.all(
    unique.map((id) =>
      stripe.prices.retrieve(id, { expand: ["product"] }).catch(() => null),
    ),
  );
  return new Map(prices.filter((p) => p).map((p) => [p!.id, p!]));
}
