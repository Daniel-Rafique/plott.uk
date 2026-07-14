"use client";

import { useOptionalFunnelModal } from "@/components/auth/funnel-modal";
import type { OpenFunnelOptions } from "@/components/auth/funnel-modal";
import { cn } from "@/lib/utils";

type Props = {
  children: React.ReactNode;
  className?: string;
  options?: OpenFunnelOptions;
  /** Fallback href when funnel modal provider is unavailable. */
  href?: string;
};

/**
 * Button that opens the marketing funnel modal when available,
 * otherwise navigates to the standalone auth page.
 */
export function FunnelCtaButton({
  children,
  className,
  options,
  href = "/auth/sign-up",
}: Props) {
  const funnel = useOptionalFunnelModal();

  if (!funnel) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }

  return (
    <button
      type="button"
      className={cn(className)}
      onClick={() => funnel.openFunnel(options)}
    >
      {children}
    </button>
  );
}
