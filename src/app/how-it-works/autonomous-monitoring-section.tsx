"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { scheduleScrollTriggerRefresh } from "@/lib/animation/scroll-trigger-refresh";
import { splitIntoWords } from "@/lib/animation/use-text-reveal";
import { HOW_IT_WORKS_AGENT_SECTION } from "@/lib/marketing/images";
import { AGENT_FEATURES, AgentDiagram } from "./agent-diagram";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

/**
 * 04 — Autonomous monitoring: full-bleed night skyline, entrance timeline on
 * scroll-into-view (clip, masked heading, staggered list + diagram), and a
 * light scroll-scrubbed parallax on the image — aligned with the marketing heroes.
 */
export function AutonomousMonitoringSection() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const mediaRef = useRef<HTMLDivElement | null>(null);
  const mediaScaleRef = useRef<HTMLDivElement | null>(null);
  const kickerRef = useRef<HTMLParagraphElement | null>(null);
  const headlineRef = useRef<HTMLHeadingElement | null>(null);
  const bodyRef = useRef<HTMLParagraphElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const diagramRef = useRef<HTMLDivElement | null>(null);
  const creditRef = useRef<HTMLParagraphElement | null>(null);
  const contentBlockRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const mediaEl = mediaRef.current;
    const mediaScale = mediaScaleRef.current;
    const kicker = kickerRef.current;
    const headline = headlineRef.current;
    const body = bodyRef.current;
    const list = listRef.current;
    const diagram = diagramRef.current;
    const credit = creditRef.current;
    const contentBlock = contentBlockRef.current;
    if (
      !section ||
      !mediaEl ||
      !mediaScale ||
      !kicker ||
      !headline ||
      !body ||
      !list ||
      !diagram ||
      !credit ||
      !contentBlock
    ) {
      return;
    }

    const listItems = list.querySelectorAll<HTMLElement>("li");

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
          gsap.set([kicker, body, credit, diagram, contentBlock], {
            clearProps: "all",
            opacity: 1,
            x: 0,
            y: 0,
          });
          gsap.set(mediaScale, { scale: 1, clearProps: "transform" });
          gsap.set(listItems, { opacity: 1, x: 0, clearProps: "all" });
          if (headline.querySelectorAll(".text-reveal-word").length) {
            gsap.set(
              headline.querySelectorAll<HTMLElement>(".text-reveal-word"),
              { yPercent: 0, opacity: 1 },
            );
          } else {
            gsap.set(headline, { opacity: 1 });
          }
          return;
        }

        const words = splitIntoWords(headline);
        gsap.set(kicker, { opacity: 0, y: 28 });
        gsap.set(body, { opacity: 0, y: 24 });
        gsap.set(credit, { opacity: 0, y: 8 });
        gsap.set(listItems, { opacity: 0, x: -20 });
        gsap.set(diagram, { opacity: 0, x: 40 });
        gsap.set(contentBlock, { y: 0, opacity: 1 });
        gsap.set(mediaEl, { clipPath: "inset(100% 0% 0% 0%)" });
        gsap.set(mediaScale, { scale: 1, transformOrigin: "50% 50%" });
        gsap.set(words, { yPercent: 110, opacity: 0, force3D: true });

        const ctxGsap = gsap.context(() => {
          const enter = gsap.timeline({
            defaults: { ease: "power3.out" },
            paused: true,
            onComplete: () => {
              scheduleScrollTriggerRefresh();
            },
          });

          enter.fromTo(
            mediaEl,
            { clipPath: "inset(100% 0% 0% 0%)" },
            { clipPath: "inset(0% 0% 0% 0%)", duration: 1 },
            0,
          );

          enter.to(
            kicker,
            { opacity: 1, y: 0, duration: 0.5 },
            0.1,
          );

          enter.fromTo(
            words,
            { yPercent: 110, opacity: 0 },
            {
              yPercent: 0,
              opacity: 1,
              duration: 0.65,
              stagger: 0.035,
            },
            0.18,
          );

          enter.to(
            body,
            { opacity: 1, y: 0, duration: 0.5 },
            0.4,
          );

          enter.to(
            listItems,
            { opacity: 1, x: 0, duration: 0.4, stagger: 0.1 },
            0.48,
          );

          enter.to(
            diagram,
            { opacity: 1, x: 0, duration: 0.75, ease: "power3.out" },
            0.5,
          );

          enter.to(
            credit,
            { opacity: 1, y: 0, duration: 0.35 },
            0.7,
          );

          ScrollTrigger.create({
            trigger: section,
            start: "top 78%",
            once: true,
            onEnter: () => {
              enter.play(0);
            },
          });

          const scrollTl = gsap.timeline({
            scrollTrigger: {
              trigger: section,
              start: "top bottom",
              end: "bottom top",
              scrub: 0.9,
            },
          });

          scrollTl.to(
            contentBlock,
            { y: -36, ease: "power1.inOut" },
            0,
          );

          scrollTl.to(
            mediaScale,
            { scale: 1.07, ease: "power1.inOut" },
            0,
          );
        }, section);

        const cancelRefresh = scheduleScrollTriggerRefresh();

        return () => {
          cancelRefresh();
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
      className="relative overflow-hidden bg-zinc-950 py-28 md:py-40"
    >
      <div
        ref={mediaRef}
        className="absolute inset-0 z-0 will-change-[clip-path]"
      >
        <div
          ref={mediaScaleRef}
          className="absolute inset-0 will-change-transform"
        >
          <Image
            src={HOW_IT_WORKS_AGENT_SECTION.src}
            alt=""
            fill
            sizes="(max-width: 1200px) 100vw, 1200px"
            className="object-cover object-[55%_center] md:object-center"
            aria-hidden
          />
        </div>
        {/* Base darkening + angled scrim: strong enough for white + zinc-300/400
            copy on both columns (left + diagram) without killing the photo. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-zinc-950/45"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: `
              linear-gradient(
                100deg,
                rgb(9 9 11 / 0.96) 0%,
                rgb(9 9 11 / 0.88) 18%,
                rgb(9 9 11 / 0.72) 35%,
                rgb(9 9 11 / 0.58) 52%,
                rgb(9 9 11 / 0.5) 68%,
                rgb(9 9 11 / 0.55) 100%
              )`,
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-zinc-950/90 via-zinc-950/35 to-zinc-950/50"
        />
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255,255,255,0.4) 1px, transparent 1px)",
            backgroundSize: "3px 3px",
          }}
        />
      </div>

      <div
        ref={contentBlockRef}
        className="relative z-10"
      >
        <div className="mx-auto w-full max-w-6xl px-6">
          <div className="grid gap-16 lg:grid-cols-2 lg:gap-20">
            <div>
              <p
                ref={kickerRef}
                className="editorial-chapter-label text-brand-light/75"
              >
                04 — Autonomous monitoring
              </p>
              <h2
                ref={headlineRef}
                className="mt-6 font-[family-name:var(--font-display)] text-[clamp(32px,4vw,56px)] font-normal leading-[1.1] tracking-tight text-white drop-shadow-[0_2px_20px_rgba(0,0,0,0.45)]"
              >
                Your saved searches run themselves.
              </h2>
              <p
                ref={bodyRef}
                className="mt-6 max-w-lg text-[15px] leading-relaxed text-zinc-200"
              >
                Save any polygon and our autonomous agent takes over. It
                re-runs your search every 48 hours, detects new applications,
                enriches them automatically, prepares letter and email outreach
                drafts, and delivers a weekly digest straight to your inbox. If
                email outreach is enabled, public business contacts still stay
                behind compliance checks, suppression checks, and human approval.
              </p>

              <ul ref={listRef} className="mt-10 space-y-4">
                {AGENT_FEATURES.map((feature) => (
                  <li
                    key={feature.title}
                    className="flex items-start gap-3"
                  >
                    <span
                      aria-hidden
                      className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand-light"
                    />
                    <div>
                      <span className="text-[14px] font-medium text-white">
                        {feature.title}
                      </span>
                      <span className="text-[14px] text-zinc-300">
                        {" "}
                        — {feature.description}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div ref={diagramRef} className="flex items-center">
              <AgentDiagram />
            </div>
          </div>

          <p
            ref={creditRef}
            className="mt-14 text-right text-[10px] uppercase tracking-[0.3em] text-zinc-500 md:mt-16"
          >
            Photo: {HOW_IT_WORKS_AGENT_SECTION.credit.name}
          </p>
        </div>
      </div>
    </section>
  );
}
