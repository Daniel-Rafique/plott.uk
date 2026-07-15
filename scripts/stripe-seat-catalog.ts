/**
 * Extra-seat licensed add-on prices (billed per seat over plan limit).
 * Separate from Stripe Entitlements Features — these are real subscription line items.
 */

import type { BillingInterval } from "./stripe-plan-catalog";
import type { PlanId } from "./stripe-plan-catalog";
import { ANNUAL_MONTHS_PAID } from "./stripe-plan-catalog";

export type SeatAddonCatalogEntry = {
  envVar:
    | "STRIPE_PRICE_EXTRA_SEAT_PRO"
    | "STRIPE_PRICE_EXTRA_SEAT_PRO_ANNUAL"
    | "STRIPE_PRICE_EXTRA_SEAT_AGENCY"
    | "STRIPE_PRICE_EXTRA_SEAT_AGENCY_ANNUAL";
  planId: Extract<PlanId, "pro" | "agency">;
  interval: BillingInterval;
  productName: string;
  amountPence: number;
  priceNickname: string;
};

const PRO_SEAT_MONTHLY_PENCE = 9900;
const AGENCY_SEAT_MONTHLY_PENCE = 9900;

export const SEAT_ADDON_CATALOG: SeatAddonCatalogEntry[] = [
  {
    envVar: "STRIPE_PRICE_EXTRA_SEAT_PRO",
    planId: "pro",
    interval: "month",
    productName: "Plott Pro — extra seat",
    amountPence: PRO_SEAT_MONTHLY_PENCE,
    priceNickname: "Pro extra seat / monthly",
  },
  {
    envVar: "STRIPE_PRICE_EXTRA_SEAT_PRO_ANNUAL",
    planId: "pro",
    interval: "year",
    productName: "Plott Pro — extra seat",
    amountPence: PRO_SEAT_MONTHLY_PENCE * ANNUAL_MONTHS_PAID,
    priceNickname: "Pro extra seat / annual",
  },
  {
    envVar: "STRIPE_PRICE_EXTRA_SEAT_AGENCY",
    planId: "agency",
    interval: "month",
    productName: "Plott Agency — extra seat",
    amountPence: AGENCY_SEAT_MONTHLY_PENCE,
    priceNickname: "Agency extra seat / monthly",
  },
  {
    envVar: "STRIPE_PRICE_EXTRA_SEAT_AGENCY_ANNUAL",
    planId: "agency",
    interval: "year",
    productName: "Plott Agency — extra seat",
    amountPence: AGENCY_SEAT_MONTHLY_PENCE * ANNUAL_MONTHS_PAID,
    priceNickname: "Agency extra seat / annual",
  },
];
