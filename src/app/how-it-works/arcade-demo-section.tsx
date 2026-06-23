"use client";

import { RevealGroup, RevealHeading } from "@/lib/animation/reveal";

const ARCADE_DEMO_URL =
  "https://demo.arcade.software/NJBWpsT2HdePyl36n3IF?embed&embed_mobile=tab&embed_desktop=inline&squared=true&show_copy_link=true";

export function ArcadeDemoSection() {
  return (
    <section data-stack className="relative bg-zinc-950 py-24 text-white md:py-32">
      <div className="mx-auto w-full max-w-7xl px-6">
        <RevealGroup stagger={0.08} className="grid gap-12 lg:grid-cols-[0.75fr_1.25fr] lg:items-center">
          <div className="max-w-xl">
            <p data-reveal className="editorial-chapter-label text-brand-light">
              Interactive demo
            </p>
            <RevealHeading
              as="h2"
              className="mt-6 font-[family-name:var(--font-display)] text-[clamp(34px,5vw,64px)] font-normal leading-[1.08] tracking-tight text-white"
            >
              Watch Plott draft and send outreach.
            </RevealHeading>
            <p
              data-reveal
              className="mt-6 text-[15px] leading-relaxed text-zinc-300"
            >
              Follow the flow from planning application to human-approved letter,
              with each step shown in the product instead of a static screenshot.
            </p>
          </div>

          <div
            data-reveal
            className="overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl shadow-black/40"
          >
            <div className="relative aspect-[1.8667/1] min-h-[360px] w-full sm:min-h-[420px]">
              <iframe
                src={ARCADE_DEMO_URL}
                title="Draft and Send Letters for Planning Applications"
                loading="lazy"
                allow="clipboard-write"
                allowFullScreen
                className="absolute inset-0 h-full w-full border-0 [color-scheme:light]"
              />
            </div>
          </div>
        </RevealGroup>
      </div>
    </section>
  );
}
