import { describe, expect, it } from "vitest";
import {
  buildPipelineContactSummary,
  formatWorkTypeLabel,
  pipelineWorkTypeLabel,
} from "@/lib/pipeline-display";

describe("pipeline-display", () => {
  it("formats work type keys for display", () => {
    expect(formatWorkTypeLabel("loft_conversion")).toBe("Loft Conversion");
    expect(formatWorkTypeLabel("general_works")).toBe("General Works");
    expect(formatWorkTypeLabel(null)).toBeNull();
  });

  it("prefers work type label over scope summary and description", () => {
    expect(
      pipelineWorkTypeLabel({
        workType: "rear_extension",
        scopeSummary: "Two-storey rear extension",
        description: "Extension to rear of dwelling",
      }),
    ).toBe("Rear Extension");
  });

  it("falls back to scope summary then truncated description", () => {
    expect(
      pipelineWorkTypeLabel({
        workType: null,
        scopeSummary: "Roof guardrail installation",
        description: "Safety guardrail system to roof perimeter",
      }),
    ).toBe("Roof guardrail installation");

    const long = "x".repeat(140);
    expect(
      pipelineWorkTypeLabel({
        workType: null,
        scopeSummary: null,
        description: long,
      }),
    ).toBe(`${"x".repeat(117)}…`);
  });

  it("prefers agent email as primary contact", () => {
    const summary = buildPipelineContactSummary({
      applicantName: "Jane Applicant",
      applicantEmail: "jane@example.com",
      agentName: "Acme Planning",
      agentEmail: "agent@acme.com",
    });

    expect(summary.applicantName).toBe("Jane Applicant");
    expect(summary.primaryEmail).toBe("agent@acme.com");
    expect(summary.primaryEmailLabel).toContain("Planning agent");
  });

  it("uses applicant email when no agent email exists", () => {
    const summary = buildPipelineContactSummary({
      applicantName: "Jane Applicant",
      applicantEmail: "jane@example.com",
      applicantEmailSource: "hunter",
      applicantEmailConfidence: 88,
    });

    expect(summary.primaryEmail).toBe("jane@example.com");
    expect(summary.primaryEmailLabel).toContain("hunter");
    expect(summary.primaryEmailLabel).toContain("88%");
  });
});
