import { describe, expect, it } from "vitest";
import {
  buildPipelineContactSummary,
  deriveShortWorkLabel,
  extractWorkSnippetFromOutreachHtml,
  formatWorkTypeLabel,
  isUselessWorkLabel,
} from "@/lib/pipeline-display";

describe("pipeline-display", () => {
  it("formats work type keys for display", () => {
    expect(formatWorkTypeLabel("loft_conversion")).toBe("Loft Conversion");
    expect(formatWorkTypeLabel("general_works")).toBeNull();
    expect(formatWorkTypeLabel(null)).toBeNull();
  });

  it("rejects useless estimate placeholders", () => {
    expect(
      isUselessWorkLabel(
        "68 Oakhill Road SW15 2QP - planning application 2026/1299. No description provided; work type, scope and scale are enti…",
      ),
    ).toBe(true);
    expect(isUselessWorkLabel("Roof safety guardrail")).toBe(false);
  });

  it("prefers a concrete scope phrase over the rate-card work type key", () => {
    expect(
      deriveShortWorkLabel({
        workType: "rear_extension",
        scopeSummary: "Two-storey rear extension",
        description: "Extension to rear of dwelling",
      }),
    ).toBe("Two-storey rear extension");
  });

  it("uses letter text over general_works estimate placeholders", () => {
    const html =
      "<p>We note that planning permission has been sought for the installation of a safety guardrail system to the roof perimeter at 68 Oakhill Road, SW15 2QP (ref: 2026/1299).</p>";

    expect(extractWorkSnippetFromOutreachHtml(html)).toBe(
      "Safety guardrail system to the roof perimeter",
    );

    expect(
      deriveShortWorkLabel({
        workType: "general_works",
        scopeSummary:
          "68 Oakhill Road SW15 2QP - planning application 2026/1299. No description provided; work type, scope and scale are enti…",
        description: null,
        letterHtml: html,
      }),
    ).toBe("Safety guardrail system to the roof perimeter");
  });

  it("uses scope summary when it is a real job phrase", () => {
    expect(
      deriveShortWorkLabel({
        workType: "general_works",
        scopeSummary: "Roof perimeter safety guardrail",
        description: null,
      }),
    ).toBe("Roof perimeter safety guardrail");
  });

  it("extracts extensions from outreach copy", () => {
    const html =
      "<p>We noticed your recently submitted application (S/175/02271/23) for extensions to provide additional living accommodation at 4 Granary Row, and wanted to reach out.</p>";
    expect(extractWorkSnippetFromOutreachHtml(html)).toBe(
      "Extensions to provide additional living accommodation",
    );
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
