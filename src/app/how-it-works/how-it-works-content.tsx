"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowRight, Map, Users, MailCheck } from "lucide-react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { RevealGroup, RevealHeading } from "@/lib/animation/reveal";
import { AutonomousMonitoringSection } from "./autonomous-monitoring-section";
import { HowItWorksHero } from "./how-it-works-hero";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const STEPS = [
  {
    number: "01",
    icon: Map,
    title: "Draw the patch",
    subtitle: "Define your territory in seconds",
    description:
      "Zoom to any part of the UK on our photorealistic 3D map. Draw a polygon around the area you care about — a postcode, a borough, an entire county. We query all 337 local planning authorities and surface every live application inside your boundary in under two seconds.",
    details: [
      "Photorealistic 3D maps powered by Google's aerial imagery",
      "Filter by application status, decision window, or use class",
      "Save any polygon as a standing search for continuous monitoring",
    ],
  },
  {
    number: "02",
    icon: Users,
    title: "We resolve the people",
    subtitle: "Multi-source enrichment cascade",
    description:
      "Raw planning data rarely includes contact details. Our enrichment pipeline cross-references each application against property ownership records, Companies House filings, and council portals to surface the applicant, agent, and return address — automatically.",
    details: [
      "78% named-agent hit rate across all applications",
      "Fallback cascade: PlanWire → Land Registry → Companies House → LPA portal",
      "Results cached for instant retrieval on repeat views",
    ],
  },
  {
    number: "03",
    icon: MailCheck,
    title: "Send approved outreach",
    subtitle: "Letters or email, always human-approved",
    description:
      "Generate a personalised A4 letter or review an email draft for a publicly available business address. Email sending is opt-in at workspace level, checked for compliance, routed through a human approval queue, and synced through Resend with audit details recorded.",
    details: [
      "Customisable letterhead and email templates with merge fields",
      "Single-click PDFs, bulk letter export, or approve-and-send email",
      "Compliance guardrails, suppression checks, and sent audit trail",
    ],
  },
];

const DIAGRAM_STEPS = [
  { label: "Draw polygon", time: "~2 seconds", Icon: Map, step: 1 },
  { label: "Enrichment cascade", time: "~5 seconds", Icon: Users, step: 2 },
  { label: "Outreach review", time: "~3 seconds", Icon: MailCheck, step: 3 },
];

const DIAGRAM_STATS = [
  { value: "337", label: "UK planning authorities" },
  { value: "78%", label: "agent name hit rate" },
  { value: "<10s", label: "to a letter or email draft" },
];

function ProcessDiagram() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const heading = container.querySelector<HTMLElement>("[data-heading]");
    const icons = container.querySelectorAll<HTMLElement>("[data-icon]");
    const badges = container.querySelectorAll<HTMLElement>("[data-badge]");
    const arrows = container.querySelectorAll<HTMLElement>("[data-arrow]");
    const line = container.querySelector<HTMLElement>("[data-line]");
    const labels = container.querySelectorAll<HTMLElement>("[data-label]");
    const summary = container.querySelector<HTMLElement>("[data-summary]");
    const features = container.querySelectorAll<HTMLElement>("[data-feature]");

    if (prefersReduced) {
      gsap.set([heading, icons, badges, arrows, line, labels, summary, features], { 
        opacity: 1, scale: 1, y: 0 
      });
      if (line) gsap.set(line, { scaleX: 1 });
      return;
    }

    gsap.set(heading, { opacity: 0, y: 20 });
    gsap.set(icons, { opacity: 0, scale: 0, transformOrigin: "center center" });
    gsap.set(badges, { opacity: 0, scale: 0, transformOrigin: "center center" });
    gsap.set(arrows, { opacity: 0, x: -10 });
    gsap.set(line, { scaleX: 0, transformOrigin: "left center" });
    gsap.set(labels, { opacity: 0, y: 16 });
    gsap.set(summary, { opacity: 0, y: 12 });
    gsap.set(features, { opacity: 0, y: 20 });

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: container,
          start: "top 70%",
          toggleActions: "play none none none",
        },
      });

      tl.to(heading, {
        opacity: 1,
        y: 0,
        duration: 0.6,
        ease: "power3.out",
      });

      tl.to(
        icons,
        {
          opacity: 1,
          scale: 1,
          duration: 0.6,
          ease: "back.out(1.7)",
          stagger: 0.15,
        },
        0.2,
      );

      tl.to(
        badges,
        {
          opacity: 1,
          scale: 1,
          duration: 0.4,
          ease: "back.out(2)",
          stagger: 0.15,
        },
        0.35,
      );

      tl.to(
        line,
        {
          scaleX: 1,
          duration: 0.8,
          ease: "power2.out",
        },
        0.3,
      );

      tl.to(
        arrows,
        {
          opacity: 1,
          x: 0,
          duration: 0.4,
          ease: "power2.out",
          stagger: 0.1,
        },
        0.6,
      );

      tl.to(
        labels,
        {
          opacity: 1,
          y: 0,
          duration: 0.5,
          ease: "power3.out",
          stagger: 0.1,
        },
        0.5,
      );

      tl.to(
        summary,
        {
          opacity: 1,
          y: 0,
          duration: 0.5,
          ease: "power3.out",
        },
        0.8,
      );

      tl.to(
        features,
        {
          opacity: 1,
          y: 0,
          duration: 0.5,
          ease: "power3.out",
          stagger: 0.08,
        },
        0.9,
      );
    }, container);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={containerRef} className="relative mx-auto max-w-5xl">
      {/* Section heading */}
      <div data-heading className="editorial-hairline mb-16 max-w-2xl pt-8">
        <p className="editorial-chapter-label text-brand-dark">The workflow</p>
        <h2 className="mt-6 font-[family-name:var(--font-display)] text-[clamp(28px,4vw,44px)] font-normal leading-[1.15] tracking-tight text-zinc-950">
          Three steps. Ten seconds. Done.
        </h2>
      </div>

      {/* Diagram container */}
      <div className="relative mx-auto max-w-4xl">
        {/* Connecting line - rendered behind icons */}
        <div
          data-line
          className="pointer-events-none absolute left-[16.67%] right-[16.67%] top-8 z-0 hidden h-0.5 -translate-y-1/2 bg-gradient-to-r from-zinc-300 via-zinc-200 to-zinc-300 md:block"
        />

        {/* Animated arrows between steps */}
        <div className="pointer-events-none absolute left-[33%] top-8 z-[5] hidden -translate-x-1/2 -translate-y-1/2 md:block">
          <div data-arrow className="flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-sm">
            <ArrowRight className="h-3 w-3 text-zinc-400" />
          </div>
        </div>
        <div className="pointer-events-none absolute left-[67%] top-8 z-[5] hidden -translate-x-1/2 -translate-y-1/2 md:block">
          <div data-arrow className="flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-sm">
            <ArrowRight className="h-3 w-3 text-zinc-400" />
          </div>
        </div>

        {/* Icons grid - z-10 to appear above line */}
        <div className="relative z-10 grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-4">
          {DIAGRAM_STEPS.map(({ label, time, Icon, step }) => (
            <div key={label} className="flex flex-col items-center">
              <div className="relative">
                <div
                  data-icon
                  className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-900 text-white shadow-lg"
                >
                  <Icon className="h-7 w-7" />
                </div>
                {/* Step badge */}
                <div
                  data-badge
                  className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-white shadow-md"
                >
                  {step}
                </div>
              </div>
              <div data-label className="mt-4 text-center">
                <p className="text-sm font-semibold text-zinc-900">{label}</p>
                <p className="mt-1 text-xs text-zinc-500">{time}</p>
              </div>
            </div>
          ))}
        </div>

        <div data-summary className="mt-12 text-center">
          <p className="text-sm font-medium text-brand-dark">
            Total time: ~10 seconds from search to human-approved outreach draft
          </p>
        </div>
      </div>

      {/* Stats row with hairline dividers */}
      <div className="mt-20 grid grid-cols-1 divide-y divide-zinc-200 border-y border-zinc-200 md:grid-cols-3 md:divide-x md:divide-y-0">
        {DIAGRAM_STATS.map((stat) => (
          <div
            key={stat.label}
            data-feature
            className="py-8 text-center md:px-8"
          >
            <p className="font-[family-name:var(--font-display)] text-[clamp(32px,4vw,48px)] font-normal leading-none tracking-tight text-zinc-950">
              {stat.value}
            </p>
            <p className="mt-3 text-[13px] text-zinc-500">
              {stat.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HowItWorksContent() {
  return (
    <>
      <HowItWorksHero />

      {/* Process overview diagram */}
      <section data-stack className="relative bg-stone-50 py-24 md:py-32">
        <div className="mx-auto w-full max-w-5xl px-6">
          <ProcessDiagram />
        </div>
      </section>

      {/* Step-by-step breakdown */}
      <section data-stack className="relative bg-white py-28 md:py-40">
        <div className="mx-auto w-full max-w-6xl px-6">
          <div className="space-y-32">
            {STEPS.map((step) => (
              <RevealGroup
                key={step.number}
                className="grid gap-12 md:grid-cols-[280px_1fr] md:gap-20"
                stagger={0.08}
              >
                <div data-reveal>
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100">
                      <step.icon className="h-6 w-6 text-zinc-700" />
                    </div>
                    <span className="font-[family-name:var(--font-display)] text-[48px] leading-none text-zinc-200">
                      {step.number}
                    </span>
                  </div>
                  <p className="editorial-chapter-label mt-6 text-brand-dark">
                    {step.title}
                  </p>
                </div>
                <div className="max-w-2xl">
                  <RevealHeading
                    as="h2"
                    className="font-[family-name:var(--font-display)] text-[clamp(28px,3.5vw,48px)] font-normal leading-[1.15] tracking-tight text-zinc-950"
                  >
                    {step.subtitle}
                  </RevealHeading>
                  <p
                    data-reveal
                    className="mt-6 text-[15px] leading-relaxed text-zinc-600"
                  >
                    {step.description}
                  </p>
                  <ul className="mt-8 space-y-3">
                    {step.details.map((detail) => (
                      <li
                        key={detail}
                        data-reveal
                        className="flex items-start gap-3 text-[14px] text-zinc-700"
                      >
                        <span
                          aria-hidden
                          className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand"
                        />
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </RevealGroup>
            ))}
          </div>
        </div>
      </section>

      <AutonomousMonitoringSection />

      {/* CTA */}
      <section data-stack className="relative bg-stone-50 py-28 md:py-40">
        <div className="mx-auto w-full max-w-3xl px-6 text-center">
          <RevealGroup stagger={0.08}>
            <RevealHeading
              as="h2"
              className="font-[family-name:var(--font-display)] text-[clamp(32px,5vw,64px)] font-normal leading-[1.08] tracking-tight text-zinc-950"
            >
              Ready to see it in action?
            </RevealHeading>
            <p
              data-reveal
              className="mx-auto mt-6 max-w-xl text-[15px] leading-relaxed text-zinc-600"
            >
              Start your 3-day trial and draw your
              first polygon in under a minute. Letters and email outreach both
              stay behind your review step.
            </p>
            <div
              data-reveal
              className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4"
            >
              <Link
                href="/auth/sign-up"
                className="inline-flex items-center gap-2 rounded-full border border-zinc-900 bg-zinc-900 px-8 py-4 text-[14px] font-semibold text-white transition hover:border-zinc-700 hover:bg-zinc-700"
              >
                Start free trial
                <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 rounded-full border border-zinc-300 px-8 py-4 text-[14px] font-semibold text-zinc-900 transition hover:border-zinc-900"
              >
                View pricing
              </Link>
            </div>
          </RevealGroup>
        </div>
      </section>
    </>
  );
}
