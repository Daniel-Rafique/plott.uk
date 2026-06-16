"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { toast } from "sonner";
import { Check } from "lucide-react";
import type { Plan } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { useGsapReveal } from "@/lib/animation/use-gsap-reveal";

export function PricingGrid({ plans }: { plans: Plan[] }) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const ref = useGsapReveal<HTMLDivElement>({ stagger: 0.08, y: 28 });

  async function subscribe(plan: Plan) {
    if (!plan.priceId) {
      router.push("/subscribe");
      return;
    }
    posthog.capture("checkout_initiated", {
      plan: plan.id,
      plan_name: plan.name,
    });
    setLoadingId(plan.id);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan: plan.id }),
      });
      if (res.status === 401) {
        router.push(
          `/auth/sign-up?next=${encodeURIComponent(`/subscribe?plan=${plan.id}`)}`,
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
        <div
          ref={ref}
          className="grid grid-cols-1 divide-y divide-zinc-200 md:grid-cols-3 md:divide-x md:divide-y-0 md:overflow-visible"
        >
          {plans.map((plan) => (
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

              <div className="mt-8 flex items-baseline gap-1.5">
                <span className="font-[family-name:var(--font-display)] text-[clamp(48px,5vw,72px)] font-normal leading-none tracking-tight tabular-nums text-zinc-950">
                  {plan.priceLabel ?? "—"}
                </span>
                {plan.interval ? (
                  <span className="text-[12px] text-zinc-500">
                    / {plan.interval}
                  </span>
                ) : plan.priceLabel ? null : (
                  <span className="text-[12px] text-zinc-500">
                    Coming soon
                  </span>
                )}
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
                  : plan.priceId
                    ? "Start free trial"
                    : "Contact sales"}
              </button>

              <p className="editorial-chapter-label mt-12 text-zinc-500">
                Includes
              </p>
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
          ))}
        </div>
      </div>
    </section>
  );
}
