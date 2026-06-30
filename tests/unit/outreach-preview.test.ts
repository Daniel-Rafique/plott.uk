import { describe, expect, it } from "vitest";
import type { Company, User } from "@prisma/client";
import { renderApprovalPreviewHtml } from "@/lib/outreach-preview";

const company = {
  id: "co_1",
  name: "Acme Builders Ltd",
  addressLines: "1 High Street\nLondon",
  email: "hello@acme.test",
} as Pick<Company, "id" | "name" | "addressLines" | "email"> as Company;

const user = {
  id: "user_1",
  email: "jane@acme.test",
  name: "Jane Smith",
  signatureSvg: null,
  signatureBlobUrl: null,
  signatoryTitle: "Director",
} as Pick<
  User,
  "id" | "email" | "name" | "signatureSvg" | "signatureBlobUrl" | "signatoryTitle"
> as User;

describe("outreach-preview", () => {
  it("renders branded letter HTML with body-only draft content", () => {
    const html = renderApprovalPreviewHtml({
      channel: "letter",
      approval: { subjectRef: "24/01234/FUL", kind: "outreach_letter" },
      draft: {
        subject: "Planning support at 1 High Street",
        letterBodyHtml: "<p>We noticed your recent application.</p>",
        recipient: { name: "Mr A Smith", addressLines: "2 Oak Lane\nLondon" },
      },
      company,
      user,
    });

    expect(html).toContain("Acme Builders Ltd");
    expect(html).toContain("We noticed your recent application");
    expect(html).not.toContain("Dear Mr A Smith");
  });

  it("renders email preview with override subject and body", () => {
    const html = renderApprovalPreviewHtml({
      channel: "email",
      approval: { subjectRef: "24/01234/FUL", kind: "outreach_letter" },
      draft: {
        subject: "Letter subject",
        letterBodyHtml: "<p>Letter body</p>",
        emailBodyHtml: "<p>Original email</p>",
        emailSubject: "Original subject",
      },
      company,
      user,
      overrides: {
        emailSubject: "Quick question about your application",
        emailBodyHtml: "<p>Override email body</p>",
      },
    });

    expect(html).toContain("Quick question about your application");
    expect(html).toContain("Override email body");
    expect(html).not.toContain("Original email");
  });
});
