"use client";

/**
 * Thin client-side wrapper that mounts the Lenis smooth-scroll provider,
 * the body-background scrubber, and conditionally applies height constraints.
 * All are pathname-gated internally so this is safe to mount at the root layout level.
 */

import { LenisScrollProvider } from "./lenis-provider";
import { ScrollBgScrubber } from "./scroll-bg";
import { BodyWrapper } from "./body-wrapper";
import { ScrollToTop } from "@/components/scroll-to-top";

export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <BodyWrapper>
      <LenisScrollProvider>
        <ScrollBgScrubber />
        {children}
        <ScrollToTop />
      </LenisScrollProvider>
    </BodyWrapper>
  );
}
