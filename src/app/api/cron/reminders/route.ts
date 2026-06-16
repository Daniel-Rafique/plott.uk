import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendReminderEmail } from "@/lib/email";

export const runtime = "nodejs";
export const maxDuration = 120;

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
  const due = await prisma.reminder.findMany({
    where: {
      dueAt: { lte: now },
      notifiedAt: null,
      done: false,
    },
    include: {
      user: true,
      letter: true,
      company: true,
    },
    take: 200,
  });

  const results: { id: string; sent: boolean; error?: string }[] = [];
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://plott.uk";

  for (const r of due) {
    try {
      if (r.user?.email) {
        const letter = r.letter;
        await sendReminderEmail({
          to: r.user.email,
          note: r.note ?? "Follow up on this lead",
          dueAt: r.dueAt,
          companyName: r.company.name,
          letter: letter
            ? {
                applicationRef: letter.applicationRef,
                subject: letter.subject,
                recipientName: letter.recipientName,
                siteAddress: letter.siteAddress,
                addressLines: letter.addressLines,
                purpose: letter.purpose,
              }
            : null,
          letterUrl: letter
            ? `${baseUrl}/app/letters?letter=${letter.id}`
            : undefined,
        });
      }
      await prisma.reminder.update({
        where: { id: r.id },
        data: { notifiedAt: new Date() },
      });
      results.push({ id: r.id, sent: true });
    } catch (e) {
      results.push({
        id: r.id,
        sent: false,
        error: e instanceof Error ? e.message : "Unknown",
      });
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}
