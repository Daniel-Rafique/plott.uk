import { describe, expect, it } from "vitest";
import {
  TRIAL_DAYS,
  freeTrialEyebrow,
  trialChargeCopy,
  trialDaysLabel,
} from "@/lib/trial";

describe("trial copy", () => {
  it("defaults to 3 days", () => {
    expect(TRIAL_DAYS).toBe(3);
  });

  it("formats trial labels consistently", () => {
    expect(trialDaysLabel()).toBe("3-days trial");
    expect(freeTrialEyebrow()).toBe("Free 3-day trial");
    expect(trialChargeCopy()).toContain("3-day trial");
  });
});
