import { redirect } from "next/navigation";
import { Toaster } from "sonner";
import { WorkspaceHeaderClient } from "@/components/workspace-header-client";
import {
  redirectForStage,
  resolveStage,
} from "@/lib/auth/onboarding-gate";
import { isAdminEmail } from "@/lib/admin";
import { privatePageMetadata } from "@/lib/seo";
import { getCompanyPlanFeatures } from "@/lib/plan-features";

export const dynamic = "force-dynamic";

export const metadata = privatePageMetadata({
  title: "App",
});

export default async function AppSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const resolved = await resolveStage();
  if (resolved.stage !== "ready") {
    redirect(redirectForStage(resolved));
  }
  const ctx = {
    user: resolved.user,
    company: resolved.company,
    membership: resolved.membership,
  };
  const features = getCompanyPlanFeatures(ctx.company);

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-zinc-50">
      <WorkspaceHeaderClient
        companyName={ctx.company.name}
        userEmail={ctx.user.email}
        isAdmin={isAdminEmail(ctx.user.email)}
        features={features}
      />
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </main>
      <Toaster position="top-center" richColors closeButton />
    </div>
  );
}
