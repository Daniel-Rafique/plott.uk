import type { PlanningApplicationEntity } from "@/lib/planning-data";
import type { PlanwireApplication } from "@/lib/planwire";

export type PinnedApplicationSnapshot = {
  reference: string;
  councilId: string | null;
  planningEntity: number | null;
  siteAddress: string | null;
  description: string | null;
  status: string | null;
  decision: string | null;
  decisionDate: string | null;
  sourceUrl: string | null;
};

export type PinnedApplicationChange = {
  field: keyof PinnedApplicationSnapshot;
  before: unknown;
  after: unknown;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function toPlanningEntity(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function snapshotFromPlanningEntity(
  app: Partial<PlanningApplicationEntity>,
): PinnedApplicationSnapshot {
  return {
    reference: cleanString(app.reference) ?? "",
    councilId: cleanString(app.councilId),
    planningEntity: toPlanningEntity(app.entity),
    siteAddress: cleanString(app["address-text"]),
    description: cleanString(app.description),
    status: cleanString(app["planning-application-status"]),
    decision: cleanString(app["planning-decision-type"]),
    decisionDate: cleanString(app["decision-date"]),
    sourceUrl: cleanString(app.sourceUrl),
  };
}

export function snapshotFromPlanwireApplication(
  app: PlanwireApplication,
): PinnedApplicationSnapshot {
  return {
    reference: app.reference,
    councilId: app.councilId || null,
    planningEntity: null,
    siteAddress: app.address || null,
    description: app.description || null,
    status: app.status || null,
    decision: app.decision || null,
    decisionDate: app.decisionDate || null,
    sourceUrl: app.url || null,
  };
}

export function comparePinnedApplicationSnapshots(
  before: Partial<PinnedApplicationSnapshot> | null | undefined,
  after: PinnedApplicationSnapshot,
): PinnedApplicationChange[] {
  if (!before) return [];

  const fields: (keyof PinnedApplicationSnapshot)[] = [
    "status",
    "decision",
    "decisionDate",
    "siteAddress",
    "description",
    "sourceUrl",
  ];

  return fields.flatMap((field) => {
    const beforeValue = before[field] ?? null;
    const afterValue = after[field] ?? null;
    return beforeValue === afterValue
      ? []
      : [{ field, before: beforeValue, after: afterValue }];
  });
}

export function changeTypeFromChanges(
  changes: PinnedApplicationChange[],
): string {
  if (changes.some((c) => c.field === "decision")) return "decision_changed";
  if (changes.some((c) => c.field === "status")) return "status_changed";
  if (changes.some((c) => c.field === "decisionDate")) return "decision_date_changed";
  return "application_changed";
}

export function parsePinnedApplicationDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? new Date(`${trimmed}T12:00:00.000Z`)
    : new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function intervalDaysForFrequency(freq: string | null | undefined): number {
  switch (freq) {
    case "weekly":
      return 7;
    case "monthly":
      return 28;
    case "quarterly":
      return 85;
    case "daily":
    default:
      return 1;
  }
}

function hasTerminalSignal(value: string | null | undefined): boolean {
  const text = cleanString(value)?.toLowerCase();
  if (!text) return false;
  if (/\b(pending|awaiting|undecided|under consideration|registered|received)\b/.test(text)) {
    return false;
  }
  return /\b(granted|approved|permitted|refused|rejected|declined|withdrawn|decided|decision issued|final)\b/.test(
    text,
  );
}

export function isPinnedApplicationTerminal(args: {
  status?: string | null;
  decision?: string | null;
}): boolean {
  return hasTerminalSignal(args.decision) || hasTerminalSignal(args.status);
}

export function nextPinnedApplicationCheckAt(args: {
  now?: Date;
  targetDecisionDate?: Date | string | null;
  status?: string | null;
  decision?: string | null;
  fallbackFrequency?: string | null;
}): Date {
  const now = args.now ?? new Date();

  if (isPinnedApplicationTerminal(args)) {
    return addDays(now, intervalDaysForFrequency("monthly"));
  }

  const targetDecisionDate = parsePinnedApplicationDate(args.targetDecisionDate);
  if (!targetDecisionDate) {
    return addDays(now, intervalDaysForFrequency(args.fallbackFrequency));
  }

  const daysUntilDecision = Math.ceil(
    (targetDecisionDate.getTime() - now.getTime()) / DAY_MS,
  );

  if (daysUntilDecision > 56) return addDays(now, 7);
  if (daysUntilDecision > 14) return addDays(now, 3);
  return addDays(now, 1);
}
