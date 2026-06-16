"use client";

/**
 * Lenis smooth-scroll provider for marketing routes.
 *
 * Only mounts on routes in MARKETING_ROUTES so app/auth pages keep native
 * scroll. Also bails out entirely when the user has set
 * prefers-reduced-motion.
 *
 * Lenis is desktop-only (min-width: 768px). Touch devices use native
 * momentum scrolling without Lenis's virtual-scroll + gsap.ticker coupling,
 * which was causing jank on marketing pages.
 *
 * When Lenis is active, its rAF loop is driven through gsap.ticker so
 * ScrollTrigger stays in sync. After Lenis mounts we refresh ScrollTrigger.
 */

import { useEffect, useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  DESKTOP_FINE_POINTER_QUERY,
  scheduleScrollTriggerRefresh,
} from "./scroll-trigger-refresh";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const MARKETING_ROUTE_PREFIXES = [
  "/about",
  "/how-it-works",
  "/legal",
  "/pricing",
  "/privacy",
  "/terms",
];

export function isMarketingRoute(pathname: string | null): boolean {
  if (pathname === "/") return true;
  if (!pathname) return false;
  return MARKETING_ROUTE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export function LenisScrollProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const enabled = isMarketingRoute(pathname);

  /* Reset scroll to top on every marketing-route navigation so client-side
   * transitions (incl. /about <-> /how-it-works) do not leave Lenis/scrollY
   * mid-page; ScrollTrigger on heroes then measures progress from 0. */
  useLayoutEffect(() => {
    if (typeof window === "undefined" || !enabled) return;
    window.scrollTo(0, 0);
    const w = window as unknown as {
      lenis?: { scrollTo: (n: number, o?: { immediate?: boolean }) => void };
    };
    w.lenis?.scrollTo(0, { immediate: true });
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scheduleScrollTriggerRefresh();
      });
    });
    return () => cancelAnimationFrame(id);
  }, [pathname, enabled]);

  useEffect(() => {
    if (typeof window === "undefined" || !enabled) return;
    const t0 = window.setTimeout(scheduleScrollTriggerRefresh, 80);
    const t1 = window.setTimeout(scheduleScrollTriggerRefresh, 200);
    const font = document.fonts?.ready?.then(() => {
      requestAnimationFrame(scheduleScrollTriggerRefresh);
    });
    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      void font?.catch(() => undefined);
    };
  }, [pathname, enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (prefersReduced) return;

    const desktopMql = window.matchMedia(DESKTOP_FINE_POINTER_QUERY);

    let lenis: Lenis | null = null;
    let rafCb: ((time: number) => void) | null = null;
    let refreshRafId = 0;

    const onScroll = () => ScrollTrigger.update();

    const handleAnchorClick = (e: MouseEvent) => {
      if (!lenis) return;
      const target = e.target as HTMLElement;
      const anchor = target.closest('a[href^="/#"], a[href^="#"]');
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href) return;

      const hash = href.includes("#") ? `#${href.split("#")[1]}` : null;
      if (!hash) return;

      const targetEl = document.querySelector(hash);
      if (!targetEl) return;

      e.preventDefault();

      if (href.startsWith("/#") && window.location.pathname === "/") {
        window.history.pushState(null, "", hash);
      }

      lenis.scrollTo(targetEl as HTMLElement, {
        offset: 0,
        duration: 1.2,
      });
    };

    const destroyLenis = () => {
      if (refreshRafId) cancelAnimationFrame(refreshRafId);
      refreshRafId = 0;
      document.removeEventListener("click", handleAnchorClick);
      if (lenis && rafCb) {
        gsap.ticker.remove(rafCb);
        lenis.off("scroll", onScroll);
        lenis.destroy();
      }
      lenis = null;
      rafCb = null;
      (window as unknown as { lenis?: Lenis }).lenis = undefined;
      gsap.ticker.lagSmoothing(500, 33);
      scheduleScrollTriggerRefresh();
    };

    const createLenis = () => {
      destroyLenis();
      lenis = new Lenis({
        duration: 1.15,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
      });

      (window as unknown as { lenis: Lenis }).lenis = lenis;
      lenis.on("scroll", onScroll);

      document.addEventListener("click", handleAnchorClick);

      rafCb = (time: number) => {
        lenis?.raf(time * 1000);
      };
      gsap.ticker.add(rafCb);
      gsap.ticker.lagSmoothing(0);

      refreshRafId = requestAnimationFrame(() => {
        scheduleScrollTriggerRefresh();

        const hash = window.location.hash;
        if (hash && lenis) {
          const target = document.querySelector(hash);
          if (target) {
            setTimeout(() => {
              lenis?.scrollTo(target as HTMLElement, {
                offset: 0,
                duration: 1.2,
              });
            }, 100);
          }
        }
      });
    };

    const syncLenisToViewport = () => {
      if (desktopMql.matches) {
        if (!lenis) createLenis();
      } else {
        destroyLenis();
      }
    };

    syncLenisToViewport();
    desktopMql.addEventListener("change", syncLenisToViewport);

    return () => {
      desktopMql.removeEventListener("change", syncLenisToViewport);
      destroyLenis();
    };
  }, [enabled]);

  return <>{children}</>;
}
