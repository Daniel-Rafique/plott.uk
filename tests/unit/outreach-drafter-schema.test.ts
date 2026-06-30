import { describe, expect, it } from "vitest";
import {
  outreachDraftAgentOutputSchema,
  outreachDraftOutputSchema,
} from "@/lib/ai/agents/outreach-drafter";

describe("outreach drafter schema", () => {
  it("accepts agent output without recipient or legalBasis", () => {
    const parsed = outreachDraftAgentOutputSchema.safeParse({
      subject: "Planning support for your application",
      letterBodyHtml:
        "<p>We specialise in planning-led construction near your site.</p><p>Reply remove to opt out.</p>",
      emailSubject: "Quick question about 24/01234/FUL",
      emailBodyHtml:
        "<p>Hi — we noticed your planning application and may be able to help.</p><p>Reply remove to opt out.</p>",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts full stored draft with server-side recipient fields", () => {
    const parsed = outreachDraftOutputSchema.safeParse({
      subject: "Planning support for your application",
      letterBodyHtml:
        "<p>We specialise in planning-led construction near your site.</p><p>Reply remove to opt out.</p>",
      emailSubject: "Quick question about 24/01234/FUL",
      emailBodyHtml:
        "<p>Hi — we noticed your planning application and may be able to help.</p><p>Reply remove to opt out.</p>",
      recipient: { name: "Jane Agent", addressLines: "1 High Street\nLondon" },
      legalBasis: "legitimate_interest",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts letter-only output without email fields", () => {
    const parsed = outreachDraftOutputSchema.safeParse({
      subject: "Planning support",
      letterBodyHtml:
        "<p>We noticed your application and would welcome a brief conversation.</p><p>Reply remove to opt out.</p>",
      recipient: { name: "Sir or Madam", addressLines: "1 High Street" },
      legalBasis: "legitimate_interest",
    });
    expect(parsed.success).toBe(true);
  });
});
