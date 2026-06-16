"use client";

/**
 * Route progress bar — top-of-screen loading indicator for page transitions.
 *
 * Shows a slim animated bar at the top of the viewport during Next.js
 * navigation. Inspired by NProgress/YouTube but with modern styling.
 * Uses CSS animations for smooth performance.
 */

import { useEffect, useState, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const incrementRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleComplete = () => {
      if (incrementRef.current) {
        clearTimeout(incrementRef.current);
      }

      setProgress(100);
      setIsLoading(false);

      // Fade out after completion
      timeoutRef.current = setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 300);
    };

    // Trigger on route changes
    handleComplete();

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (incrementRef.current) clearTimeout(incrementRef.current);
    };
  }, [pathname, searchParams]);

  // Listen for link clicks to start the progress bar
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest("a");
      
      if (!anchor) return;
      
      const href = anchor.getAttribute("href");
      if (!href) return;
      
      // Skip external links, hash links, and same-page links
      if (
        href.startsWith("http") ||
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:")
      ) {
        return;
      }

      // Skip if it's the current page
      if (href === pathname) return;

      // Start loading
      setIsLoading(true);
      setVisible(true);
      setProgress(0);

      let currentProgress = 0;
      
      const increment = () => {
        currentProgress += Math.random() * 12;
        if (currentProgress > 90) currentProgress = 90;
        setProgress(currentProgress);

        const delay = currentProgress < 50 ? 80 : currentProgress < 80 ? 150 : 400;
        incrementRef.current = setTimeout(increment, delay);
      };

      incrementRef.current = setTimeout(increment, 30);
    };

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [pathname]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-[100] h-[3px] overflow-hidden"
      role="progressbar"
      aria-valuenow={Math.round(progress)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {/* Track background */}
      <div className="absolute inset-0 bg-zinc-200/50" />
      
      {/* Progress bar */}
      <div
        className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500 via-emerald-400 to-cyan-400 transition-all duration-200 ease-out"
        style={{
          width: `${progress}%`,
          opacity: isLoading ? 1 : 0,
          transition: isLoading
            ? "width 200ms ease-out"
            : "width 200ms ease-out, opacity 300ms ease-out",
        }}
      />
      
      {/* Glowing tip */}
      <div
        className="absolute inset-y-0 w-24 bg-gradient-to-r from-transparent via-white/40 to-transparent blur-sm"
        style={{
          left: `calc(${progress}% - 3rem)`,
          opacity: isLoading && progress < 100 ? 1 : 0,
          transition: "left 200ms ease-out, opacity 200ms ease-out",
        }}
      />
      
      {/* Shimmer effect */}
      {isLoading && progress < 100 && (
        <div
          className="absolute inset-y-0 w-32 animate-shimmer bg-gradient-to-r from-transparent via-white/30 to-transparent"
          style={{ left: 0 }}
        />
      )}
    </div>
  );
}
