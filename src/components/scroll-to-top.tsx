"use client";

/**
 * Scroll-to-top button with smooth reveal animation.
 *
 * Fades in after scrolling past the first section (~80vh), positioned in
 * the bottom-right corner. Uses Lenis for buttery smooth scroll-to-top.
 * Desktop + mobile friendly.
 */

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ArrowUp } from "lucide-react";

type WindowWithLenis = Window & {
  lenis?: {
    scrollTo: (
      target: number,
      options?: { duration?: number; easing?: (t: number) => number },
    ) => void;
  };
};

export function ScrollToTop() {
  const [isVisible, setIsVisible] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      const shouldShow = window.scrollY > window.innerHeight * 0.8;
      setIsVisible(shouldShow);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const btn = buttonRef.current;
    if (!btn) return;

    if (isVisible) {
      gsap.to(btn, {
        opacity: 1,
        scale: 1,
        duration: 0.4,
        // No overshoot — back.out can scale past 1 and clip past the viewport with fixed + edge insets.
        ease: "power3.out",
      });
    } else {
      gsap.to(btn, {
        opacity: 0,
        scale: 0.8,
        duration: 0.3,
        ease: "power2.in",
      });
    }
  }, [isVisible]);

  const handleClick = () => {
    // Try to use Lenis if available, fall back to native smooth scroll
    const lenis = (window as unknown as WindowWithLenis).lenis;
    if (lenis && typeof lenis.scrollTo === "function") {
      lenis.scrollTo(0, {
        duration: 1.5,
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <button
      ref={buttonRef}
      onClick={handleClick}
      aria-label="Scroll to top"
      className="fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-zinc-900/10 bg-white/90 opacity-0 shadow-md backdrop-blur-md transition-all hover:border-zinc-900/20 hover:bg-white active:scale-95 sm:bottom-8 sm:right-8 sm:h-14 sm:w-14 sm:shadow-lg sm:hover:scale-110 sm:hover:shadow-xl"
      style={{ pointerEvents: isVisible ? "auto" : "none" }}
    >
      <ArrowUp
        className="h-5 w-5 text-zinc-900"
        strokeWidth={2.5}
        aria-hidden
      />
    </button>
  );
}
