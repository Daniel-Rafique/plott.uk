import { describe, expect, it } from "vitest";
import {
  hasLeadingSalutation,
  renderLetterHtml,
  type LetterInput,
} from "@/lib/letter-renderer";
import type { Company } from "@prisma/client";

function company(partial: Partial<Company> = {}): Company {
  return {
    id: "co_1",
    name: "PLOTT UK",
    slug: "plott-uk",
    ...partial,
  } as Company;
}

function baseInput(partial: Partial<LetterInput> = {}): LetterInput {
  return {
    company: company(),
    user: {
      id: "u1",
      email: "hi@plott.uk",
      name: "Daniel",
      signatoryTitle: "Director",
    },
    addresseeName: "Mr James Eadie",
    addressLines: "16 Northfields Prospect\nSW18 1PE",
    reference: "2026/2364",
    siteAddress: "16 Northfields Prospect Business Centre Northfields SW18 1PE",
    ...partial,
  };
}

describe("hasLeadingSalutation", () => {
  it("detects Dear at the start of HTML bodies", () => {
    expect(hasLeadingSalutation("<p>Dear Mr James Eadie,</p><p>Hello</p>")).toBe(
      true,
    );
    expect(hasLeadingSalutation("<p>We write regarding…</p>")).toBe(false);
  });
});

describe("renderLetterHtml", () => {
  it("does not prepend Dear when the template already includes a salutation", () => {
    const { body, html } = renderLetterHtml(
      baseInput({
        templateBodyHtml:
          "<p>Dear {{addresseeName}},</p><p>We write regarding {{reference}}.</p>",
      }),
    );
    const dearCount = (body.match(/Dear Mr James Eadie/g) ?? []).length;
    expect(dearCount).toBe(1);
    expect(html).toContain("We write regarding 2026/2364.");
  });

  it("does not prepend Dear again when re-rendering a saved body", () => {
    const saved =
      "<p>Dear Mr James Eadie,</p>\n<p>Dear Mr James Eadie,</p>\n<p>Body text.</p>";
    const { body } = renderLetterHtml(
      baseInput({ templateBodyHtml: saved }),
    );
    // Leaves the saved body alone (even if already duplicated from a prior bug).
    expect(body).toBe(saved);
  });

  it("replaces known merge fields and blanks unknown appeal placeholders", () => {
    const { body } = renderLetterHtml(
      baseInput({
        templateBodyHtml: `<p>Dear {{addresseeName}},</p>
<p>Decision {{decisionDate}}. Reason: {{refusalReason}}.</p>
<p>Appeal ({{appealType}}) by {{deadlineDate}}. {{companyName}} can help.</p>`,
        decisionDate: "1 January 2026",
        refusalReason: "Overbearing impact",
      }),
    );
    expect(body).toContain("Decision 1 January 2026");
    expect(body).toContain("Overbearing impact");
    expect(body).toContain("PLOTT UK can help");
    expect(body).not.toContain("{{");
    expect(body).toContain("Appeal () by");
  });

  it("prepends Dear only for template bodies without a salutation", () => {
    const { body } = renderLetterHtml(
      baseInput({
        templateBodyHtml: "<p>About the works at {{siteAddress}}.</p>",
      }),
    );
    expect(body.startsWith("<p>Dear Mr James Eadie,</p>")).toBe(true);
    expect((body.match(/Dear Mr James Eadie/g) ?? []).length).toBe(1);
  });
});
