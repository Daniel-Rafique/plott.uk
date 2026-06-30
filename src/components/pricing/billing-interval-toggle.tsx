"use client";

import { cn } from "@/lib/utils";
import type { BillingInterval } from "@/lib/stripe/plan-prices";

export function BillingIntervalToggle({
  value,
  onChange,
  className,
}: {
  value: BillingInterval;
  onChange: (interval: BillingInterval) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex rounded-full border border-zinc-200 bg-zinc-100 p-1 text-[13px]",
        className,
      )}
      role="group"
      aria-label="Billing interval"
    >
      <button
        type="button"
        onClick={() => onChange("month")}
        className={cn(
          "rounded-full px-4 py-1.5 font-medium transition",
          value === "month"
            ? "bg-white text-zinc-950 shadow-sm"
            : "text-zinc-600 hover:text-zinc-900",
        )}
      >
        Monthly
      </button>
      <button
        type="button"
        onClick={() => onChange("year")}
        className={cn(
          "rounded-full px-4 py-1.5 font-medium transition",
          value === "year"
            ? "bg-white text-zinc-950 shadow-sm"
            : "text-zinc-600 hover:text-zinc-900",
        )}
      >
        Annual
        <span className="ml-1.5 text-[11px] font-normal text-emerald-700">
          2 months free
        </span>
      </button>
    </div>
  );
}
