"use client";

import Image from "next/image";
import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { scheduleScrollTriggerRefresh } from "@/lib/animation/scroll-trigger-refresh";
import { ABOUT_HERO } from "@/lib/marketing/images";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

/**
 * About page hero: full-bleed photography, time-based entrance (clip + fade-up
 * headline) so first paint is legible, then scroll-scrubbed parallax (copy drift,
 * light fade, image scale) for motion tied to leaving the fold — same GSAP
 * stack as the rest of marketing.
 */
export function AboutHero() {
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

        /* Whole heading tween only — per-word splitIntoWords() was reliable on
           refresh but could leave .text-reveal-word nodes stuck hidden on
           first paint / hydration, so the H1 area appeared blank. */
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

          /* Scroll-driven parallax — fromTo() so @ progress=0 the hero is
             always fully visible; implicit `to()` can stick at the end if ST
             measures before layout/fonts/Lenis are ready. */
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
            src={ABOUT_HERO.src}
            alt={ABOUT_HERO.alt}
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
          className="absolute inset-0 bg-gradient-to-b from-zinc-950/95 via-zinc-950/60 to-zinc-950/20"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-zinc-950/15 mix-blend-overlay"
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
        className="relative z-10 mx-auto flex min-h-[min(100dvh,56rem)] w-full max-w-7xl flex-col px-6 pb-8 pt-24 md:pb-12 md:pt-32"
      >
        <div className="max-w-4xl">
          <p
            ref={kickerRef}
            className="editorial-chapter-label text-brand-light/80"
          >
            About — Plott
          </p>
          <h1
            ref={headlineRef}
            className="mt-6 font-[family-name:var(--font-display)] text-[clamp(44px,7vw,108px)] font-normal leading-[1.02] tracking-tight text-white drop-shadow-[0_2px_24px_rgba(0,0,0,0.45)]"
          >
            We turn the UK&apos;s planning record into your
            <span className="block italic text-brand-light/80">competitive advantage.</span>
          </h1>
          <p
            ref={ledeRef}
            className="mt-10 max-w-xl text-[15px] leading-relaxed text-zinc-200/90"
          >
            Plott is a small, focused team of software and planning
            specialists. We&apos;re based in the UK, we use our own product
            daily, and we ship every week. This page is an honest description
            of what we&apos;re building and who we&apos;re building it for.
          </p>
        </div>
        <p
          ref={creditRef}
          className="mt-auto pt-20 text-right text-[10px] uppercase tracking-[0.3em] text-zinc-400/90"
        >
          Photo: {ABOUT_HERO.credit.name}
        </p>
      </div>
    </section>
  );
}
