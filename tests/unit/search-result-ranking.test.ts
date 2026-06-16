import { describe, expect, it } from "vitest";
import type { PlanningApplicationEntity } from "@/lib/planning-data";
import {
  rankPlanningResultsByApplicantOrCompany,
  matchesApplicantOrCompanyQuery,
} from "@/lib/planning-result-ranking";
import {
  mapPlanwireToPlanningEntity,
  type PlanwireApplication,
} from "@/lib/planwire";

function entity(
  id: number,
  enrichment?: PlanningApplicationEntity["enrichment"],
): PlanningApplicationEntity {
  return {
    entity: id,
    description: `Application ${id}`,
    enrichment,
  };
}

function planwireApp(
  applicant: PlanwireApplication["applicant"],
): PlanwireApplication {
  return {
    id: "12345678-1234-1234-1234-123456789abc",
    councilId: "cam",
    reference: "2026/001",
    address: "1 Test Street",
    postcode: "NW1 1AA",
    lat: 51.5,
    lng: -0.12,
    description: "Test application",
    status: "approved",
    decision: "granted",
    decisionDate: "2026-01-01",
    url: "https://example.com/application",
    applicant,
  };
}

describe("planning result applicant/company ranking", () => {
  it("puts query matches before metadata-only rows and then plain rows", () => {
    const plain = entity(1);
    const metadataOnly = entity(2, { applicantName: "Other Applicant" });
    const companyMatch = entity(3, { companyName: "Berkeley Homes Limited" });

    const ranked = rankPlanningResultsByApplicantOrCompany(
      [plain, metadataOnly, companyMatch],
      "Berkeley Homes",
    );

    expect(ranked.map((row) => row.entity)).toEqual([3, 2, 1]);
  });

  it("keeps original order within the same rank group", () => {
    const firstMatch = entity(1, { applicantName: "Argent LLP" });
    const secondMatch = entity(2, { companyName: "Argent Related" });
    const firstMetadataOnly = entity(3, { applicantName: "Other Applicant" });
    const secondMetadataOnly = entity(4, { companyName: "Another Company" });

    const ranked = rankPlanningResultsByApplicantOrCompany(
      [firstMetadataOnly, firstMatch, secondMetadataOnly, secondMatch],
      "Argent",
    );

    expect(ranked.map((row) => row.entity)).toEqual([1, 2, 3, 4]);
  });

  it("uses confidence as a tiebreaker within relevance groups", () => {
    const lowConfidenceMatch = entity(1, {
      applicantName: "Argent LLP",
      confidence: "low",
    });
    const highConfidenceMatch = entity(2, {
      companyName: "Argent Related",
      confidence: "high",
    });
    const lowConfidenceMetadata = entity(3, {
      applicantName: "Other Applicant",
      confidence: "low",
    });
    const mediumConfidenceMetadata = entity(4, {
      companyName: "Another Company",
      confidence: "medium",
    });

    const ranked = rankPlanningResultsByApplicantOrCompany(
      [
        lowConfidenceMetadata,
        lowConfidenceMatch,
        mediumConfidenceMetadata,
        highConfidenceMatch,
      ],
      "Argent",
    );

    expect(ranked.map((row) => row.entity)).toEqual([2, 1, 4, 3]);
  });

  it("does not use confidence to reorder the non-relevant fallback group", () => {
    const highConfidenceFallback = entity(1, {
      agentName: "Other Agent",
      confidence: "high",
    });
    const lowConfidenceFallback = entity(2, {
      agentName: "Different Agent",
      confidence: "low",
    });

    const ranked = rankPlanningResultsByApplicantOrCompany(
      [highConfidenceFallback, lowConfidenceFallback],
      "Argent",
    );

    expect(ranked.map((row) => row.entity)).toEqual([1, 2]);
  });

  it("matches agent fields for existing applicant-style searches", () => {
    const row = entity(1, {
      applicantName: null,
      agentName: "Planning Partners",
      agentAddress: "1 Agent Street",
    });

    expect(matchesApplicantOrCompanyQuery(row, "Planning Partners")).toBe(true);
  });

  it("maps PlanWire company values into entity enrichment", () => {
    const mapped = mapPlanwireToPlanningEntity(
      planwireApp({
        name: "Jane Applicant",
        company: "Acme Developments Ltd",
        agent: "Agent Co",
      }),
    );

    expect(mapped.enrichment?.applicantName).toBe("Jane Applicant");
    expect(mapped.enrichment?.companyName).toBe("Acme Developments Ltd");
    expect(mapped.enrichment?.agentName).toBe("Agent Co");
  });

  it("creates enrichment when PlanWire only provides a company", () => {
    const mapped = mapPlanwireToPlanningEntity(
      planwireApp({ company: "Company Only Ltd" }),
    );

    expect(mapped.enrichment?.applicantName).toBeNull();
    expect(mapped.enrichment?.companyName).toBe("Company Only Ltd");
  });
});
