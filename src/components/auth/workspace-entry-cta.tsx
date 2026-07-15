"use client";

import { useState } from "react";
import Link from "next/link";
import { useOptionalFunnelModal } from "@/components/auth/funnel-modal";
import { cn } from "@/lib/utils";

type Props = {
  children: React.ReactNode;
  className?: string;
  /**
   * Fallback when the funnel modal isn't mounted (or middle-click / new tab).
   * `/continue` server-resolves stage into onboarding / subscribe / dashboard.
   */
  href?: string;
  /** Called when the primary click is intercepted (e.g. close mobile nav). */
  onNavigate?: () => void;
};

/**
 * Signed-in "Dashboard" / "Open app" entry.
 * Prefers opening the marketing funnel at the correct step; otherwise
 * navigates to `/continue`.
 */
export function WorkspaceEntryCta({
  children,
  className,
  href = "/continue",
  onNavigate,
}: Props) {
  const funnel = useOptionalFunnelModal();
  const [pending, setPending] = useState(false);

  if (!funnel) {
    return (
      <Link href={href} className={className} onClick={() => onNavigate?.()}>
        {children}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={cn(className, pending && "pointer-events-none opacity-70")}
      aria-busy={pending || undefined}
      onClick={(e) => {
        // Allow modified clicks (new tab, etc.) to use /continue.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
          return;
        }
        e.preventDefault();
        if (pending) return;
        onNavigate?.();
        setPending(true);
        void funnel.continueWorkspace().finally(() => setPending(false));
      }}
    >
      {children}
    </Link>
  );
}
