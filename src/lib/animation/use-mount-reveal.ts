"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";

type MountRevealOptions = {
  /** Selector inside the container to animate. Defaults to `[data-reveal]`. */
  selector?: string;
  /** Stagger between children, in seconds. */
  stagger?: number;
  /** Initial y offset (px). */
  y?: number;
  /** Duration in seconds. */
  duration?: number;
  /** Delay before the tween starts, in seconds. */
  delay?: number;
};

/**
 * Fire-on-mount counterpart to `useGsapReveal`. Use inside modals, drawers,
 * and anything that enters the viewport programmatically rather than via
 * scrolling. Respects `prefers-reduced-motion` by snapping to the final
 * state. Returns a ref to attach to the container.
 */
export function useMountReveal<T extends HTMLElement>(
  enabled: boolean,
  options: MountRevealOptions = {},
) {
  const ref = useRef<T | null>(null);
  const {
    selector = "[data-reveal]",
    stagger = 0.06,
    y = 16,
    duration = 0.45,
    delay = 0.05,
  } = options;

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;

    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const targets = el.querySelectorAll<HTMLElement>(selector);
    if (targets.length === 0) return;

    if (prefersReduced) {
      gsap.set(targets, { opacity: 1, y: 0 });
      return;
    }

    gsap.set(targets, { opacity: 0, y, force3D: true });
    const ctx = gsap.context(() => {
      gsap.to(targets, {
        opacity: 1,
        y: 0,
        duration,
        ease: "power3.out",
        stagger,
        delay,
        overwrite: "auto",
      });
    }, el);

    return () => ctx.revert();
  }, [enabled, selector, stagger, y, duration, delay]);

  return ref;
}
