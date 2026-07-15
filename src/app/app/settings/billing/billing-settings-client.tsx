"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CreditCard,
  Crown,
  ExternalLink,
  Loader2,
  Check,
  ArrowRight,
  AlertTriangle,
  Zap,
} from "lucide-react";
import { BillingIntervalToggle } from "@/components/pricing/billing-interval-toggle";
import type { BillingInterval } from "@/lib/stripe/plan-prices";
import {
  hasSubscriptionAccess,
  subscriptionAccessEndsAt,
} from "@/lib/subscription-entitlement";

type TierId = "free" | "starter" | "pro" | "agency";

type Plan = {
  id: "starter" | "pro" | "agency";
  name: string;
  tagline: string;
  features: string[];
  priceLabel: string | null;
  monthlyPriceLabel?: string | null;
  annualPriceLabel?: string | null;
  annualEffectiveMonthlyLabel?: string | null;
  interval: string | null;
  highlight: boolean;
};

type AiUsage = {
  spentGbp: number;
  includedBudgetGbp: number;
  overageRate: number;
};

type Initial = {
  tier: {
    id: TierId;
    label: string;
    monthlyBudgetCapGbp: number;
  };
  aiUsage: AiUsage;
  subscription: {
    status: string;
    currentPeriodEnd: string | null;
    trialEndsAt: string | null;
    hasStripeCustomer: boolean;
    billingInterval: BillingInterval;
  };
  currentPlan:
    | {
        id: "starter" | "pro" | "agency";
        name: string;
        tagline: string;
        features: string[];
        priceLabel: string | null;
        monthlyPriceLabel?: string | null;
        annualPriceLabel?: string | null;
        annualEffectiveMonthlyLabel?: string | null;
        interval: string | null;
      }
    | null
    | undefined;
  plans: Plan[];
};

const TIER_ORDER: Record<TierId, number> = {
  free: 0,
  starter: 1,
  pro: 2,
  agency: 3,
};

const MANAGED_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
  "unpaid",
]);

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return null;
  }
}

function statusLabel(status: string): { label: string; tone: "good" | "warn" | "bad" | "neutral" } {
  switch (status) {
    case "active":
      return { label: "Active", tone: "good" };
    case "trialing":
      return { label: "Trialing", tone: "good" };
    case "past_due":
      return { label: "Past due", tone: "warn" };
    case "unpaid":
      return { label: "Unpaid", tone: "bad" };
    case "canceled":
      return { label: "Cancelled", tone: "bad" };
    case "incomplete":
    case "incomplete_expired":
      return { label: "Incomplete", tone: "warn" };
    case "paused":
      return { label: "Paused", tone: "warn" };
    default:
      return { label: "No subscription", tone: "neutral" };
  }
}

function displayPlanPrice(
  plan: Pick<
    Plan,
    | "priceLabel"
    | "monthlyPriceLabel"
    | "annualPriceLabel"
    | "annualEffectiveMonthlyLabel"
  >,
  interval: BillingInterval,
): { label: string | null; suffix: string; sub?: string } {
  if (interval === "year") {
    return {
      label: plan.annualPriceLabel ?? plan.priceLabel,
      suffix: "year",
      sub: plan.annualEffectiveMonthlyLabel ?? "2 months free",
    };
  }
  return {
    label: plan.monthlyPriceLabel ?? plan.priceLabel,
    suffix: "month",
  };
}

export function BillingSettingsClient({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState<Plan["id"] | null>(null);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>(
    initial.subscription.billingInterval,
  );
  const { tier, aiUsage, subscription, currentPlan, plans } = initial;

  const currentTierRank = TIER_ORDER[tier.id];
  const subscriptionEntitlement = {
    subscriptionStatus: subscription.status,
    subscriptionCurrentPeriodEnd: subscription.currentPeriodEnd,
    trialEndsAt: subscription.trialEndsAt,
  };
  const hasAccess = hasSubscriptionAccess(subscriptionEntitlement);
  const isPaymentSuspended =
    subscription.status === "past_due" || subscription.status === "unpaid";
  const isCanceledWithAccess = subscription.status === "canceled" && hasAccess;
  const isManagedSubscription =
    subscription.hasStripeCustomer &&
    MANAGED_SUBSCRIPTION_STATUSES.has(subscription.status);
  const isTrialing =
    subscription.status === "trialing" && subscription.hasStripeCustomer;
  const status = statusLabel(subscription.status);
  const trialEnd = formatDate(subscription.trialEndsAt);
  const periodEnd = formatDate(subscription.currentPeriodEnd);
  const accessEnd = formatDate(
    subscriptionAccessEndsAt(subscriptionEntitlement)?.toISOString() ?? null,
  );
  const currentPlanName =
    currentPlan?.name ??
    (isPaymentSuspended
      ? "Payment suspended"
      : isManagedSubscription && tier.id === "free"
        ? "Subscription"
        : tier.label);
  const currentPlanTagline = isPaymentSuspended
    ? "Update your payment method in Stripe to restore access."
    : isCanceledWithAccess
      ? "Your subscription is cancelled, but access remains available until the date shown below."
      : currentPlan?.tagline ??
        (isManagedSubscription && tier.id === "free"
          ? "Your plan is active in Stripe. Open the billing portal to view or change it."
          : null);

  async function openPortal() {
    setRedirecting(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Could not open billing portal");
      }
      window.location.assign(data.url);
    } catch (err) {
      setRedirecting(false);
      toast.error(
        err instanceof Error ? err.message : "Could not open billing portal",
      );
    }
  }

  function choosePlan() {
    const q = new URLSearchParams();
    if (billingInterval === "year") q.set("interval", "year");
    const suffix = q.toString();
    window.location.assign(suffix ? `/subscribe?${suffix}` : "/subscribe");
  }

  async function upgradeTrialPlan(plan: Plan["id"]) {
    setLoadingPlan(plan);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan, interval: billingInterval }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Could not start checkout");
      }
      if (data.url) {
        window.location.assign(data.url);
        return;
      }
      toast.success("Trial plan updated");
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Could not start checkout",
      );
    } finally {
      setLoadingPlan(null);
    }
  }

  async function changeSubscriptionPlan(plan: Plan["id"]) {
    setLoadingPlan(plan);
    try {
      const res = await fetch("/api/stripe/change-plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan, interval: billingInterval }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        unchanged?: boolean;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Could not change subscription plan");
      }
      toast.success(
        data.unchanged ? "You're already on this plan" : "Subscription plan updated",
      );
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Could not change subscription plan",
      );
    } finally {
      setLoadingPlan(null);
    }
  }

  function handlePlanAction(plan: Plan) {
    if (isTrialing) {
      void upgradeTrialPlan(plan.id);
      return;
    }
    if (isPaymentSuspended) {
      void openPortal();
      return;
    }
    if (isManagedSubscription) {
      void changeSubscriptionPlan(plan.id);
      return;
    }
    choosePlan();
  }

  const currentPlanPrice = currentPlan
    ? displayPlanPrice(currentPlan, subscription.billingInterval)
    : null;

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-indigo-50 p-2">
              <Crown className="h-5 w-5 text-indigo-700" aria-hidden />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700">
                Current plan
              </p>
              <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-zinc-900">
                {currentPlanName}
              </h2>
              {currentPlanTagline ? (
                <p className="mt-1 text-sm text-zinc-600">
                  {currentPlanTagline}
                </p>
              ) : null}
            </div>
          </div>
          <StatusBadge tone={status.tone} label={status.label} />
        </div>

        <dl className="mt-6 grid gap-4 border-t border-zinc-100 pt-6 sm:grid-cols-3">
          {currentPlanPrice?.label ? (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                Price
              </dt>
              <dd className="mt-1 text-sm text-zinc-900">
                {currentPlanPrice.label}
                {` / ${currentPlanPrice.suffix}`}
              </dd>
              {currentPlanPrice.sub ? (
                <dd className="mt-0.5 text-xs text-emerald-700">
                  {currentPlanPrice.sub}
                </dd>
              ) : null}
            </div>
          ) : null}
          {tier.monthlyBudgetCapGbp > 0 ? (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                AI monthly budget
              </dt>
              <dd className="mt-1 text-sm text-zinc-900">
                £{tier.monthlyBudgetCapGbp.toFixed(0)}
              </dd>
            </div>
          ) : null}
          {subscription.status === "trialing" && trialEnd ? (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                Trial ends
              </dt>
              <dd className="mt-1 text-sm text-zinc-900">{trialEnd}</dd>
            </div>
          ) : periodEnd || (subscription.status === "canceled" && accessEnd) ? (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                {subscription.status === "canceled"
                  ? "Access until"
                  : isPaymentSuspended
                    ? "Payment due"
                    : "Renews on"}
              </dt>
              <dd className="mt-1 text-sm text-zinc-900">
                {subscription.status === "canceled" ? accessEnd : periodEnd}
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-6">
          {isManagedSubscription ? (
            <button
              type="button"
              onClick={() => void openPortal()}
              disabled={redirecting}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
            >
              {redirecting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Opening portal
                </>
              ) : (
                <>
                  <CreditCard className="h-4 w-4" />
                  Manage subscription
                  <ExternalLink className="h-3.5 w-3.5 opacity-70" />
                </>
              )}
            </button>
          ) : (
            <Link
              href="/subscribe"
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              Choose a plan
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
          {isManagedSubscription ? (
            <p className="text-xs text-zinc-500">
              {isTrialing
                ? "Payment method, invoices, and cancellation are handled in Stripe's secure billing portal."
                : "Plan changes, payment method, invoices, and cancellation are handled in Stripe's secure billing portal."}
            </p>
          ) : null}
        </div>

        {subscription.status === "past_due" ||
        subscription.status === "unpaid" ? (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <p>
              Your last invoice didn&rsquo;t go through, so paid access is
              suspended. Open the billing portal to update your payment method
              and restore your subscription.
            </p>
          </div>
        ) : null}
        {isCanceledWithAccess && accessEnd ? (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <p>
              Your subscription is cancelled. Paid access remains available
              until {accessEnd}; after that, you&rsquo;ll need to choose a plan
              to continue.
            </p>
          </div>
        ) : null}
      </section>

      {tier.id !== "free" && aiUsage.includedBudgetGbp > 0 ? (
        <AiUsageCard aiUsage={aiUsage} />
      ) : null}

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {isManagedSubscription ? "Change plan" : "Choose a plan"}
            </h2>
            {isManagedSubscription ? (
              <p className="mt-1 text-xs text-zinc-500">
                {isTrialing
                  ? "Your trial stays active when you switch plan."
                  : "Plan changes are prorated and applied immediately."}
              </p>
            ) : null}
          </div>
          <BillingIntervalToggle
            value={billingInterval}
            onChange={setBillingInterval}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((plan) => {
            const planRank = TIER_ORDER[plan.id];
            const isCurrent =
              plan.id === tier.id &&
              !isCanceledWithAccess &&
              billingInterval === subscription.billingInterval;
            const isUpgrade = planRank > currentTierRank;
            const isDowngrade = planRank < currentTierRank;
            const price = displayPlanPrice(plan, billingInterval);
            return (
              <PlanCard
                key={plan.id}
                plan={plan}
                price={price}
                isCurrent={isCurrent}
                isUpgrade={isUpgrade}
                isDowngrade={isDowngrade}
                isSubscribed={isManagedSubscription}
                isCanceledWithAccess={isCanceledWithAccess}
                onAction={() => handlePlanAction(plan)}
                actionDisabled={redirecting || loadingPlan !== null}
                actionLoading={
                  loadingPlan === plan.id || (redirecting && !isTrialing)
                }
                actionLoadingLabel={
                  loadingPlan === plan.id ? "Updating..." : "Opening portal"
                }
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}

function StatusBadge({
  tone,
  label,
}: {
  tone: "good" | "warn" | "bad" | "neutral";
  label: string;
}) {
  const classes = {
    good: "bg-emerald-50 text-emerald-700 border-emerald-200",
    warn: "bg-amber-50 text-amber-800 border-amber-200",
    bad: "bg-red-50 text-red-700 border-red-200",
    neutral: "bg-zinc-100 text-zinc-700 border-zinc-200",
  }[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${classes}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          tone === "good"
            ? "bg-emerald-500"
            : tone === "warn"
              ? "bg-amber-500"
              : tone === "bad"
                ? "bg-red-500"
                : "bg-zinc-400"
        }`}
        aria-hidden
      />
      {label}
    </span>
  );
}

function PlanCard({
  plan,
  price,
  isCurrent,
  isUpgrade,
  isDowngrade,
  isSubscribed,
  isCanceledWithAccess,
  onAction,
  actionDisabled,
  actionLoading,
  actionLoadingLabel,
}: {
  plan: Plan;
  price: { label: string | null; suffix: string; sub?: string };
  isCurrent: boolean;
  isUpgrade: boolean;
  isDowngrade: boolean;
  isSubscribed: boolean;
  isCanceledWithAccess: boolean;
  onAction: () => void;
  actionDisabled: boolean;
  actionLoading: boolean;
  actionLoadingLabel: string;
}) {
  let actionLabel: string;
  if (isCurrent) actionLabel = "Current plan";
  else if (isCanceledWithAccess) actionLabel = `Subscribe to ${plan.name}`;
  else if (!isSubscribed) actionLabel = `Subscribe to ${plan.name}`;
  else if (isUpgrade) actionLabel = `Upgrade to ${plan.name}`;
  else if (isDowngrade) actionLabel = `Downgrade to ${plan.name}`;
  else actionLabel = `Switch to ${plan.name}`;

  return (
    <div
      className={`relative flex flex-col rounded-2xl border bg-white p-5 transition ${
        isCurrent
          ? "border-indigo-300 ring-1 ring-indigo-200"
          : plan.highlight
            ? "border-zinc-900"
            : "border-zinc-200"
      }`}
    >
      {isCurrent ? (
        <span className="absolute -top-2.5 left-4 rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
          Current
        </span>
      ) : plan.highlight ? (
        <span className="absolute -top-2.5 left-4 rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
          Most popular
        </span>
      ) : null}

      <div>
        <p className="text-base font-semibold">{plan.name}</p>
        <p className="mt-1 text-xs text-zinc-600">{plan.tagline}</p>
      </div>

      <div className="mt-4">
        {price.label ? (
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-semibold tracking-tight">
                {price.label}
              </span>
              <span className="text-xs text-zinc-500">/ {price.suffix}</span>
            </div>
            {price.sub ? (
              <p className="mt-1 text-xs text-emerald-700">{price.sub}</p>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-zinc-500">Pricing loaded from Stripe</p>
        )}
      </div>

      <ul className="mt-4 flex-1 space-y-1.5 text-xs text-zinc-700">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-1.5">
            <Check
              className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-600"
              aria-hidden
            />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={isCurrent ? undefined : onAction}
        disabled={isCurrent || actionDisabled}
        className={`mt-5 w-full rounded-full py-2 text-xs font-semibold transition disabled:cursor-default ${
          isCurrent
            ? "border border-indigo-200 bg-indigo-50 text-indigo-700"
            : isUpgrade
              ? "bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-60"
              : "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
        }`}
      >
        {actionLoading ? actionLoadingLabel : actionLabel}
      </button>
    </div>
  );
}

function AiUsageCard({ aiUsage }: { aiUsage: AiUsage }) {
  const { spentGbp, includedBudgetGbp, overageRate } = aiUsage;
  const isOverBudget = spentGbp > includedBudgetGbp;
  const overageGbp = isOverBudget ? spentGbp - includedBudgetGbp : 0;
  const estimatedOverageCharge = overageGbp * overageRate;

  const pct = includedBudgetGbp > 0
    ? Math.min((spentGbp / includedBudgetGbp) * 100, 100)
    : 0;

  const barColor = isOverBudget
    ? "bg-amber-500"
    : pct >= 80
      ? "bg-amber-500"
      : "bg-indigo-600";

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-violet-50 p-2">
          <Zap className="h-5 w-5 text-violet-700" aria-hidden />
        </div>
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-violet-700">
            AI usage this month
          </p>
          <div className="mt-3 flex items-baseline justify-between">
            <p className="text-sm font-medium text-zinc-900">
              £{spentGbp.toFixed(2)}
              <span className="text-zinc-500"> / £{includedBudgetGbp.toFixed(0)} included</span>
            </p>
            <p className="text-xs text-zinc-500">
              {pct.toFixed(0)}%
            </p>
          </div>

          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
            <div
              className={`h-full rounded-full transition-all ${barColor}`}
              style={{ width: `${pct}%` }}
            />
          </div>

          {isOverBudget ? (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div>
                <p className="font-medium">
                  £{overageGbp.toFixed(2)} over included budget
                </p>
                <p className="mt-0.5 text-xs text-amber-800">
                  Estimated additional charge: £{estimatedOverageCharge.toFixed(2)}.
                  This will appear on your next invoice.
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-xs text-zinc-500">
              Usage beyond your included budget will be billed on your next invoice.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
