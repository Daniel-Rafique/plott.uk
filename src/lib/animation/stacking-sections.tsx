"use client";

/**
 * Full-card stacking sections.
 *
 * Desktop fine-pointer devices get a deliberate cover-stack: each card pins
 * while the next card scrolls over it, and the outgoing card subtly recedes.
 * Mobile/tablet keeps native scroll with the same card visual language.
 */

import React, { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  DESKTOP_FINE_POINTER_QUERY,
  scheduleScrollTriggerRefresh,
} from "./scroll-trigger-refresh";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

type Props = { children: React.ReactNode };

export function StackingSections({ children }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const childArray = React.Children.toArray(children);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const mm = gsap.matchMedia();
    const cancelRefresh = scheduleScrollTriggerRefresh();

    mm.add(
      {
        desktop: DESKTOP_FINE_POINTER_QUERY,
        reduced: "(prefers-reduced-motion: reduce)",
      },
      (matchCtx) => {
        const isDesktop = matchCtx.conditions?.desktop ?? false;
        const reduced = matchCtx.conditions?.reduced ?? false;
        if (!isDesktop || reduced) return;

        let activeCtx: gsap.Context | null = null;
        let rebuildRaf = 0;

        const resetInlineStyles = () => {
          const wrappers = Array.from(
            container.querySelectorAll<HTMLElement>("[data-stack-wrapper]"),
          );
          const sections = Array.from(
            container.querySelectorAll<HTMLElement>("[data-stack]"),
          );
          gsap.set(wrappers, {
            clearProps:
              "transform,zIndex,borderRadius,boxShadow,overflow,position,willChange",
          });
          gsap.set(sections, {
            clearProps: "transform,y,opacity,transformOrigin,willChange",
          });
          wrappers.forEach((wrapper) => {
            wrapper.style.marginTop = "";
            wrapper.style.boxShadow = "";
            wrapper.style.position = "";
            wrapper.style.borderRadius = "";
            wrapper.style.overflow = "";
          });
        };

        const build = () => {
          activeCtx?.revert();
          resetInlineStyles();

          activeCtx = gsap.context(() => {
            const wrappers = Array.from(
              container.querySelectorAll<HTMLElement>("[data-stack-wrapper]"),
            );
            const sections = Array.from(
              container.querySelectorAll<HTMLElement>("[data-stack]"),
            );

            if (sections.length === 0) return;

            wrappers.forEach((wrapper, i) => {
              const section = sections[i];
              if (!section) return;
              const viewportHeight = window.innerHeight;
              const overflowDistance = Math.max(
                0,
                section.scrollHeight - viewportHeight,
              );
              const readHoldDistance =
                overflowDistance > 0
                  ? Math.min(viewportHeight * 0.32, 320)
                  : 0;
              const coverDistance = viewportHeight;
              const depthTarget = i === sections.length - 1 ? 1 : 0.965;
              const opacityTarget = i === sections.length - 1 ? 1 : 0.72;

              gsap.set(wrapper, {
                zIndex: i + 1,
                position: "relative",
                overflow: "hidden",
                borderRadius: i === 0 ? 0 : 28,
                boxShadow:
                  i === 0
                    ? "none"
                    : "0 -28px 80px -32px rgba(0, 0, 0, 0.35)",
                transformOrigin: "50% 45%",
                willChange: "transform, opacity",
              });
              gsap.set(section, {
                transformOrigin: "50% 45%",
                willChange: "transform, opacity",
              });

              if (i === sections.length - 1) return;

              const tl = gsap.timeline({
                scrollTrigger: {
                  trigger: wrapper,
                  start: "top top",
                  end: () =>
                    `+=${overflowDistance + readHoldDistance + coverDistance}`,
                  pin: true,
                  pinSpacing: false,
                  scrub: 0.65,
                  anticipatePin: 1,
                  invalidateOnRefresh: true,
                },
              });

              if (overflowDistance > 0) {
                tl.to(
                  section,
                  {
                    y: -overflowDistance,
                    duration: overflowDistance,
                    ease: "none",
                  },
                  0,
                );
              }

              if (readHoldDistance > 0) {
                tl.to(
                  section,
                  {
                    y: -overflowDistance,
                    duration: readHoldDistance,
                    ease: "none",
                  },
                  overflowDistance,
                );
              }

              tl.to(
                section,
                {
                  scale: depthTarget,
                  opacity: opacityTarget,
                  duration: coverDistance,
                  ease: "power1.out",
                },
                overflowDistance + readHoldDistance,
              );
            });
          }, container);
        };

        const resizeHandler = () => {
          if (rebuildRaf) window.cancelAnimationFrame(rebuildRaf);
          rebuildRaf = window.requestAnimationFrame(() => {
            rebuildRaf = 0;
            build();
            scheduleScrollTriggerRefresh();
          });
        };

        build();
        scheduleScrollTriggerRefresh();
        window.addEventListener("resize", resizeHandler, { passive: true });
        window.addEventListener("orientationchange", resizeHandler, {
          passive: true,
        });

        return () => {
          if (rebuildRaf) window.cancelAnimationFrame(rebuildRaf);
          window.removeEventListener("resize", resizeHandler);
          window.removeEventListener("orientationchange", resizeHandler);
          activeCtx?.revert();
          resetInlineStyles();
        };
      },
    );

    return () => {
      cancelRefresh();
      mm.revert();
    };
  }, []);

  return (
    <div ref={containerRef} className="min-w-0 w-full overflow-x-clip">
      {childArray.map((child, i) => (
        <div key={i} data-stack-wrapper className="relative min-h-[100svh] w-full">
          {child}
        </div>
      ))}
    </div>
  );
}
