import { redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant";
import { BrandingSettings } from "./branding-settings";

export const dynamic = "force-dynamic";

export default async function BrandingSettingsPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/auth/sign-in");

  return (
    <BrandingSettings
      company={{
        id: ctx.company.id,
        name: ctx.company.name,
        addressLines: ctx.company.addressLines ?? "",
        phone: ctx.company.phone ?? "",
        email: ctx.company.email ?? "",
        websiteUrl: ctx.company.websiteUrl ?? "",
        logoBlobUrl: ctx.company.logoBlobUrl,
        logoBlobPathname: ctx.company.logoBlobPathname,
        letterFooter: ctx.company.letterFooter ?? "",
      }}
    />
  );
}
