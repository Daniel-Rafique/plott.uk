"use client";

/**
 * Scroll-scrubbed body background colour.
 *
 * Every top-level marketing section can declare a `data-bg="#hex"` attribute.
 * As each section crosses the viewport midline we tween `document.body.style
 * .backgroundColor` to that value, giving you the fluid.glass-style continuous
 * palette transition between sections without any visible hard cuts when
 * bouncing past section boundaries on macOS overscroll.
 *
 * On narrow viewports (<768px) we set the colour immediately — tweening the
 * body background is a full-document repaint and tends to hitch on mobile.
 *
 * The component is pathname-gated; on non-marketing routes it no-ops.
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

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

function isMarketingRoute(pathname: string | null): boolean {
  if (pathname === "/") return true;
  if (!pathname) return false;
  return MARKETING_ROUTE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export function ScrollBgScrubber() {
  const pathname = usePathname();
  const enabled = isMarketingRoute(pathname);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    const triggers: ScrollTrigger[] = [];
    const body = document.body;
    const originalBg = body.style.backgroundColor;

    const mm = gsap.matchMedia();

    mm.add(
      {
        reduced: "(prefers-reduced-motion: reduce)",
        normal: "(prefers-reduced-motion: no-preference)",
      },
      (ctx) => {
        const reduced = ctx.conditions?.reduced ?? false;

        const sections = document.querySelectorAll<HTMLElement>("[data-bg]");
        sections.forEach((section) => {
          const bg = section.dataset.bg;
          if (!bg) return;

          const apply = () => {
            const narrow = window.matchMedia("(max-width: 767px)").matches;
            if (reduced || narrow) {
              body.style.backgroundColor = bg;
              return;
            }
            gsap.to(body, {
              backgroundColor: bg,
              duration: 0.6,
              ease: "power2.out",
              overwrite: "auto",
            });
          };

          const st = ScrollTrigger.create({
            trigger: section,
            start: "top 40%",
            end: "bottom 40%",
            onEnter: apply,
            onEnterBack: apply,
          });
          triggers.push(st);
        });
      },
    );

    return () => {
      triggers.forEach((t) => t.kill());
      mm.revert();
      body.style.backgroundColor = originalBg;
    };
  }, [enabled, pathname]);

  return null;
}
