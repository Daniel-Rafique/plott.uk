import { describe, expect, it } from "vitest";
import { assessEmailContact } from "@/lib/contact-quality";

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
