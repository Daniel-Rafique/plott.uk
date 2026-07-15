import { describe, expect, it } from "vitest";
import {
  freeTrialEyebrow,
  startFreeTrialLabel,
  trialChargeCopy,
} from "@/lib/trial";

describe("subscribe marketing copy", () => {
  it("does not promise a free trial", () => {
    expect(freeTrialEyebrow()).toBe("Cancel anytime");
    expect(startFreeTrialLabel()).toBe("Get started");
    expect(trialChargeCopy()).toContain("billed at checkout");
    expect(trialChargeCopy().toLowerCase()).not.toContain("trial");
  });
});
