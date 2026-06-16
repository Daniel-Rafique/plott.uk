import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 120;

const DRAFT_TTL_DAYS = 90;
const SOFT_DELETE_TTL_DAYS = 30;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  if (auth === `Bearer ${secret}`) return true;
  return req.headers.get("x-vercel-cron-secret") === secret;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // 1. Soft-delete drafts older than 90 days that were never sent.
  const draftCutoff = new Date(now.getTime() - DRAFT_TTL_DAYS * 86_400_000);
  const { count: draftsPurged } = await prisma.letter.updateMany({
    where: {
      status: "draft",
      deletedAt: null,
      createdAt: { lt: draftCutoff },
    },
    data: { deletedAt: now },
  });

  // 2. Hard-delete letters that were soft-deleted more than 30 days ago.
  //    This gives users a recovery window before permanent removal.
  const hardCutoff = new Date(now.getTime() - SOFT_DELETE_TTL_DAYS * 86_400_000);
  const { count: hardDeleted } = await prisma.letter.deleteMany({
    where: {
      deletedAt: { lt: hardCutoff },
    },
  });

  return NextResponse.json({
    ok: true,
    draftsPurged,
    hardDeleted,
  });
}
