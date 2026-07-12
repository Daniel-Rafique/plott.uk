import { describe, expect, it } from "vitest";
import {
  buildPipelineContactSummary,
  extractWorkSnippetFromOutreachHtml,
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
    ).toBe(`${"x".repeat(119)}…`);
  });

  it("does not show General Works when a specific scope or description exists", () => {
    expect(
      pipelineWorkTypeLabel({
        workType: "general_works",
        scopeSummary: "Two-storey side and rear extensions",
        description: "Extensions to provide additional living accommodation",
      }),
    ).toBe("Two-storey side and rear extensions");

    expect(
      pipelineWorkTypeLabel({
        workType: "general_works",
        scopeSummary: "Indicative scope from planning description.",
        description: "Extensions to provide additional living accommodation",
      }),
    ).toBe("Extensions to provide additional living accommodation");
  });

  it("extracts a concrete work phrase from outreach letter HTML", () => {
    const html =
      "<p>We noticed your recently submitted application (S/175/02271/23) for extensions to provide additional living accommodation at 4 Granary Row, and wanted to reach out.</p>";
    expect(extractWorkSnippetFromOutreachHtml(html)).toBe(
      "extensions to provide additional living accommodation",
    );

    expect(
      pipelineWorkTypeLabel({
        workType: "general_works",
        scopeSummary: "Indicative scope from planning description.",
        description: null,
        outreachSnippet: extractWorkSnippetFromOutreachHtml(html),
      }),
    ).toBe("extensions to provide additional living accommodation");
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
