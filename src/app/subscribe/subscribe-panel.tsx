"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import posthog from "posthog-js";
import type { PaidPlanId } from "@/lib/stripe/plan-prices";
import type { BillingInterval } from "@/lib/stripe/plan-prices";
import { BillingIntervalToggle } from "@/components/pricing/billing-interval-toggle";

type ClientPlan = {
  id: "starter" | "pro" | "agency";
  name: string;
  tagline: string;
  features: string[];
  priceLabel: string | null;
  monthlyPriceLabel?: string | null;
  annualPriceLabel?: string | null;
  annualEffectiveMonthlyLabel?: string | null;
  monthlyPriceId?: string | null;
  annualPriceId?: string | null;
  interval: string | null;
  highlight: boolean;
};

const FALLBACK_PLANS: ClientPlan[] = [
  {
    id: "starter",
    name: "Starter",
    tagline: "For sole traders testing the water.",
    features: [
      "25 map searches per day",
      "CSV export",
      "Single user",
      "AI natural-language search",
      "Saved searches and tracking on Pro",
    ],
    priceLabel: "£49.99",
    monthlyPriceLabel: "£49.99",
    annualPriceLabel: "£499.90",
    interval: "month",
    highlight: false,
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "For growing contractors.",
    features: [
      "Unlimited searches",
      "3 seats",
      "5 saved searches with email digests",
      "5 pinned applications with change tracking",
      "Branded PDF letters + e-signature",
      "AI letter assist & applicant research",
    ],
    priceLabel: "£99",
    monthlyPriceLabel: "£99",
    annualPriceLabel: "£990",
    interval: "month",
    highlight: true,
  },
  {
    id: "agency",
    name: "Agency",
    tagline: "Multi-office firms.",
    features: [
      "10 seats included",
      "20 saved searches and pinned applications",
      "Bulk letters (ZIP)",
      "Autonomous outreach with approvals",
      "Priority support",
    ],
    priceLabel: "£199",
    monthlyPriceLabel: "£199",
    annualPriceLabel: "£1,990",
    interval: "month",
    highlight: false,
  },
];

function displayPrice(plan: ClientPlan, interval: BillingInterval) {
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
    sub: undefined as string | undefined,
  };
}

export function SubscribePanel({
  companyName,
  selectedPlan,
  selectedInterval = "month",
  canStartIntroTrial,
  isReturningSubscriber,
}: {
  companyName: string;
  selectedPlan?: PaidPlanId | null;
  selectedInterval?: BillingInterval;
  canStartIntroTrial: boolean;
  isReturningSubscriber: boolean;
}) {
  const [plans, setPlans] = useState<ClientPlan[]>(FALLBACK_PLANS);
  const [interval, setInterval] = useState<BillingInterval>(selectedInterval);
  const [loadingPlan, setLoadingPlan] = useState<ClientPlan["id"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoStarted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/pricing")
      .then((r) => (r.ok ? (r.json() as Promise<{ plans: ClientPlan[] }>) : null))
      .then((data) => {
        if (cancelled || !data) return;
        setPlans(data.plans);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const startCheckout = useCallback(
    async (plan: ClientPlan["id"], billingInterval: BillingInterval = interval) => {
      setLoadingPlan(plan);
      setError(null);
      posthog.capture("checkout_initiated", {
        plan,
        billing_interval: billingInterval,
        can_start_intro_trial: canStartIntroTrial,
        is_returning_subscriber: isReturningSubscriber,
      });
      try {
        const res = await fetch("/api/stripe/checkout", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ plan, interval: billingInterval }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          url?: string;
          error?: string;
          hint?: string;
          usedEnv?: string;
          priceId?: string;
        };
        if (!res.ok) {
          const main = data.error ?? "Could not start checkout";
          const parts = [main, data.hint].filter(Boolean).join(" ");
          const extra =
            data.usedEnv && data.priceId
              ? ` (env: ${data.usedEnv} → ${data.priceId})`
              : "";
          setError(parts + extra);
          return;
        }
        if (data.url) {
          window.location.assign(data.url);
          return;
        }
        setError("No checkout URL returned");
      } finally {
        setLoadingPlan(null);
      }
    },
    [canStartIntroTrial, interval, isReturningSubscriber],
  );

  useEffect(() => {
    if (!selectedPlan || autoStarted.current) return;
    autoStarted.current = true;
    void startCheckout(selectedPlan, selectedInterval);
  }, [selectedPlan, selectedInterval, startCheckout]);

  return (
    <div className="w-full max-w-5xl">
      <div className="mb-10 text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          {companyName}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          {selectedPlan
            ? "Redirecting you to Stripe Checkout"
            : canStartIntroTrial
              ? "Pick a plan to start your trial"
              : "Pick a plan to resubscribe"}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-600">
          {canStartIntroTrial
            ? "No charge today. Enter your billing details in Stripe and your chosen plan starts billing only after the trial."
            : "Your workspace has already used its free trial. Stripe will restart billing for the plan you choose."}
        </p>
        {!selectedPlan ? (
          <div className="mt-6 flex justify-center">
            <BillingIntervalToggle value={interval} onChange={setInterval} />
          </div>
        ) : null}
      </div>

      {isReturningSubscriber ? (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950 shadow-sm">
          <p className="font-semibold">Your subscription is inactive.</p>
          <p className="mt-1 text-amber-900">
            Choose a paid plan to restore access to Plott. Because this
            workspace has already had a trial, the new subscription starts
            without another free trial.
          </p>
        </div>
      ) : null}

      <div className="grid gap-5 md:grid-cols-3">
        {plans.map((plan) => {
          const price = displayPrice(plan, interval);
          return (
            <PlanCard
              key={plan.id}
              plan={plan}
              price={price}
              isLoading={loadingPlan === plan.id}
              disabled={loadingPlan !== null}
              canStartIntroTrial={canStartIntroTrial}
              onSelect={() => void startCheckout(plan.id)}
            />
          );
        })}
      </div>

      {error ? (
        <p className="mt-6 text-center text-sm text-red-600">{error}</p>
      ) : null}
    </div>
  );
}

function PlanCard({
  plan,
  price,
  isLoading,
  disabled,
  canStartIntroTrial,
  onSelect,
}: {
  plan: ClientPlan;
  price: { label: string | null; suffix: string; sub?: string };
  isLoading: boolean;
  disabled: boolean;
  canStartIntroTrial: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      className={`flex flex-col rounded-2xl border bg-white p-6 shadow-sm transition ${
        plan.highlight
          ? "border-zinc-900 ring-1 ring-zinc-900"
          : "border-zinc-200"
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-base font-semibold">{plan.name}</p>
          <p className="mt-1 text-sm text-zinc-600">{plan.tagline}</p>
        </div>
        {plan.highlight ? (
          <span className="rounded-full bg-zinc-900 px-2.5 py-0.5 text-xs font-semibold text-white">
            Most popular
          </span>
        ) : null}
      </div>

      <div className="mt-6">
        {price.label ? (
          <>
            <div className="flex items-baseline gap-1.5">
              <span className="text-4xl font-semibold tracking-tight">
                {price.label}
              </span>
              <span className="text-sm text-zinc-500">/ {price.suffix}</span>
            </div>
            {price.sub ? (
              <p className="mt-1 text-xs text-emerald-700">{price.sub}</p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-zinc-500">Pricing loaded from Stripe</p>
        )}
      </div>

      <ul className="mt-6 flex-1 space-y-2 text-sm text-zinc-700">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <span className="mt-0.5 text-emerald-600">✓</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        className={`mt-6 w-full rounded-full py-2.5 text-sm font-semibold transition disabled:opacity-60 ${
          plan.highlight
            ? "bg-zinc-900 text-white hover:bg-zinc-800"
            : "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50"
        }`}
      >
        {isLoading
          ? "Redirecting…"
          : canStartIntroTrial
            ? "Start trial"
            : "Resubscribe"}
      </button>
    </div>
  );
}
