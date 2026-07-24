"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { MCP_HERO } from "@/lib/marketing/images";
import { scheduleScrollTriggerRefresh } from "@/lib/animation/scroll-trigger-refresh";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const MCP_URL = "https://plott.uk/api/mcp";

export function McpHero() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const mediaRef = useRef<HTMLDivElement | null>(null);
  const mediaScaleRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLDivElement | null>(null);
  const kickerRef = useRef<HTMLParagraphElement | null>(null);
  const headlineRef = useRef<HTMLHeadingElement | null>(null);
  const ledeRef = useRef<HTMLParagraphElement | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const creditRef = useRef<HTMLAnchorElement | null>(null);

  useLayoutEffect(() => {
    const section = sectionRef.current;
    const media = mediaRef.current;
    const mediaScale = mediaScaleRef.current;
    const text = textRef.current;
    const items = [
      kickerRef.current,
      headlineRef.current,
      ledeRef.current,
      actionsRef.current,
      creditRef.current,
    ].filter(Boolean);
    if (!section || !media || !mediaScale || !text || items.length !== 5) {
      return;
    }

    const mm = gsap.matchMedia();
    mm.add(
      {
        reduced: "(prefers-reduced-motion: reduce)",
        normal: "(prefers-reduced-motion: no-preference)",
      },
      (context) => {
        if (context.conditions?.reduced) {
          gsap.set(media, { clipPath: "none" });
          gsap.set(mediaScale, { scale: 1, clearProps: "transform" });
          gsap.set(items, {
            opacity: 1,
            y: 0,
            clearProps: "transform,opacity",
          });
          gsap.set(text, { y: 0, opacity: 1, clearProps: "all" });
          return;
        }

        gsap.set(media, { clipPath: "inset(100% 0% 0% 0%)" });
        gsap.set(mediaScale, { scale: 1, transformOrigin: "50% 40%" });
        gsap.set(items, { opacity: 0, y: 28 });
        gsap.set(text, { y: 0, opacity: 1 });

        const gsapContext = gsap.context(() => {
          const entrance = gsap.timeline({
            defaults: { ease: "power3.out" },
            delay: 0.06,
            onComplete: scheduleScrollTriggerRefresh,
          });

          entrance.fromTo(
            media,
            { clipPath: "inset(100% 0% 0% 0%)" },
            { clipPath: "inset(0% 0% 0% 0%)", duration: 1.15 },
            0,
          );
          entrance.to(
            items,
            {
              opacity: 1,
              y: 0,
              duration: 0.65,
              stagger: 0.1,
            },
            0.14,
          );

          const scroll = gsap.timeline({
            scrollTrigger: {
              trigger: section,
              start: "top top",
              end: "bottom top",
              scrub: 0.85,
              invalidateOnRefresh: true,
            },
          });
          scroll.fromTo(
            text,
            { y: 0, opacity: 1 },
            {
              y: -64,
              opacity: 0.22,
              ease: "power1.in",
              duration: 0.5,
            },
            0,
          );
          scroll.fromTo(
            mediaScale,
            { scale: 1 },
            { scale: 1.08, ease: "power1.inOut", duration: 0.55 },
            0,
          );
        }, section);

        const refresh = () => scheduleScrollTriggerRefresh();
        const frame = requestAnimationFrame(() =>
          requestAnimationFrame(refresh),
        );
        const earlyRefresh = window.setTimeout(refresh, 80);
        const lateRefresh = window.setTimeout(refresh, 350);
        const fontsReady = document.fonts?.ready?.then(refresh);

        return () => {
          cancelAnimationFrame(frame);
          window.clearTimeout(earlyRefresh);
          window.clearTimeout(lateRefresh);
          void fontsReady?.catch(() => undefined);
          gsapContext.revert();
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
      className="relative flex min-h-[min(100dvh,56rem)] items-center overflow-hidden bg-zinc-950 px-6 py-28 text-white md:py-36"
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
            src={MCP_HERO.src}
            alt={MCP_HERO.alt}
            fill
            priority
            sizes="100vw"
            className="object-cover object-center"
            onLoad={scheduleScrollTriggerRefresh}
          />
        </div>
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-r from-zinc-950/95 via-zinc-950/80 to-zinc-950/35"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-zinc-950/70 via-transparent to-zinc-950/25"
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
        ref={textRef}
        className="relative z-10 mx-auto w-full max-w-6xl will-change-transform"
      >
        <p
          ref={kickerRef}
          className="inline-flex items-center gap-2 rounded-full border border-brand-light/30 bg-brand/15 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-light"
        >
          <span className="h-2 w-2 rounded-full bg-brand-light" />
          Live remote MCP
        </p>
        <h1
          ref={headlineRef}
          className="mt-8 max-w-4xl font-[family-name:var(--font-display)] text-[clamp(48px,7vw,92px)] font-normal leading-[0.98] tracking-tight drop-shadow-[0_2px_28px_rgba(0,0,0,0.5)]"
        >
          Plott, wherever you work with AI.
        </h1>
        <p
          ref={ledeRef}
          className="mt-8 max-w-2xl text-lg leading-relaxed text-zinc-200/90"
        >
          Connect Claude, ChatGPT, Cursor or another compatible MCP client to
          live planning intelligence and your Plott workspace.
        </p>
        <div
          ref={actionsRef}
          className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center"
        >
          <Link
            href="/auth/sign-up"
            className="group inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-zinc-950 transition hover:bg-brand-light"
          >
            Start with Plott
            <ArrowRight
              className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
          <code className="overflow-x-auto rounded-full border border-white/15 bg-white/5 px-5 py-3 text-center text-xs text-zinc-300 backdrop-blur-sm">
            {MCP_URL}
          </code>
        </div>
      </div>

      <a
        ref={creditRef}
        href={MCP_HERO.credit.url}
        target="_blank"
        rel="noreferrer"
        className="absolute right-6 bottom-6 z-10 text-[10px] uppercase tracking-[0.25em] text-zinc-400 transition hover:text-white"
      >
        Photo: {MCP_HERO.credit.name}
      </a>
    </section>
  );
}
