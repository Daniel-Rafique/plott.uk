/**
 * Client-safe pipeline / ballpark constants and formatters.
 * Keep free of Prisma, PostHog server, and other Node-only imports.
 */

export const PIPELINE_STAGES = [
  "new",
  "contacted",
  "replied",
  "visit_booked",
  "quoted",
  "won",
  "lost",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  new: "New",
  contacted: "Contacted",
  replied: "Replied",
  visit_booked: "Visit booked",
  quoted: "Quoted",
  won: "Won",
  lost: "Lost",
};

export function isPipelineStage(value: string): value is PipelineStage {
  return (PIPELINE_STAGES as readonly string[]).includes(value);
}

export const BALLPARK_DISCLAIMER =
  "This is an indicative ballpark based on similar projects and is not a formal quotation. A site survey is required before any price is confirmed.";

export const BALLPARK_CONFIDENCE_THRESHOLD = 0.55;

export function formatBallparkRange(minGbp: number, maxGbp: number): string {
  const fmt = (n: number) =>
    `£${Math.round(n).toLocaleString("en-GB")}`;
  if (minGbp === maxGbp) return fmt(minGbp);
  return `${fmt(minGbp)}–${fmt(maxGbp)}`;
}

export function formatBallparkWeeks(weeks: number): string {
  const rounded = Math.round(weeks * 10) / 10;
  if (rounded === 1) return "about 1 week";
  return `about ${rounded} weeks`;
}
