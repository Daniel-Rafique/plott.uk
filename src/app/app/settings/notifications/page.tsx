import { redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { NotificationsSettings } from "./notifications-settings";

export const dynamic = "force-dynamic";

export default async function NotificationsSettingsPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/auth/sign-in");

  const user = await prisma.user.findUnique({
    where: { id: ctx.user.id },
    select: { email: true, emailPdfOnPrint: true },
  });

  const isAdmin =
    ctx.membership.role === "owner" || ctx.membership.role === "admin";

  return (
    <NotificationsSettings
      isAdmin={isAdmin}
      initial={{
        userEmail: user?.email ?? ctx.user.email ?? "",
        emailPdfOnPrint: user?.emailPdfOnPrint ?? false,
        autoEmailPdf: ctx.company.autoEmailPdf,
        pdfEmailRecipients: ctx.company.pdfEmailRecipients ?? [],
        prospectEmailOutreachEnabled: ctx.company.prospectEmailOutreachEnabled,
      }}
    />
  );
}
