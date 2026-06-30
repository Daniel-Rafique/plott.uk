import { afterEach, describe, expect, it } from "vitest";
import {
  configuredExtraSeatPriceIds,
  resolveExtraSeatPriceId,
} from "@/lib/stripe/seat-prices";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("seat-prices", () => {
  it("resolves configured extra seat price ids by plan and interval", () => {
    process.env.STRIPE_PRICE_EXTRA_SEAT_PRO = "price_seat_pro";
    process.env.STRIPE_PRICE_EXTRA_SEAT_PRO_ANNUAL = "price_seat_pro_year";

    expect(resolveExtraSeatPriceId("pro", "month")).toBe("price_seat_pro");
    expect(resolveExtraSeatPriceId("pro", "year")).toBe("price_seat_pro_year");
    expect(resolveExtraSeatPriceId("starter", "month")).toBeNull();
    expect(configuredExtraSeatPriceIds().has("price_seat_pro")).toBe(true);
  });
});
