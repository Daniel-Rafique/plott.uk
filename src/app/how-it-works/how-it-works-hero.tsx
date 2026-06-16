"use client";

import Image from "next/image";
import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { scheduleScrollTriggerRefresh } from "@/lib/animation/scroll-trigger-refresh";
import { HOW_IT_WORKS_HERO } from "@/lib/marketing/images";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

/**
 * How it works hero — same motion language as About: time-based clip + fade-up
 * headline + lede, then scroll-scrubbed parallax on the copy block and
 * subtle image scale.
 */
export function HowItWorksHero() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const mediaRef = useRef<HTMLDivElement | null>(null);
  const mediaScaleRef = useRef<HTMLDivElement | null>(null);
  const textColumnRef = useRef<HTMLDivElement | null>(null);
  const kickerRef = useRef<HTMLParagraphElement | null>(null);
  const headlineRef = useRef<HTMLHeadingElement | null>(null);
  const ledeRef = useRef<HTMLParagraphElement | null>(null);
  const creditRef = useRef<HTMLParagraphElement | null>(null);

  useLayoutEffect(() => {
    const section = sectionRef.current;
    const mediaEl = mediaRef.current;
    const mediaScale = mediaScaleRef.current;
    const textCol = textColumnRef.current;
    const kicker = kickerRef.current;
    const headline = headlineRef.current;
    const lede = ledeRef.current;
    const credit = creditRef.current;
    if (
      !section ||
      !mediaEl ||
      !mediaScale ||
      !textCol ||
      !kicker ||
      !headline ||
      !lede ||
      !credit
    ) {
      return;
    }

    const mm = gsap.matchMedia();
    mm.add(
      {
        reduced: "(prefers-reduced-motion: reduce)",
        normal: "(prefers-reduced-motion: no-preference)",
      },
      (ctx) => {
        const reduced = ctx.conditions?.reduced ?? false;
        if (reduced) {
          gsap.set(mediaEl, { clipPath: "none" });
          gsap.set([kicker, headline, lede, credit], {
            opacity: 1,
            y: 0,
            clearProps: "transform,opacity",
          });
          gsap.set(mediaScale, { scale: 1, clearProps: "transform" });
          gsap.set(textCol, { y: 0, opacity: 1, clearProps: "all" });
          return;
        }

        gsap.set(kicker, { opacity: 0, y: 32 });
        gsap.set(headline, { opacity: 0, y: 36 });
        gsap.set(lede, { opacity: 0, y: 28 });
        gsap.set(credit, { opacity: 0, y: 12 });
        gsap.set(mediaEl, { clipPath: "inset(100% 0% 0% 0%)" });
        gsap.set(mediaScale, { scale: 1, transformOrigin: "50% 40%" });
        gsap.set(textCol, { y: 0, opacity: 1 });

        const ctxGsap = gsap.context(() => {
          const enter = gsap.timeline({
            defaults: { ease: "power3.out" },
            delay: 0.06,
            onComplete: () => {
              scheduleScrollTriggerRefresh();
            },
          });

          enter.fromTo(
            mediaEl,
            { clipPath: "inset(100% 0% 0% 0%)" },
            { clipPath: "inset(0% 0% 0% 0%)", duration: 1.15 },
            0,
          );

          enter.to(
            kicker,
            { opacity: 1, y: 0, duration: 0.55 },
            0.12,
          );

          enter.to(
            headline,
            { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" },
            0.2,
          );

          enter.to(
            lede,
            { opacity: 1, y: 0, duration: 0.6 },
            0.5,
          );

          enter.to(
            credit,
            { opacity: 1, y: 0, duration: 0.4 },
            0.75,
          );

          const scrollTl = gsap.timeline({
            scrollTrigger: {
              trigger: section,
              start: "top top",
              end: "bottom top",
              scrub: 0.85,
              invalidateOnRefresh: true,
            },
          });

          scrollTl.fromTo(
            textCol,
            { y: 0, opacity: 1 },
            {
              y: -64,
              opacity: 0.22,
              ease: "power1.in",
              duration: 0.5,
            },
            0,
          );

          scrollTl.fromTo(
            mediaScale,
            { scale: 1 },
            { scale: 1.08, ease: "power1.inOut", duration: 0.55 },
            0,
          );
        }, section);

        const refresh = () => scheduleScrollTriggerRefresh();
        const rafId = requestAnimationFrame(() => {
          requestAnimationFrame(refresh);
        });
        const t0 = window.setTimeout(refresh, 80);
        const t1 = window.setTimeout(refresh, 350);
        const fontDone = document.fonts?.ready?.then(() => {
          requestAnimationFrame(refresh);
        });

        return () => {
          cancelAnimationFrame(rafId);
          window.clearTimeout(t0);
          window.clearTimeout(t1);
          void fontDone?.catch(() => undefined);
          ctxGsap.revert();
        };
      },
    );
    return () => mm.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      data-stack
      data-bg="#0a0a0a"
      className="relative min-h-[min(100dvh,56rem)] overflow-hidden bg-zinc-950 text-white"
    >
      <div
        ref={mediaRef}
        className="absolute inset-0 z-0 overflow-hidden will-change-[clip-path]"
      >
        <div
          ref={mediaScaleRef}
          className="absolute inset-0 will-change-transform"
        >
          <Image
            src={HOW_IT_WORKS_HERO.src}
            alt={HOW_IT_WORKS_HERO.alt}
            fill
            priority
            sizes="100vw"
            className="object-cover object-center"
            onLoad={() => {
              scheduleScrollTriggerRefresh();
            }}
          />
        </div>
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-zinc-950/92 via-zinc-950/60 to-zinc-950/30"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-zinc-950/20 mix-blend-overlay"
        />
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255,255,255,0.45) 1px, transparent 1px)",
            backgroundSize: "3px 3px",
          }}
        />
      </div>

      <div
        ref={textColumnRef}
        className="relative z-10 mx-auto flex min-h-[min(100dvh,56rem)] w-full max-w-5xl flex-col justify-center px-6 py-24 text-center md:py-32"
      >
        <p
          ref={kickerRef}
          className="editorial-chapter-label text-brand-light/80"
        >
          How it works
        </p>
        <h1
          ref={headlineRef}
          className="mt-6 font-[family-name:var(--font-display)] text-[clamp(36px,6vw,72px)] font-normal leading-[1.05] tracking-tight text-white drop-shadow-[0_2px_28px_rgba(0,0,0,0.5)]"
        >
          From map to posted letter
          <span className="mt-1 block text-brand-light/90">in thirty seconds.</span>
        </h1>
        <p
          ref={ledeRef}
          className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-zinc-200/90"
        >
          Three steps to turn any UK planning application into personalised
          outreach — plus an autonomous agent that monitors your saved searches
          around the clock.
        </p>
        <p
          ref={creditRef}
          className="mt-16 self-center text-[10px] uppercase tracking-[0.3em] text-zinc-400/90 md:mt-20"
        >
          Photo: {HOW_IT_WORKS_HERO.credit.name}
        </p>
      </div>
    </section>
  );
}
