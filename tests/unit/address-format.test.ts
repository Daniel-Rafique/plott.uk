import { describe, it, expect } from "vitest";
import {
  formatUkAddressForAddressMatching,
  ukAddressSearchVariants,
} from "@/lib/address-format";

describe("address-format", () => {
  it("adds commas + normalises postcode spacing", () => {
    expect(formatUkAddressForAddressMatching("10 Downing Street SW1A2AA")).toBe(
      "10 Downing, Street, SW1A 2AA",
    );
  });

  it("leaves already-commaed addresses alone", () => {
    const already = "1 Test Road, London, SW1A 2AA";
    expect(formatUkAddressForAddressMatching(already)).toBe(already);
  });

  it("handles London as a city hint", () => {
    const out = formatUkAddressForAddressMatching(
      "1 Some Really Long Street Name London SW1A 2AA",
    );
    expect(out).toContain(", London, SW1A 2AA");
  });

  it("produces deduped variants", () => {
    const variants = ukAddressSearchVariants("10 Downing Street SW1A 2AA");
    expect(new Set(variants).size).toBe(variants.length);
    expect(variants.length).toBeGreaterThan(0);
  });
});
