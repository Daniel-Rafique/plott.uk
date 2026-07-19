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

export const PIPELINE_PAGE_SIZES = [25, 50, 100] as const;

export type PipelinePageSize = (typeof PIPELINE_PAGE_SIZES)[number];

export const DEFAULT_PIPELINE_PAGE_SIZE: PipelinePageSize = 25;

export type PipelineStageFilter = "all" | PipelineStage;

/** me | all | unassigned | <userId> */
export type PipelineAssigneeScope = string;

export function isPipelinePageSize(value: number): value is PipelinePageSize {
  return (PIPELINE_PAGE_SIZES as readonly number[]).includes(value);
}

export function parsePipelinePageSize(
  value: string | null | undefined,
): PipelinePageSize {
  const n = Number(value);
  if (Number.isFinite(n) && isPipelinePageSize(n)) return n;
  return DEFAULT_PIPELINE_PAGE_SIZE;
}

export function parsePipelinePage(value: string | null | undefined): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

export function pipelineListSkip(page: number, pageSize: number): number {
  return Math.max(0, (Math.max(1, page) - 1) * pageSize);
}

export function pipelineTotalPages(total: number, pageSize: number): number {
  if (total <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}

export function clampPipelinePage(
  page: number,
  total: number,
  pageSize: number,
): number {
  const totalPages = pipelineTotalPages(total, pageSize);
  return Math.min(Math.max(1, page), totalPages);
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
