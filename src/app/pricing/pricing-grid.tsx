"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { toast } from "sonner";
import { Check } from "lucide-react";
import type { Plan } from "@/lib/pricing";
import type { BillingInterval } from "@/lib/stripe/plan-prices";
import { cn } from "@/lib/utils";
import { useGsapReveal } from "@/lib/animation/use-gsap-reveal";
import { BillingIntervalToggle } from "@/components/pricing/billing-interval-toggle";
import { startFreeTrialLabel } from "@/lib/trial";
import { useOptionalFunnelModal } from "@/components/auth/funnel-modal";
import { buildSubscribeNext } from "@/lib/auth/sanitize-next";
import { authClient } from "@/lib/auth/client";

function displayPrice(plan: Plan, interval: BillingInterval): {
  label: string;
  suffix: string;
  sub?: string;
} {
  if (interval === "year") {
    return {
      label: plan.annualPriceLabel ?? "—",
      suffix: "year",
      sub: plan.annualEffectiveMonthlyLabel
        ? `${plan.annualEffectiveMonthlyLabel} billed annually`
        : "2 months free",
    };
  }
  return {
    label: plan.monthlyPriceLabel ?? plan.priceLabel ?? "—",
    suffix: "month",
  };
}

export function PricingGrid({ plans }: { plans: Plan[] }) {
  const router = useRouter();
  const funnel = useOptionalFunnelModal();
  const { data: session } = authClient.useSession();
  const isSignedIn = Boolean(session?.user);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [interval, setInterval] = useState<BillingInterval>("month");
  const ref = useGsapReveal<HTMLDivElement>({ stagger: 0.08, y: 28 });

  async function subscribe(plan: Plan) {
    const priceId =
      interval === "year" ? plan.annualPriceId : plan.monthlyPriceId ?? plan.priceId;
    const subscribeNext = buildSubscribeNext(plan.id, interval);

    if (!priceId) {
      if (!isSignedIn && funnel) {
        funnel.openFunnel({ step: "sign-up", next: "/subscribe" });
        return;
      }
      router.push("/subscribe");
      return;
    }

    posthog.capture("checkout_initiated", {
      plan: plan.id,
      plan_name: plan.name,
      billing_interval: interval,
    });

    if (!isSignedIn) {
      if (funnel) {
        funnel.openFunnel({ step: "sign-up", next: subscribeNext });
        return;
      }
      router.push(
        `/auth/sign-up?next=${encodeURIComponent(subscribeNext)}`,
      );
      return;
    }

    setLoadingId(plan.id);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan: plan.id, interval }),
      });
      if (res.status === 401) {
        if (funnel) {
          funnel.openFunnel({ step: "sign-up", next: subscribeNext });
          return;
        }
        router.push(
          `/auth/sign-up?next=${encodeURIComponent(subscribeNext)}`,
        );
        return;
      }
      const data = (await res.json()) as {
        url?: string;
        error?: string;
        hint?: string;
        usedEnv?: string;
        priceId?: string;
      };
      if (data.url) {
        window.location.assign(data.url);
      } else {
        const base = data.hint
          ? `${data.error ?? "Unable to start checkout"} — ${data.hint}`
          : (data.error ?? "Unable to start checkout");
        const extra =
          data.usedEnv && data.priceId
            ? ` (${data.usedEnv} → ${data.priceId})`
            : "";
        toast.error(base + extra);
      }
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <section
      data-stack
      data-bg="#ffffff"
      className="relative bg-white pb-24 md:pb-32 md:pt-6"
    >
      <div className="mx-auto w-full max-w-7xl px-6">
        <div className="mb-10 flex justify-center">
          <BillingIntervalToggle value={interval} onChange={setInterval} />
        </div>
        <div
          ref={ref}
          className="grid grid-cols-1 divide-y divide-zinc-200 md:grid-cols-3 md:divide-x md:divide-y-0 md:overflow-visible"
        >
          {plans.map((plan) => {
            const price = displayPrice(plan, interval);
            const hasPrice =
              interval === "year"
                ? Boolean(plan.annualPriceId)
                : Boolean(plan.monthlyPriceId ?? plan.priceId);
            return (
              <article
                key={plan.id}
                data-reveal
                className={cn(
                  "relative flex flex-col px-8 py-14",
                  plan.highlight && "md:-mt-6 md:border-t-2 md:border-t-brand-dark",
                )}
              >
                {plan.highlight && (
                  <span className="editorial-chapter-label absolute left-8 top-4 text-brand-dark">
                    Most chosen
                  </span>
                )}
                <header>
                  <h2 className="font-[family-name:var(--font-display)] text-[28px] font-normal leading-tight tracking-tight text-zinc-950">
                    {plan.name}
                  </h2>
                  <p className="mt-2 text-[13px] leading-relaxed text-zinc-600">
                    {plan.tagline}
                  </p>
                </header>

                <div className="mt-8">
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-[family-name:var(--font-display)] text-[clamp(48px,5vw,72px)] font-normal leading-none tracking-tight tabular-nums text-zinc-950">
                      {price.label}
                    </span>
                    <span className="text-[12px] text-zinc-500">/ {price.suffix}</span>
                  </div>
                  {price.sub ? (
                    <p className="mt-2 text-[12px] text-emerald-700">{price.sub}</p>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={() => subscribe(plan)}
                  disabled={loadingId === plan.id}
                  className={cn(
                    "mt-10 inline-flex w-full items-center justify-center rounded-full px-6 py-3 text-[13px] font-medium transition",
                    plan.highlight
                      ? "border border-zinc-900 bg-zinc-900 text-white hover:border-zinc-700 hover:bg-zinc-700 disabled:opacity-60"
                      : "border border-zinc-900 bg-transparent text-zinc-900 hover:bg-zinc-900 hover:text-white disabled:opacity-60",
                  )}
                >
                  {loadingId === plan.id
                    ? "Loading…"
                    : hasPrice
                      ? startFreeTrialLabel()
                      : "Contact sales"}
                </button>
                <p className="mt-3 text-center text-[12px] leading-relaxed text-zinc-500">
                  Create your account to start — then choose billing.
                </p>

                <p className="editorial-chapter-label mt-12 text-zinc-500">Includes</p>
                <ul className="mt-5 space-y-3 text-[13px] leading-relaxed text-zinc-700">
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-3">
                      <Check
                        className="mt-[3px] h-3.5 w-3.5 shrink-0 text-brand-dark"
                        strokeWidth={2}
                        aria-hidden
                      />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
