import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import {
  redirectForStage,
  resolveStage,
} from "@/lib/auth/onboarding-gate";
import { privatePageMetadata } from "@/lib/seo";
import {
  normalizeBillingInterval,
  normalizePlan,
} from "@/lib/stripe/plan-prices";
import { shouldOfferStripeIntroTrial } from "@/lib/subscription-entitlement";
import { SubscribePanel } from "./subscribe-panel";
import { SubscribeActivating } from "./subscribe-activating";

export const dynamic = "force-dynamic";

export const metadata = privatePageMetadata({
  title: "Choose your plan",
  description:
    "Choose a Plott subscription plan after creating your workspace.",
});

type Search = Promise<{ [k: string]: string | string[] | undefined }>;

export default async function SubscribePage({
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
  const selectedPlan = normalizePlan(sp.plan);
  const selectedInterval = normalizeBillingInterval(
    typeof sp.interval === "string" ? sp.interval : undefined,
  );
  const planNextParams = new URLSearchParams();
  if (selectedPlan) planNextParams.set("plan", selectedPlan);
  if (selectedInterval === "year") planNextParams.set("interval", "year");
  const planNext = selectedPlan
    ? `/subscribe?${planNextParams.toString()}`
    : null;

  const resolved = await resolveStage();
  if (resolved.stage !== "needs_plan" && resolved.stage !== "ready") {
    if (planNext && resolved.stage === "unauthenticated") {
      redirect(`/auth/sign-up?next=${encodeURIComponent(planNext)}`);
    }
    if (planNext && resolved.stage === "unverified") {
      const next = new URLSearchParams();
      next.set("next", planNext);
      if (resolved.user.email) next.set("email", resolved.user.email);
      redirect(`/auth/verify-email?${next.toString()}`);
    }
    redirect(redirectForStage(resolved));
  }
  if (resolved.stage === "ready") {
    if (checkout === "success") {
      const next = new URLSearchParams();
      next.set("checkout", "success");
      if (sessionId) next.set("session_id", sessionId);
      redirect(`/app/dashboard?${next.toString()}`);
    }
    redirect("/app/dashboard");
  }

  // Just came back from Stripe Checkout but the webhook hasn't applied the
  // subscription yet. Show a soft "activating" state that auto-refreshes
  // instead of dumping the user back onto the plan grid.
  if (checkout === "success" && resolved.stage === "needs_plan") {
    return (
      <div className="flex min-h-screen flex-col">
        <SiteHeader />
        <main className="flex flex-1 flex-col items-center px-4 py-16">
          <SubscribeActivating
            companyName={resolved.company.name}
            sessionId={sessionId}
          />
        </main>
      </div>
    );
  }

  const canStartIntroTrial = shouldOfferStripeIntroTrial(resolved.company);
  const isReturningSubscriber =
    !canStartIntroTrial || resolved.company.subscriptionStatus !== "none";

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex flex-1 flex-col items-center px-4 py-16">
        <SubscribePanel
          companyName={resolved.company.name}
          selectedPlan={selectedPlan}
          selectedInterval={selectedInterval}
          canStartIntroTrial={canStartIntroTrial}
          isReturningSubscriber={isReturningSubscriber}
        />
        <p className="mt-8 text-center text-sm text-zinc-500">
          <Link href="/pricing" className="underline">
            Full pricing details
          </Link>
        </p>
      </main>
    </div>
  );
}
