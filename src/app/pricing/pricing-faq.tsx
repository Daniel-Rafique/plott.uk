"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { TRIAL_DAYS, trialNoChargeDuringCopy } from "@/lib/trial";

type Item = { q: string; a: string };

const FAQ: Item[] = [
  {
    q: `How does the ${TRIAL_DAYS}-day trial work?`,
    a: `Start any plan from the pricing grid, enter your card details in Stripe Checkout, and you won't be charged for ${TRIAL_DAYS} days. Cancel any time from the billing portal with a single click.`,
  },
  {
    q: "Can I switch plans later?",
    a: "Yes — upgrades are prorated and take effect immediately. Downgrades take effect at the end of your current billing period so you don't lose access you've already paid for.",
  },
  {
    q: "What happens if I exceed my AI budget?",
    a: "Work you do within the included monthly amount for your plan is included. Usage beyond that is metered: we report it to Stripe and it appears on your next invoice, typically at a fixed multiplier of our internal cost. You are not hard-blocked for going over, but a separate daily cap in Settings → AI can still limit runaway usage.",
  },
  {
    q: "Do you offer annual billing?",
    a: "Choose monthly or annual billing at checkout. Annual plans are billed once per year with two months free (pay for 10 months, get 12). AI overage beyond your included monthly credit is still metered month to month.",
  },
  {
    q: "Where does your data come from?",
    a: "We aggregate data from official UK government registers and commercial planning databases, covering all 337 local planning authorities with continuous refresh. Applicant enrichment combines multiple authoritative sources including property ownership records and corporate filings. Coverage varies by council — we're transparent about this in the app.",
  },
  {
    q: "Is this GDPR compliant?",
    a: "Yes. We're a UK-registered company, store customer data on UK and EU infrastructure, and use only lawful sources for planning-application data. All outreach generated through the platform uses legitimate-interest basis for B2B contact.",
  },
];

export function PricingFaq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="mt-14 border-t border-zinc-200">
      {FAQ.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q} className="border-b border-zinc-200">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : i)}
              className="flex w-full items-center justify-between gap-6 py-6 text-left transition-colors hover:text-zinc-950"
            >
              <span className="font-[family-name:var(--font-display)] text-[20px] font-normal text-zinc-950 md:text-[22px]">
                {item.q}
              </span>
              <span
                aria-hidden
                className="shrink-0 text-zinc-500"
              >
                {isOpen ? (
                  <Minus className="h-4 w-4" strokeWidth={1.5} />
                ) : (
                  <Plus className="h-4 w-4" strokeWidth={1.5} />
                )}
              </span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  key="content"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                  className="overflow-hidden"
                >
                  <p className="max-w-2xl pb-6 pr-10 text-[14px] leading-relaxed text-zinc-600">
                    {item.a}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
