import { describe, expect, it } from "vitest";
import {
  defaultPreviewChannel,
  emailSourceLabel,
  recipientEmail,
} from "@/lib/outreach-draft-display";

describe("outreach-draft-display", () => {
  it("resolves recipient email in contact then agent then applicant order", () => {
    expect(
      recipientEmail({
        contact: { email: "contact@example.com" },
        enrichment: { agentEmail: "agent@example.com" },
      }),
    ).toBe("contact@example.com");

    expect(
      recipientEmail({
        enrichment: {
          agentEmail: "agent@example.com",
          applicantEmail: "applicant@example.com",
        },
      }),
    ).toBe("agent@example.com");

    expect(
      recipientEmail({
        enrichment: { applicantEmail: " applicant@example.com " },
      }),
    ).toBe("applicant@example.com");

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
});
