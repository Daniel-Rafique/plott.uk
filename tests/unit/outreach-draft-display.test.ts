import { describe, expect, it } from "vitest";
import {
  defaultPreviewChannel,
  emailBodyHtml,
  emailSourceLabel,
  emailSubject,
  letterBodyHtml,
  recipientEmail,
  toStoredDraftJson,
} from "@/lib/outreach-draft-display";
import {
  normalizeLetterBodyHtml,
  prepareLetterBodyHtml,
  validateLetterBodyShape,
} from "@/lib/letter-body-shape";

describe("outreach-draft-display", () => {
  it("resolves recipient email in contact then agent then applicant order", () => {
    expect(
      recipientEmail({
        contact: { email: "contact@example.com" },
        enrichment: { agentEmail: "agent@example.com" },
      }),
    ).toBe("contact@example.com");

    expect(recipientEmail({})).toBeNull();
  });

  it("defaults preview channel to email when an address exists", () => {
    expect(defaultPreviewChannel({ contact: { email: "a@b.com" } })).toBe(
      "email",
    );
    expect(defaultPreviewChannel({})).toBe("letter");
  });

  it("formats email source label with Hunter metadata", () => {
    expect(
      emailSourceLabel({
        contact: { kind: "agent", email: "jane@agency.com" },
        enrichment: {
          applicantEmailSource: "hunter",
          applicantEmailConfidence: 91,
        },
      }),
    ).toBe("Planning agent · via Hunter · 91% confidence");
  });

  it("falls back from legacy bodyHtml to channel bodies", () => {
    const draft = {
      subject: "Letter subject",
      bodyHtml: "<p>Legacy body</p>",
      emailSubject: "Inbox subject",
    };
    expect(letterBodyHtml(draft)).toBe("<p>Legacy body</p>");
    expect(emailBodyHtml(draft)).toBe("<p>Legacy body</p>");
    expect(emailSubject(draft)).toBe("Inbox subject");
  });

  it("prefers explicit dual-channel fields over bodyHtml", () => {
    const draft = {
      subject: "Letter subject",
      bodyHtml: "<p>Legacy</p>",
      letterBodyHtml: "<p>Letter only</p>",
      emailBodyHtml: "<p>Email only</p>",
      emailSubject: "Quick question",
    };
    expect(letterBodyHtml(draft)).toBe("<p>Letter only</p>");
    expect(emailBodyHtml(draft)).toBe("<p>Email only</p>");
  });

  it("builds stored draftJson with legacy bodyHtml alias", () => {
    expect(
      toStoredDraftJson(
        {
          subject: "Hello",
          letterBodyHtml: "<p>Body</p>",
          emailSubject: "Hi",
          emailBodyHtml: "<p>Email</p>",
          recipient: { name: "A", addressLines: "1 Road" },
          legalBasis: "legitimate_interest",
        },
        { contact: { kind: "agent" } },
      ),
    ).toMatchObject({
      subject: "Hello",
      letterBodyHtml: "<p>Body</p>",
      bodyHtml: "<p>Body</p>",
      emailSubject: "Hi",
      emailBodyHtml: "<p>Email</p>",
    });
  });
});

describe("letter-body-shape", () => {
  it("rejects salutation and sign-off in letter body", () => {
    const salutation = validateLetterBodyShape("<p>Dear Sir or Madam,</p><p>Text</p>");
    expect(salutation.ok).toBe(false);
    expect(salutation.issues.some((i) => i.code === "salutation_in_body")).toBe(
      true,
    );

    const signOff = validateLetterBodyShape(
      "<p>We can help.</p><p>Yours faithfully,</p>",
    );
    expect(signOff.ok).toBe(false);
    expect(signOff.issues.some((i) => i.code === "sign_off_in_body")).toBe(true);
  });

  it("strips model-added salutation, sign-off, and address-only paragraphs", () => {
    const normalized = normalizeLetterBodyHtml(
      `<p>Dear Sir or Madam,</p>
<p>68 Oakhill Road SW15 2QP</p>
<p>We noticed your planning application.</p>
<p>Yours faithfully,</p>`,
      { recipientAddressLines: "68 Oakhill Road\nSW15 2QP" },
    );

    expect(normalized).toBe("<p>We noticed your planning application.</p>");
    expect(prepareLetterBodyHtml(normalized).ok).toBe(true);
  });

  it("allows site address mentions inside prose", () => {
    const result = validateLetterBodyShape(
      "<p>We are writing regarding the safety guardrail at 68 Oakhill Road, SW15 2QP (ref: 2026/1299).</p><p>Reply remove to opt out.</p>",
      { recipientAddressLines: "68 Oakhill Road\nSW15 2QP" },
    );
    expect(result.ok).toBe(true);
  });

  it("accepts body-only paragraphs", () => {
    const result = validateLetterBodyShape(
      "<p>We noticed your planning application.</p><p>Reply remove to opt out.</p>",
    );
    expect(result.ok).toBe(true);
  });
});
