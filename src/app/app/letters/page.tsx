import { redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { LettersTable } from "./letters-table";

export const dynamic = "force-dynamic";

export default async function LettersPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/auth/sign-in");

  const letters = await prisma.letter.findMany({
    where: { companyId: ctx.company.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { name: true, email: true } },
      reminders: { select: { id: true, dueAt: true, done: true } },
    },
  });

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10 overflow-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Letters</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Every letter your team has drafted. Re-print, mark as sent, or
          schedule a follow-up.
        </p>
      </header>
      <LettersTable
        rows={letters.map((l) => ({
          id: l.id,
          recipientName: l.recipientName,
          applicationRef: l.applicationRef,
          siteAddress: l.siteAddress,
          status: l.status,
          sentAt: l.sentAt ? l.sentAt.toISOString() : null,
          createdAt: l.createdAt.toISOString(),
          author:
            l.user.name ?? l.user.email ?? "Unknown",
          pdfBlobUrl: l.pdfBlobUrl,
          pendingReminders: l.reminders.filter((r) => !r.done).length,
        }))}
      />
    </div>
  );
}
