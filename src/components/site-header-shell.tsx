"use client";

/**
 * Client-side wrapper for the site header. Handles:
 *   - Sticky positioning + backdrop blur
 *   - Padding compression after 80px of scroll (editorial pattern)
 *   - Transparent-over-hero mode on pages whose top section is dark (opt-in via
 *     the `variant="overlay"` prop on the home page hero)
 */

import { useEffect, useState } from "react";

type Props = {
  children: React.ReactNode;
};

export function SiteHeaderShell({ children }: Props) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      data-scrolled={scrolled || undefined}
      className="group sticky top-0 z-40 w-full border-b border-zinc-200/40 bg-white/60 backdrop-blur-xl backdrop-saturate-150 transition-shadow duration-300 data-[scrolled]:bg-white/70 data-[scrolled]:shadow-[0_1px_12px_rgb(0_0_0_/_0.04)]"
    >
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-6 px-6 py-5 transition-[padding] duration-300 group-data-[scrolled]:py-3">
        {children}
      </div>
    </header>
  );
}
