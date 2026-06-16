import { redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { TemplatesSettings } from "./templates-settings";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/auth/sign-in");

  const templates = await prisma.letterTemplate.findMany({
    where: { companyId: ctx.company.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });

  return (
    <TemplatesSettings
      templates={templates.map((t) => ({
        id: t.id,
        name: t.name,
        subject: t.subject,
        bodyHtml: t.bodyHtml,
        isDefault: t.isDefault,
        kind: t.kind as "outreach" | "appeal_pitch",
      }))}
    />
  );
}
