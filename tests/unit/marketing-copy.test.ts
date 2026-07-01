import { describe, expect, it } from "vitest";
import {
  AUTH_STATS,
  BY_THE_NUMBERS_STATS,
  MARKETING_STATS,
  lpaCoverageShort,
} from "@/lib/marketing/copy";

describe("marketing copy", () => {
  it("keeps stats aligned across auth and homepage", () => {
    expect(AUTH_STATS[0]?.value).toBe(MARKETING_STATS.applicationsIndexed.display);
    expect(AUTH_STATS[1]?.value).toBe(MARKETING_STATS.lpaCount.display);
    expect(AUTH_STATS[2]?.value).toBe(MARKETING_STATS.applicantMatchRate.display);
    expect(BY_THE_NUMBERS_STATS[2]?.value).toBe(
      MARKETING_STATS.applicantMatchRate.value,
    );
  });

  it("uses consistent LPA coverage label", () => {
    expect(lpaCoverageShort()).toBe("337 LPAs covered");
  });
});
