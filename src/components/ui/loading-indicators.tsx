"use client";

/**
 * Branded loading indicators — replaces Lucide's Loader2 spinner everywhere
 * in the app. Each component is a self-contained GSAP animation that respects
 * `prefers-reduced-motion` and fits the editorial aesthetic (neutral zinc
 * palette for general UI, indigo reserved for AI-specific streaming states).
 *
 * Use:
 *  - <WaveformLoader />  while fetching data
 *  - <PulseIndicator />  for inline "saving..." / submit button feedback
 *  - <ShimmerBar />      progressive placeholder for a single value/row
 */

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { cn } from "@/lib/utils";

const WAVEFORM_HEIGHTS = [10, 14, 18, 14, 10, 16, 12] as const;

type Tone = "neutral" | "ai" | "inverse";

function toneBarClass(tone: Tone): string {
  if (tone === "ai") return "bg-indigo-400";
  if (tone === "inverse") return "bg-white/80";
  return "bg-zinc-400";
}

function toneDotClass(tone: Tone): { inner: string; outer: string } {
  if (tone === "ai") {
    return { inner: "bg-indigo-600", outer: "bg-indigo-400" };
  }
  if (tone === "inverse") {
    return { inner: "bg-white", outer: "bg-white/60" };
  }
  return { inner: "bg-zinc-600", outer: "bg-zinc-400" };
}

/**
 * Vertical waveform — a clean GSAP replacement for the classic spinner.
 * Seven bars scale up/down at slightly different rates so it never looks
 * mechanical. Use inline (button labels, inline status) or at any size.
 */
export function WaveformLoader({
  className,
  tone = "neutral",
  label = "Loading",
}: {
  className?: string;
  tone?: Tone;
  label?: string;
}) {
  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const ctxRef = useRef<ReturnType<typeof gsap.context> | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced) return;
    }
    ctxRef.current = gsap.context(() => {
      barsRef.current.forEach((bar, i) => {
        if (!bar) return;
        gsap.to(bar, {
          scaleY: 0.22,
          duration: 0.45 + i * 0.04,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
          delay: i * 0.09,
        });
      });
    });
    return () => ctxRef.current?.revert();
  }, []);

  return (
    <span
      className={cn("inline-flex items-end gap-[3px]", className)}
      aria-label={label}
      role="status"
    >
      {WAVEFORM_HEIGHTS.map((h, i) => (
        <span
          key={i}
          ref={(el) => {
            barsRef.current[i] = el;
          }}
          className={cn(
            "inline-block w-[3px] rounded-full origin-bottom",
            toneBarClass(tone),
          )}
          style={{ height: h }}
        />
      ))}
    </span>
  );
}

/**
 * Pulsing dot — for inline "saving..." indicators or submit buttons. Quieter
 * than a waveform; reads as a living status rather than a working spinner.
 */
export function PulseIndicator({
  className,
  tone = "neutral",
  label = "Working",
}: {
  className?: string;
  tone?: Tone;
  label?: string;
}) {
  const dotRef = useRef<HTMLSpanElement | null>(null);
  const colors = toneDotClass(tone);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced) return;
    }
    if (!dotRef.current) return;
    const ctx = gsap.context(() => {
      gsap.to(dotRef.current, {
        opacity: 0.3,
        scale: 1.5,
        duration: 0.75,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });
    });
    return () => ctx.revert();
  }, []);

  return (
    <span
      className={cn("relative flex h-2 w-2", className)}
      aria-label={label}
      role="status"
    >
      <span
        ref={dotRef}
        className={cn(
          "absolute inline-flex h-full w-full rounded-full opacity-75",
          colors.outer,
        )}
      />
      <span
        className={cn("relative inline-flex h-2 w-2 rounded-full", colors.inner)}
      />
    </span>
  );
}

/**
 * Horizontal shimmer sweep — a single-row placeholder that reads as
 * "a value is coming". Uses the existing `animate-shimmer` keyframe from
 * `globals.css`. Keep the height small (8–24px) for best effect.
 */
export function ShimmerBar({
  className,
  width = "100%",
  height = 12,
}: {
  className?: string;
  width?: string | number;
  height?: string | number;
}) {
  return (
    <span
      className={cn(
        "relative inline-block overflow-hidden rounded-sm bg-zinc-100",
        className,
      )}
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
      }}
      aria-hidden
    >
      <span
        className={cn(
          "absolute inset-y-0 -left-1/3 w-1/3 animate-shimmer",
          "bg-gradient-to-r from-transparent via-white/70 to-transparent",
        )}
      />
    </span>
  );
}
