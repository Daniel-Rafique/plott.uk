"use client";

// PLACEHOLDER CONTENT — the five "vignettes" below describe anonymised
// customer segments, not named customers. Replace with real named projects
// once we have permission. Desktop: hover for preview; narrow viewports: tap
// once to preview, tap again to follow the link. Full-bleed background is
// driven by the editorial London photography in `src/lib/marketing/images.ts`.

import Image from "next/image";
import { useRef, useState } from "react";
import { gsap } from "gsap";
import { ArrowUpRight } from "lucide-react";
import { useTextReveal } from "@/lib/animation/use-text-reveal";
import { useGsapReveal } from "@/lib/animation/use-gsap-reveal";
import { GALLERY_BACKDROPS } from "@/lib/marketing/images";
import { cn } from "@/lib/utils";

type Vignette = {
  number: string;
  title: string;
  tags: string[];
  backdropIndex: number;
};

const VIGNETTES: Vignette[] = [
  {
    number: "01",
    title: "Modular housing, Greater Manchester",
    tags: ["Saved search", "3D map"],
    backdropIndex: 0,
  },
  {
    number: "02",
    title: "Independent planning consultancy",
    tags: ["Digest", "Applicant enrichment"],
    backdropIndex: 1,
  },
  {
    number: "03",
    title: "Roofing contractor BD",
    tags: ["Branded letter", "Bulk export"],
    backdropIndex: 2,
  },
  {
    number: "04",
    title: "Regeneration developer",
    tags: ["Team workspace", "Polygon search"],
    backdropIndex: 3,
  },
  {
    number: "05",
    title: "Commercial property advisor",
    tags: ["Saved search", "Applicant enrichment"],
    backdropIndex: 4,
  },
];

export function ProjectsGallery() {
  const layerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const headingRef = useTextReveal<HTMLHeadingElement>();
  const introRef = useGsapReveal<HTMLDivElement>({ stagger: 0.07 });
  const rowsRef = useGsapReveal<HTMLUListElement>({
    selector: "[data-row]",
    stagger: 0.08,
    y: 40,
    duration: 1,
  });

  function tweenBackdropLayers(nextIndex: number | null) {
    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    layerRefs.current.forEach((layer, i) => {
      if (!layer) return;
      const target = nextIndex === null ? 0 : i === nextIndex ? 1 : 0;
      if (prefersReduced) {
        layer.style.opacity = String(target);
        return;
      }
      gsap.to(layer, {
        opacity: target,
        duration: target === 1 ? 0.7 : 0.45,
        ease: "power2.out",
        overwrite: "auto",
      });
    });
  }

  /**
   * Cross-fade between backdrops by tweening opacity of the stacked image
   * layers. All layers are pre-rendered so swaps feel instantaneous and no
   * flash of black occurs between rows.
   */
  const setActive = (nextIndex: number | null) => {
    setActiveIndex(nextIndex);
    tweenBackdropLayers(nextIndex);
  };

  /**
   * True when we can rely on hover (mouse / trackpad). Do not use width
   * alone: many phones are ≥768px in landscape and still have no hover — they
   * must use tap-to-preview, not a single click that jumps straight to the link.
   */
  function isHoverGallery() {
    if (typeof window === "undefined") return true;
    return window.matchMedia(
      "(min-width: 768px) and (hover: hover) and (pointer: fine)",
    ).matches;
  }

  /**
   * Touch / no-hover: first tap shows the image (and updates state); second
   * tap on the same row goes to the link. Keep this in `onClick` only so we
   * do not get the “pointerdown + click” in one gesture to navigate.
   */
  function handleRowClick(
    e: { preventDefault: () => void },
    backdropIndex: number,
  ) {
    if (isHoverGallery()) return;
    if (activeIndex !== backdropIndex) {
      e.preventDefault();
      setActive(backdropIndex);
    }
  }

  /**
   * Instant backdrop fade on touch start (no wait for the synthetic click),
   * without updating `activeIndex` so the following click is still a “first
   * tap” and stays on the page.
   */
  function previewBackdropOnTouch(backdropIndex: number) {
    if (isHoverGallery()) return;
    tweenBackdropLayers(backdropIndex);
  }

  return (
    <section
      data-stack
      data-bg="#0a0a0a"
      className="relative flex min-h-[100svh] items-center overflow-hidden bg-zinc-950"
    >
      {/* Stacked editorial photography. Each layer sits at opacity 0 until its
          corresponding row is hovered/focused, at which point it fades in. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {GALLERY_BACKDROPS.map((img, i) => (
          <div
            key={img.src}
            ref={(el) => {
              layerRefs.current[i] = el;
            }}
            className="absolute inset-0 opacity-0"
          >
            <Image
              src={img.src}
              alt=""
              fill
              sizes="100vw"
              className="object-cover"
            />
          </div>
        ))}
        {/* Single tonal darkening overlay so serif text stays readable on any
            backdrop. Kept as one layer (instead of stacked flat + gradient) to
            minimise decorative siblings that can drift between SSR and CSR
            during Fast Refresh. */}
        <div
          className="absolute inset-0 bg-gradient-to-b from-zinc-950/95 via-zinc-950/70 to-zinc-950/95"
        />
        {/* Subtle film grain */}
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255,255,255,0.4) 1px, transparent 1px)",
            backgroundSize: "3px 3px",
          }}
        />
      </div>

      <div className="relative mx-auto w-full max-w-7xl px-6 py-24 md:py-28">
        <div ref={introRef} className="editorial-hairline-dark max-w-3xl pt-10">
          <p
            data-reveal
            className="editorial-chapter-label text-brand-light/70"
          >
            05 — Featured vignettes
          </p>
          <h2
            ref={headingRef}
            className="mt-6 font-[family-name:var(--font-display)] text-[clamp(36px,5vw,68px)] font-normal leading-[1.1] tracking-tight text-white"
          >
            Where <span className="text-brand-light">Plott</span> earns its keep.
          </h2>
          <p
            data-reveal
            className="mt-6 max-w-xl text-[15px] leading-relaxed text-zinc-300"
          >
            Anonymised composites of how different teams use the platform.{" "}
            <span className="md:hidden">
              Tap a row to preview the photo, then tap again to open pricing.
            </span>
            <span className="hidden md:inline">
              Hover a row — the backdrop tells the story.
            </span>
          </p>
        </div>

        <ul
          ref={rowsRef}
          className="mt-20 md:mt-24"
          onMouseLeave={() => {
            if (isHoverGallery()) setActive(null);
          }}
        >
          {VIGNETTES.map((v) => {
            const previewing = activeIndex === v.backdropIndex;
            return (
            <li
              key={v.number}
              data-row
              className={cn(
                "group relative border-t border-white/10 transition-colors last:border-b",
                previewing && "md:bg-transparent bg-white/[0.04]",
              )}
              onMouseEnter={() => {
                if (isHoverGallery()) setActive(v.backdropIndex);
              }}
              onFocus={() => setActive(v.backdropIndex)}
            >
              <a
                href="/pricing"
                onTouchStart={() => {
                  if (!isHoverGallery()) previewBackdropOnTouch(v.backdropIndex);
                }}
                onClick={(e) => handleRowClick(e, v.backdropIndex)}
                className="grid touch-manipulation grid-cols-[auto_1fr_auto] items-center gap-6 py-8 transition-colors md:py-12"
              >
                <span
                  className={cn(
                    "font-[family-name:var(--font-display)] text-[28px] leading-none text-zinc-500 transition-colors md:text-[36px]",
                    "group-hover:text-brand-light",
                    previewing && "text-brand-light",
                  )}
                >
                  {v.number}
                </span>
                <span
                  className={cn(
                    "font-[family-name:var(--font-display)] text-[clamp(22px,3vw,40px)] font-normal leading-tight tracking-tight text-zinc-100 transition-transform duration-500 group-hover:translate-x-2",
                    previewing && "translate-x-2",
                  )}
                >
                  {v.title}
                </span>
                <span
                  className={cn(
                    "items-center gap-3 text-[11px] uppercase tracking-[0.22em] text-zinc-400",
                    "hidden md:flex",
                    previewing && "flex",
                  )}
                >
                  {v.tags.map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                  <ArrowUpRight
                    className="h-4 w-4 text-zinc-400 transition-colors group-hover:text-brand-light"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                </span>
              </a>
            </li>
            );
          })}
        </ul>

        {/* Subtle active-row photo credit */}
        <p className="mt-10 pl-4 text-[10px] uppercase tracking-[0.3em] text-zinc-500">
          {activeIndex !== null ? (
            `Photo: ${GALLERY_BACKDROPS[activeIndex].credit.name}`
          ) : (
            <>
              Anonymised composites.
              <span className="md:hidden"> Tap a row to preview.</span>
              <span className="hidden md:inline"> Hover a row.</span>
            </>
          )}
        </p>
      </div>
    </section>
  );
}
