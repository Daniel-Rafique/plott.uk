import type { PlanningApplicationEntity } from "@/lib/planning-data";

function normalise(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function present(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim() !== "";
}

export function hasApplicantOrCompanyMetadata(
  entity: PlanningApplicationEntity,
): boolean {
  return (
    present(entity.enrichment?.applicantName) ||
    present(entity.enrichment?.companyName)
  );
}

export function matchesApplicantOrCompanyQuery(
  entity: PlanningApplicationEntity,
  query: string | null | undefined,
): boolean {
  const needle = normalise(query ?? "");
  if (!needle) return false;

  const haystackParts = [
    entity.enrichment?.applicantName,
    entity.enrichment?.companyName,
    entity.enrichment?.agentName,
    entity.enrichment?.agentAddress,
    entity.description,
  ]
    .filter((value): value is string => present(value))
    .map(normalise);
  const haystack = haystackParts.join(" | ");
  if (!haystack) return false;
  if (haystack.includes(needle)) return true;

  const tokens = needle.split(/\s+/).filter((token) => token.length > 2);
  return tokens.length > 0 && tokens.every((token) => haystack.includes(token));
}

function rankScore(
  entity: PlanningApplicationEntity,
  query: string | null | undefined,
): number {
  if (matchesApplicantOrCompanyQuery(entity, query)) return 2;
  if (hasApplicantOrCompanyMetadata(entity)) return 1;
  return 0;
}

function confidenceScore(entity: PlanningApplicationEntity): number {
  if (entity.enrichment?.confidence === "high") return 3;
  if (entity.enrichment?.confidence === "medium") return 2;
  if (entity.enrichment?.confidence === "low") return 1;
  return 0;
}

export function rankPlanningResultsByApplicantOrCompany(
  entities: PlanningApplicationEntity[],
  query?: string | null,
): PlanningApplicationEntity[] {
  return entities
    .map((entity, index) => ({
      entity,
      index,
      score: rankScore(entity, query),
      confidence: confidenceScore(entity),
    }))
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      if (a.score > 0 && a.confidence !== b.confidence) {
        return b.confidence - a.confidence;
      }
      return a.index - b.index;
    })
    .map((item) => item.entity);
}

export function countApplicantOrCompanyMatches(
  entities: PlanningApplicationEntity[],
  query: string | null | undefined,
): number {
  return entities.reduce(
    (count, entity) =>
      count + (matchesApplicantOrCompanyQuery(entity, query) ? 1 : 0),
    0,
  );
}
