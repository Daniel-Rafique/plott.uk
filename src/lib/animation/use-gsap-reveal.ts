"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { scheduleScrollTriggerRefresh } from "./scroll-trigger-refresh";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

type RevealOptions = {
  /** Selector inside the container to animate. Defaults to `[data-reveal]`. */
  selector?: string;
  /** Stagger between children, in seconds. */
  stagger?: number;
  /** Initial y offset (px). */
  y?: number;
  /** Duration in seconds. */
  duration?: number;
  /** Scroll trigger start position. Defaults to "top 80%". */
  start?: string;
  /** Whether each element animates individually (batch) or as one group. */
  batch?: boolean;
};

/**
 * Scroll-triggered fade-up using ScrollTrigger.batch.
 *
 * Each element matching `[data-reveal]` inside the returned ref is hidden on
 * mount and fades up when its top crosses `start` (default 80% of viewport
 * height). Uses `gsap.context` so the animations are cleanly reverted on
 * unmount (plays nicely with React Strict Mode). Respects
 * `prefers-reduced-motion` by showing final state immediately with no tween.
 */
export function useGsapReveal<T extends HTMLElement>(
  options: RevealOptions = {},
) {
  const ref = useRef<T | null>(null);
  const {
    selector = "[data-reveal]",
    stagger = 0.08,
    y = 32,
    duration = 0.9,
    start = "top 80%",
    batch = true,
  } = options;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const targets = el.querySelectorAll<HTMLElement>(selector);
    if (targets.length === 0) return;

    if (prefersReduced) {
      gsap.set(targets, { opacity: 1, y: 0 });
      return;
    }

    // Seed the hidden state synchronously so nothing flashes on mount.
    gsap.set(targets, { opacity: 0, y, force3D: true });

    const ctx = gsap.context(() => {
      if (batch) {
        ScrollTrigger.batch(targets, {
          start,
          onEnter: (elements) => {
            gsap.to(elements, {
              opacity: 1,
              y: 0,
              duration,
              ease: "power3.out",
              stagger,
              overwrite: "auto",
            });
          },
          // If someone scrolls up past an element that's been revealed, leave
          // it in place — this isn't a repeatable animation.
        });
      } else {
        gsap.to(targets, {
          opacity: 1,
          y: 0,
          duration,
          ease: "power3.out",
          stagger,
          scrollTrigger: {
            trigger: el,
            start,
            toggleActions: "play none none none",
          },
        });
      }
    }, el);

    // ScrollTrigger measures positions when triggers are created. If any
    // layout shifts happen after (fonts loading, Lenis mounting) recompute.
    const cancelRefresh = scheduleScrollTriggerRefresh();

    return () => {
      cancelRefresh();
      ctx.revert();
    };
  }, [selector, stagger, y, duration, start, batch]);

  return ref;
}
