import { Ruler, ShieldCheck } from "lucide-react";
import { freeTrialEyebrow } from "@/lib/trial";

type Props = {
  variant?: "light" | "dark";
  className?: string;
};

export function AuthTrustStrip({ variant = "light", className = "" }: Props) {
  const isDark = variant === "dark";
  const text = isDark ? "text-zinc-300" : "text-zinc-600";
  const accent = isDark ? "text-brand-light" : "text-brand-dark";
  const dot = isDark ? "bg-brand-light" : "bg-brand-dark";

  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs ${text} ${className}`}
    >
      <span className="inline-flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
        <span className={accent}>{freeTrialEyebrow()}</span>
      </span>
      <span className="inline-flex items-center gap-2">
        <ShieldCheck className={`h-3.5 w-3.5 ${accent}`} aria-hidden />
        UK GDPR compliant
      </span>
      <span className="inline-flex items-center gap-2">
        <Ruler className={`h-3.5 w-3.5 ${accent}`} aria-hidden />
        337 LPAs covered
      </span>
    </div>
  );
}
