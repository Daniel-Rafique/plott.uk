"use client";

/**
 * "02 — How it works" editorial section.
 *
 * Image-first workflow card. Each chapter is now static inside the global
 * card stack so the page has one clear scroll choreography.
 */

import Image from "next/image";
import { useGsapReveal } from "@/lib/animation/use-gsap-reveal";
import { useTextReveal } from "@/lib/animation/use-text-reveal";
import { HOME_CHAPTERS, type MarketingImage } from "@/lib/marketing/images";

type ChapterData = {
  number: string;
  kicker: string;
  title: string;
  body: string;
  bullets: string[];
  image: MarketingImage;
  accent: string;
};

const CHAPTERS: ChapterData[] = [
  {
    number: "01",
    kicker: "Draw the patch",
    title: "Find every site before your competitors.",
    body: "Zoom to any part of the UK, draw the polygon you care about, and we surface every live planning application inside it across all 337 local planning authorities — in around two seconds.",
    bullets: [
      "Photorealistic 3D maps via Google's aerial imagery",
      "Save any polygon as a standing search",
      "Filter by status, decision window, use class",
    ],
    image: HOME_CHAPTERS.map,
    accent: "from-emerald-900/30",
  },
  {
    number: "02",
    kicker: "We resolve the people",
    title: "The right name on the envelope, every time.",
    body: "Applicant, agent and return address are enriched from authoritative government and commercial sources automatically — no manual cross-referencing, no mismatched records.",
    bullets: [
      "78% named-agent hit rate",
      "Multi-source fallback cascade",
      "Compliant outreach starts with the correct recipient",
    ],
    image: HOME_CHAPTERS.enrichment,
    accent: "from-blue-900/30",
  },
  {
    number: "03",
    kicker: "Ship a branded letter",
    title: "Print-ready letters in under thirty seconds.",
    body: "Generate a branded A4 PDF with your logo, signature and company address. One letter at a time — or a bulk ZIP of 50+ personalised letters ready for the post room.",
    bullets: [
      "Your letterhead, their details",
      "Single-click or bulk-export workflows",
      "Outputs are audit-friendly and GDPR-aware",
    ],
    image: HOME_CHAPTERS.letter,
    accent: "from-purple-900/30",
  },
];

const ACCENT_DOTS: string[] = [
  "bg-emerald-400",
  "bg-blue-400",
  "bg-purple-400",
];

function Chapter({ chapter, index }: { chapter: ChapterData; index: number }) {
  return (
    <div
      data-reveal
      className="relative min-h-[28rem] overflow-hidden rounded-2xl md:min-h-[34rem]"
    >
      {/* Full-bleed image */}
      <div
        className="absolute inset-0 will-change-transform"
      >
        <Image
          src={chapter.image.src}
          alt={chapter.image.alt}
          fill
          sizes="100vw"
          className="object-cover"
          priority={index === 0}
        />
      </div>

      {/* Gradient scrim with per-chapter accent tint */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 bg-gradient-to-t ${chapter.accent} via-black/50 to-transparent`}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent"
      />

      {/* Decorative number watermark */}
      <span
        aria-hidden
        className="pointer-events-none absolute right-6 top-6 select-none font-[family-name:var(--font-display)] text-[clamp(100px,18vw,240px)] font-normal leading-none tracking-tighter text-white/[0.07] md:right-12 md:top-10"
      >
        {chapter.number}
      </span>

      {/* Text panel — bottom-aligned over image */}
      <div
        className="relative z-10 flex min-h-[28rem] flex-col justify-end px-6 pb-10 pt-24 md:min-h-[34rem] md:px-8 md:pb-12 md:pt-32"
      >
        <div className="max-w-2xl">
          <div data-anim className="flex items-baseline gap-4">
            <span className="font-[family-name:var(--font-display)] text-[48px] leading-none text-white/50 md:text-[64px]">
              {chapter.number}
            </span>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/70">
              {chapter.kicker}
            </p>
          </div>

          <h3
            data-anim
            className="mt-5 font-[family-name:var(--font-display)] text-[clamp(28px,4.5vw,56px)] font-normal leading-[1.1] tracking-tight text-white md:mt-6"
          >
            {chapter.title}
          </h3>

          <p
            data-anim
            className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/80 md:mt-5"
          >
            {chapter.body}
          </p>

          <ul data-anim className="mt-6 space-y-2.5 text-[13px] text-white/70 md:mt-8">
            {chapter.bullets.map((b) => (
              <li
                key={b}
                className="flex items-start gap-3 border-t border-white/10 pt-2.5 first:border-t-0 first:pt-0"
              >
                <span
                  aria-hidden
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${ACCENT_DOTS[index] ?? "bg-white/50"}`}
                />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function HowItWorks() {
  const headingRef = useTextReveal<HTMLHeadingElement>();
  const ref = useGsapReveal<HTMLDivElement>({ stagger: 0.06, start: "top 85%" });

  return (
    <section
      data-stack
      id="how-it-works"
      data-bg="#ffffff"
      className="relative flex min-h-[100svh] items-center bg-white"
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-24 md:py-28">
        <div ref={ref} className="editorial-hairline max-w-3xl pt-10">
          <p
            data-reveal
            className="editorial-chapter-label text-brand-dark"
          >
            02 — How it works
          </p>
          <h2
            ref={headingRef}
            className="mt-6 font-[family-name:var(--font-display)] text-[clamp(36px,5vw,68px)] font-normal leading-[1.1] tracking-tight text-zinc-950"
          >
            From patch to posted letter in three unhurried steps.
          </h2>
          <p
            data-reveal
            className="mt-6 max-w-xl text-[15px] leading-relaxed text-zinc-600"
          >
            No exports, no spreadsheet gymnastics, no six-tab research. Every
            step that used to take a junior a morning now takes seconds.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {CHAPTERS.map((c, i) => (
            <Chapter key={c.number} chapter={c} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
