import { describe, expect, it } from "vitest";
import {
  assessEmailContact,
  assessPostalAddress,
  formatUkPostalAddressLines,
  postalAddressesEquivalent,
} from "@/lib/contact-quality";

describe("assessPostalAddress", () => {
  it("accepts single-line UK addresses by splitting before the postcode", () => {
    const address = "4 GRANARY ROW TATTERSHALL LINCOLN LN4 4LP";
    expect(formatUkPostalAddressLines(address)).toBe(
      "4 GRANARY ROW TATTERSHALL LINCOLN\nLN4 4LP",
    );

    const result = assessPostalAddress(address);
    expect(result.ok).toBe(true);
    expect(result.code).toBe("address_ok");
  });

  it("keeps multi-line addresses unchanged", () => {
    const address = "1 High Street\nLondon\nSW1A 1AA";
    expect(formatUkPostalAddressLines(address)).toBe(address);
    expect(assessPostalAddress(address).ok).toBe(true);
  });
});

describe("postalAddressesEquivalent", () => {
  it("treats spacing and line breaks as equivalent", () => {
    expect(
      postalAddressesEquivalent(
        "4 GRANARY ROW TATTERSHALL LINCOLN LN4 4LP",
        "4 Granary Row\nTattershall Lincoln\nLN4 4LP",
      ),
    ).toBe(true);

    expect(
      postalAddressesEquivalent(
        "4 GRANARY ROW TATTERSHALL LINCOLN LN4 4LP",
        "1 Other Street\nLN4 4LP",
      ),
    ).toBe(false);
  });
});

describe("assessEmailContact", () => {
  it("blocks weak applicant email when draft contact matches applicant", () => {
    const result = assessEmailContact({
      contactEmail: "weak@example.com",
      contactKind: "applicant",
      applicantEmail: "weak@example.com",
      applicantEmailStatus: "risky",
      applicantEmailConfidence: 30,
      agentEmail: "agent@example.com",
    });

    expect(result.ok).toBe(false);
    expect(result.blocking).toBe(true);
    expect(result.code).toBe("email_low_confidence");
    expect(result.preferredEmail).toBe("agent@example.com");
    expect(result.preferredSource).toBe("agent");
  });

  it("allows weak applicant email when force is true", () => {
    const result = assessEmailContact({
      contactEmail: "weak@example.com",
      contactKind: "applicant",
      applicantEmail: "weak@example.com",
      applicantEmailStatus: "risky",
      applicantEmailConfidence: 30,
      agentEmail: "agent@example.com",
      force: true,
    });

    expect(result.ok).toBe(true);
    expect(result.preferredEmail).toBe("weak@example.com");
  });

  it("accepts agent email on draft contact without blocking", () => {
    const result = assessEmailContact({
      contactEmail: "agent@example.com",
      contactKind: "agent",
      applicantEmail: "weak@example.com",
      applicantEmailStatus: "risky",
      applicantEmailConfidence: 20,
      agentEmail: "agent@example.com",
    });

    expect(result.ok).toBe(true);
    expect(result.preferredEmail).toBe("agent@example.com");
    expect(result.preferredSource).toBe("agent");
  });
});
