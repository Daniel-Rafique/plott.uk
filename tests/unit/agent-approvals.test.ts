import { describe, expect, it } from "vitest";
import { approvalPurpose } from "@/lib/agent-approvals";

describe("agent approval helpers", () => {
  it("keeps normal outreach approvals as outreach letters", () => {
    expect(
      approvalPurpose({
        kind: "outreach_letter",
        draftJson: { subject: "Hello" },
      }),
    ).toBe("outreach");
  });

  it("materialises appeal approvals with the appeal purpose", () => {
    expect(
      approvalPurpose({
        kind: "appeal_pitch_letter",
        draftJson: { subject: "Appeal support" },
      }),
    ).toBe("appeal_pitch");
  });

  it("honours appeal purpose embedded in the draft payload", () => {
    expect(
      approvalPurpose({
        kind: "outreach_letter",
        draftJson: {
          subject: "Appeal support",
          appeal: { purpose: "appeal_pitch" },
        },
      }),
    ).toBe("appeal_pitch");
  });
});
