"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

const BAR_HEIGHTS = [10, 14, 18, 14, 10, 16, 12];

/** Animated waveform shown while the AI is generating a response. */
export function StreamingWaveform() {
  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const ctxRef = useRef<ReturnType<typeof gsap.context> | null>(null);

  useEffect(() => {
    ctxRef.current = gsap.context(() => {
      barsRef.current.forEach((bar, i) => {
        if (!bar) return;
        gsap.to(bar, {
          scaleY: 0.2,
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
      className="inline-flex items-end gap-[3px]"
      aria-label="AI thinking"
      role="status"
    >
      {BAR_HEIGHTS.map((h, i) => (
        <span
          key={i}
          ref={(el) => {
            barsRef.current[i] = el;
          }}
          className="inline-block w-[3px] origin-bottom rounded-full bg-zinc-400"
          style={{ height: h }}
        />
      ))}
    </span>
  );
}

/** Pulsing status dot shown in the header while streaming. */
export function StreamingSparkle() {
  const dotRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!dotRef.current) return;
    const ctx = gsap.context(() => {
      gsap.to(dotRef.current, {
        opacity: 0.3,
        scale: 1.4,
        duration: 0.7,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });
    });
    return () => ctx.revert();
  }, []);

  return (
    <span className="relative flex h-2 w-2">
      <span
        ref={dotRef}
        className="absolute inline-flex h-full w-full rounded-full bg-zinc-400 opacity-75"
      />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-zinc-700" />
    </span>
  );
}
