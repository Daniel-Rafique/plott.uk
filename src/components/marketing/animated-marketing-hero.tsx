"use client";

import Image from "next/image";
import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { scheduleScrollTriggerRefresh } from "@/lib/animation/scroll-trigger-refresh";
import type { MarketingImage } from "@/lib/marketing/images";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

type AnimatedMarketingHeroProps = {
  eyebrow: string;
  title: string;
  accent?: string;
  description: string;
  image: MarketingImage;
  meta?: string;
  align?: "left" | "center";
};

export function AnimatedMarketingHero({
  eyebrow,
  title,
  accent,
  description,
  image,
  meta,
  align = "left",
}: AnimatedMarketingHeroProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const mediaRef = useRef<HTMLDivElement | null>(null);
  const mediaScaleRef = useRef<HTMLDivElement | null>(null);
  const textColumnRef = useRef<HTMLDivElement | null>(null);
  const kickerRef = useRef<HTMLParagraphElement | null>(null);
  const headlineRef = useRef<HTMLHeadingElement | null>(null);
  const ledeRef = useRef<HTMLParagraphElement | null>(null);
  const metaRef = useRef<HTMLParagraphElement | null>(null);

  useLayoutEffect(() => {
    const section = sectionRef.current;
    const mediaEl = mediaRef.current;
    const mediaScale = mediaScaleRef.current;
    const textCol = textColumnRef.current;
    const kicker = kickerRef.current;
    const headline = headlineRef.current;
    const lede = ledeRef.current;
    const metaEl = metaRef.current;
    const revealTargets = [kicker, headline, lede, metaEl].filter(Boolean);
    if (!section || !mediaEl || !mediaScale || !textCol || !kicker || !headline || !lede) {
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
          gsap.set(revealTargets, {
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
        if (metaEl) gsap.set(metaEl, { opacity: 0, y: 12 });
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

          enter.to(kicker, { opacity: 1, y: 0, duration: 0.55 }, 0.12);
          enter.to(
            headline,
            { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" },
            0.2,
          );
          enter.to(lede, { opacity: 1, y: 0, duration: 0.6 }, 0.5);
          if (metaEl) {
            enter.to(metaEl, { opacity: 1, y: 0, duration: 0.4 }, 0.75);
          }

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

  const centered = align === "center";

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
            src={image.src}
            alt={image.alt}
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
          className="absolute inset-0 bg-gradient-to-b from-zinc-950/95 via-zinc-950/62 to-zinc-950/28"
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
        className={[
          "relative z-10 mx-auto flex min-h-[min(100dvh,56rem)] w-full flex-col px-6 py-24 md:py-32",
          centered
            ? "max-w-5xl items-center justify-center text-center"
            : "max-w-7xl justify-center",
        ].join(" ")}
      >
        <div className={centered ? "max-w-4xl" : "max-w-4xl"}>
          <p
            ref={kickerRef}
            className="editorial-chapter-label text-brand-light/80"
          >
            {eyebrow}
          </p>
          <h1
            ref={headlineRef}
            className="mt-6 font-[family-name:var(--font-display)] text-[clamp(40px,7vw,104px)] font-normal leading-[1.02] tracking-tight text-white drop-shadow-[0_2px_28px_rgba(0,0,0,0.5)]"
          >
            {title}
            {accent ? (
              <span className="block italic text-brand-light/85">{accent}</span>
            ) : null}
          </h1>
          <p
            ref={ledeRef}
            className={[
              "mt-8 max-w-2xl text-[15px] leading-relaxed text-zinc-200/90 md:text-lg",
              centered ? "mx-auto" : "",
            ].join(" ")}
          >
            {description}
          </p>
          {meta ? (
            <p
              ref={metaRef}
              className="mt-10 text-[10px] uppercase tracking-[0.3em] text-zinc-400/90"
            >
              {meta}
            </p>
          ) : null}
        </div>
        <p
          className={[
            "mt-auto pt-20 text-[10px] uppercase tracking-[0.3em] text-zinc-400/90",
            centered ? "self-center" : "self-end text-right",
          ].join(" ")}
        >
          Photo: {image.credit.name}
        </p>
      </div>
    </section>
  );
}
