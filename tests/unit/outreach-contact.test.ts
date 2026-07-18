import { describe, expect, it } from "vitest";
import { rankCandidates } from "@/lib/outreach-contact";
import type { EnrichedApplication } from "@/lib/ai/agents/enrichment-agent";

function enrichment(
  partial: Partial<EnrichedApplication>,
): EnrichedApplication {
  return {
    applicantName: null,
    applicantAddress: null,
    applicantEmail: null,
    applicantEmailSource: null,
    applicantEmailConfidence: null,
    applicantEmailStatus: null,
    agentName: null,
    agentAddress: null,
    agentEmail: null,
    agentEmailSource: null,
    agentEmailConfidence: null,
    agentEmailStatus: null,
    agentPhone: null,
    caseOfficer: null,
    ward: null,
    confidence: "low",
    sources: [],
    ...partial,
  };
}

describe("outreach contact ranking", () => {
  it("carries applicant emails into ranked applicant candidates", () => {
    const candidates = rankCandidates(
      enrichment({
        applicantName: "Jane Smith, Director",
        applicantAddress: "Example Ltd, 1 High Street",
        applicantEmail: "jane@example.com",
        applicantEmailSource: "hunter",
        applicantEmailConfidence: 91,
        applicantEmailStatus: "valid",
        confidence: "high",
        sources: ["companies_house", "hunter"],
      }),
      "1 Site Road",
    );

    expect(candidates).toEqual([
      {
        kind: "applicant",
        name: "Jane Smith, Director",
        addressLines: "Example Ltd, 1 High Street",
        email: "jane@example.com",
        phone: null,
        source: "companies_house+hunter",
        confidence: "high",
      },
    ]);
  });

  it("prefers applicant over agent when agent email quality is weak", () => {
    const candidates = rankCandidates(
      enrichment({
        applicantName: "Jane Smith, Director",
        applicantAddress: "Example Ltd, 1 High Street",
        applicantEmail: "jane@example.com",
        applicantEmailConfidence: 91,
        applicantEmailStatus: "valid",
        agentName: "Planning Agents Ltd",
        agentAddress: "2 Agent Road",
        agentEmail: "info@planningagents.co.uk",
        agentEmailConfidence: 20,
        agentEmailStatus: "risky",
        confidence: "high",
        sources: ["hunter"],
      }),
      "1 Site Road",
    );

    expect(candidates.map((c) => c.kind)).toEqual(["applicant", "agent"]);
  });
});
