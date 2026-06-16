"use client";

/**
 * "03 — Capabilities" section. Monochrome editorial grid with hairline dividers.
 * Entrance uses the shared useGsapReveal hook for a staggered fade-up.
 */

import {
  FileSignature,
  HardHat,
  Layers3,
  MapPinned,
  Radar,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { useGsapReveal } from "@/lib/animation/use-gsap-reveal";
import { useTextReveal } from "@/lib/animation/use-text-reveal";

type Feature = {
  icon: LucideIcon;
  title: string;
  body: string;
};

const FEATURES: Feature[] = [
  {
    icon: MapPinned,
    title: "Photorealistic 3D discovery",
    body: "Scan sites in true 3D with Google's aerial tiles. See buildable footprints, rooflines and street context before you pick up the phone.",
  },
  {
    icon: Layers3,
    title: "Every LPA in one index",
    body: "337 local planning authorities, unified into a single dataset. Search by map area, reference, development type, status or decision window.",
  },
  {
    icon: Radar,
    title: "Saved searches, delivered",
    body: "Pin a patch. We'll email you a digest of new applications every 48 hours — no manual re-running, no duplicates.",
  },
  {
    icon: FileSignature,
    title: "Branded outreach letters",
    body: "Generate A4 PDFs with your logo, letterhead and signature. Single letter, or a bulk ZIP for 50+ leads.",
  },
  {
    icon: ShieldCheck,
    title: "Applicant enrichment",
    body: "Names, agents and return addresses resolved automatically from authoritative sources. Compliant outreach starts with the right recipient.",
  },
  {
    icon: HardHat,
    title: "Built for construction teams",
    body: "Teams, roles and seat-level billing. Bring your BD, QS and ops team into one workspace without juggling spreadsheets.",
  },
];

export function FeaturesGrid() {
  const ref = useGsapReveal<HTMLDivElement>({ stagger: 0.08, start: "top 85%" });
  const headingRef = useTextReveal<HTMLHeadingElement>();

  return (
    <section
      data-stack
      id="features"
      data-bg="#fafaf9"
      className="relative flex min-h-[100svh] items-center bg-stone-50"
    >
      <div ref={ref} className="mx-auto w-full max-w-7xl px-6 py-24 md:py-28">
        <div className="editorial-hairline max-w-3xl pt-10">
          <p
            data-reveal
            className="editorial-chapter-label text-brand-dark"
          >
            03 — Capabilities
          </p>
          <h2
            ref={headingRef}
            className="mt-6 font-[family-name:var(--font-display)] text-[clamp(36px,5vw,68px)] font-normal leading-[1.1] tracking-tight text-zinc-950"
          >
            Every workflow your team actually runs.
          </h2>
        </div>

        <ul className="mt-16 grid grid-cols-1 gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 lg:gap-x-16">
          {FEATURES.map((f) => (
            <li
              key={f.title}
              data-reveal
              className="editorial-hairline pt-8"
            >
              <f.icon
                className="h-5 w-5 text-brand-dark"
                strokeWidth={1.5}
                aria-hidden
              />
              <h3 className="mt-7 font-[family-name:var(--font-display)] text-[24px] font-normal leading-tight tracking-tight text-zinc-950">
                {f.title}
              </h3>
              <p className="mt-3 text-[14px] leading-relaxed text-zinc-600">
                {f.body}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
