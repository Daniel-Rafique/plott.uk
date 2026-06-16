import { redirect } from "next/navigation";
import { DashboardGate } from "./dashboard-gate";
import { getTenantContext } from "@/lib/tenant";
import { getCompanyPlanFeatures } from "@/lib/plan-features";
import { logger } from "@/lib/logger";
import { invalidateStripeMetaCache } from "@/lib/ai/tiers";
import { syncCheckoutSessionForCompany } from "@/lib/stripe/sync-checkout";
import { repairSubscriptionStateForEntitlements } from "@/lib/stripe/subscription-repair";

type Search = Promise<{ [k: string]: string | string[] | undefined }>;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Search;
}) {
  const sp = (await searchParams) ?? {};
  const checkout = typeof sp.checkout === "string" ? sp.checkout : null;
  const sessionId =
    typeof sp.session_id === "string" && sp.session_id.startsWith("cs_")
      ? sp.session_id
      : null;
  const ctx = await getTenantContext();
  let syncedCheckout = false;
  if (ctx && checkout === "success" && sessionId) {
    try {
      await syncCheckoutSessionForCompany({
        sessionId,
        companyId: ctx.company.id,
      });
      invalidateStripeMetaCache();
      syncedCheckout = true;
    } catch (err) {
      logger.warn(
        { err, companyId: ctx.company.id, sessionId },
        "dashboard_checkout_sync_failed",
      );
    }
  }
  if (syncedCheckout) redirect("/app/dashboard");
  let company = ctx?.company ?? null;
  if (company) {
    const repaired = await repairSubscriptionStateForEntitlements(company.id);
    if (repaired) {
      company = { ...company, ...repaired };
    }
  }
  const features = company
    ? getCompanyPlanFeatures(company)
    : {
        planId: "starter" as const,
        planName: "Free",
        canSaveSearches: false,
        canPinApplications: false,
        canUseAutoOutreach: false,
        canExportCsv: false,
        savedSearchLimit: 0,
        pinnedApplicationLimit: 0,
        upgradeHref: "/app/settings/billing",
      };

  return <DashboardGate features={features} />;
}
