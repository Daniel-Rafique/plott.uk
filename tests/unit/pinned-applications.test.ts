import { describe, expect, it } from "vitest";
import {
  comparePinnedApplicationSnapshots,
  isPinnedApplicationTerminal,
  nextPinnedApplicationCheckAt,
} from "@/lib/pinned-applications";

describe("pinned application monitoring", () => {
  it("detects tracked snapshot fields", () => {
    const changes = comparePinnedApplicationSnapshots(
      {
        reference: "24/1234/FUL",
        status: "Pending",
        decision: null,
        decisionDate: null,
      },
      {
        reference: "24/1234/FUL",
        councilId: "camden",
        planningEntity: null,
        siteAddress: "1 High Street",
        description: "New homes",
        status: "Decided",
        decision: "Granted",
        decisionDate: "2026-04-29",
        sourceUrl: "https://example.com/application",
      },
    );

    expect(changes.map((c) => c.field)).toEqual([
      "status",
      "decision",
      "decisionDate",
      "siteAddress",
      "description",
      "sourceUrl",
    ]);
  });

  it("checks weekly when the target decision is roughly 12 weeks away", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const next = nextPinnedApplicationCheckAt({
      now,
      targetDecisionDate: "2026-03-26",
      status: "Pending",
      decision: null,
      fallbackFrequency: "daily",
    });

    expect(next.toISOString()).toBe("2026-01-08T00:00:00.000Z");
  });

  it("increases check cadence as the target decision date approaches", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");

    expect(
      nextPinnedApplicationCheckAt({
        now,
        targetDecisionDate: "2026-02-12",
        status: "Pending",
        decision: null,
      }).toISOString(),
    ).toBe("2026-01-04T00:00:00.000Z");

    expect(
      nextPinnedApplicationCheckAt({
        now,
        targetDecisionDate: "2026-01-10",
        status: "Pending",
        decision: null,
      }).toISOString(),
    ).toBe("2026-01-02T00:00:00.000Z");
  });

  it("falls back to explicit frequency when no target date is known", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const next = nextPinnedApplicationCheckAt({
      now,
      fallbackFrequency: "weekly",
      status: "Pending",
      decision: null,
    });

    expect(next.toISOString()).toBe("2026-01-08T00:00:00.000Z");
  });

  it("backs off terminal applications to monthly checks", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");

    expect(isPinnedApplicationTerminal({ decision: "Refused" })).toBe(true);
    expect(
      nextPinnedApplicationCheckAt({
        now,
        targetDecisionDate: "2026-01-10",
        status: "Decided",
        decision: "Granted",
      }).toISOString(),
    ).toBe("2026-01-29T00:00:00.000Z");
  });
});
