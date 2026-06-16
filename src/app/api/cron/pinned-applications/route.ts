import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fetchPlanwireApplication } from "@/lib/planwire";
import {
  changeTypeFromChanges,
  comparePinnedApplicationSnapshots,
  nextPinnedApplicationCheckAt,
  snapshotFromPlanwireApplication,
  type PinnedApplicationSnapshot,
} from "@/lib/pinned-applications";
import { sendPinnedApplicationUpdateEmail } from "@/lib/email";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  if (auth === `Bearer ${secret}`) return true;
  return req.headers.get("x-vercel-cron-secret") === secret;
}

function dueForRun(freq: string, lastCheckedAt: Date | null, now: Date): boolean {
  if (!lastCheckedAt) return true;
  const delta = now.getTime() - lastCheckedAt.getTime();
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  switch (freq) {
    case "daily":
      return delta >= 22 * HOUR;
    case "weekly":
      return delta >= 6 * DAY;
    case "monthly":
      return delta >= 28 * DAY;
    case "quarterly":
      return delta >= 85 * DAY;
    default:
      return delta >= 22 * HOUR;
  }
}

function pinnedApplicationDue(row: {
  frequency: string;
  lastCheckedAt: Date | null;
  nextCheckAt: Date | null;
}, now: Date): boolean {
  if (row.nextCheckAt) return row.nextCheckAt.getTime() <= now.getTime();
  return dueForRun(row.frequency, row.lastCheckedAt, now);
}

function snapshotFromRow(row: {
  reference: string;
  councilId: string | null;
  planningEntity: bigint | null;
  siteAddress: string | null;
  description: string | null;
  status: string | null;
  decision: string | null;
  decisionDate: string | null;
  sourceUrl: string | null;
  lastSnapshotJson: Prisma.JsonValue | null;
}): PinnedApplicationSnapshot {
  if (row.lastSnapshotJson && typeof row.lastSnapshotJson === "object") {
    return row.lastSnapshotJson as PinnedApplicationSnapshot;
  }
  return {
    reference: row.reference,
    councilId: row.councilId,
    planningEntity: row.planningEntity == null ? null : Number(row.planningEntity),
    siteAddress: row.siteAddress,
    description: row.description,
    status: row.status,
    decision: row.decision,
    decisionDate: row.decisionDate,
    sourceUrl: row.sourceUrl,
  };
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const pinned = await prisma.pinnedApplication.findMany({
    where: { paused: false },
    include: { company: true },
  });

  const results: {
    id: string;
    ran: boolean;
    changed: boolean;
    error?: string;
  }[] = [];

  for (const pin of pinned) {
    if (!pinnedApplicationDue(pin, now)) {
      results.push({ id: pin.id, ran: false, changed: false });
      continue;
    }

    try {
      const latest = await fetchPlanwireApplication({
        reference: pin.reference,
        councilId: pin.councilId,
      });
      if (!latest) {
        await prisma.pinnedApplication.update({
          where: { id: pin.id },
          data: {
            lastCheckedAt: now,
            nextCheckAt: nextPinnedApplicationCheckAt({
              now,
              targetDecisionDate: pin.targetDecisionDate,
              status: pin.status,
              decision: pin.decision,
              fallbackFrequency: pin.frequency,
            }),
          },
        });
        results.push({ id: pin.id, ran: true, changed: false, error: "not_found" });
        continue;
      }

      const before = snapshotFromRow(pin);
      const after = {
        ...snapshotFromPlanwireApplication(latest),
        planningEntity: before.planningEntity,
      };
      const changes = comparePinnedApplicationSnapshots(before, after);

      if (!changes.length) {
        await prisma.pinnedApplication.update({
          where: { id: pin.id },
          data: {
            lastCheckedAt: now,
            nextCheckAt: nextPinnedApplicationCheckAt({
              now,
              targetDecisionDate: pin.targetDecisionDate,
              status: after.status,
              decision: after.decision,
              fallbackFrequency: pin.frequency,
            }),
            lastSnapshotJson: after as unknown as Prisma.InputJsonObject,
            siteAddress: after.siteAddress,
            description: after.description,
            status: after.status,
            decision: after.decision,
            decisionDate: after.decisionDate,
            sourceUrl: after.sourceUrl,
          },
        });
        results.push({ id: pin.id, ran: true, changed: false });
        continue;
      }

      const changeType = changeTypeFromChanges(changes);
      const event = await prisma.pinnedApplicationEvent.create({
        data: {
          pinnedApplicationId: pin.id,
          changeType,
          beforeJson: before as unknown as Prisma.InputJsonObject,
          afterJson: after as unknown as Prisma.InputJsonObject,
        },
      });

      let emailSent = false;
      try {
        if (pin.notifyEmails.length) {
          await sendPinnedApplicationUpdateEmail({
            to: pin.notifyEmails,
            companyName: pin.company.name,
            reference: pin.reference,
            siteAddress: after.siteAddress,
            description: after.description,
            applicationUrl: after.sourceUrl,
            changes,
          });
          await prisma.pinnedApplicationEvent.update({
            where: { id: event.id },
            data: { notifiedAt: now },
          });
          emailSent = true;
        }
      } catch (err) {
        logger.error({ err, pinnedApplicationId: pin.id }, "pinned_application_email_failed");
      }

      await prisma.pinnedApplication.update({
        where: { id: pin.id },
        data: {
          siteAddress: after.siteAddress,
          description: after.description,
          status: after.status,
          decision: after.decision,
          decisionDate: after.decisionDate,
          sourceUrl: after.sourceUrl,
          lastSnapshotJson: after as unknown as Prisma.InputJsonObject,
          lastCheckedAt: now,
          nextCheckAt: nextPinnedApplicationCheckAt({
            now,
            targetDecisionDate: pin.targetDecisionDate,
            status: after.status,
            decision: after.decision,
            fallbackFrequency: pin.frequency,
          }),
          lastNotifiedAt: emailSent ? now : pin.lastNotifiedAt,
        },
      });

      logger.info(
        { pinnedApplicationId: pin.id, changeType, changeCount: changes.length },
        "pinned_application_changed",
      );
      results.push({ id: pin.id, ran: true, changed: true });
    } catch (err) {
      logger.error({ err, pinnedApplicationId: pin.id }, "pinned_application_cron_failed");
      results.push({
        id: pin.id,
        ran: false,
        changed: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({ ok: true, results });
}
