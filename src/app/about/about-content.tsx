"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AboutHero } from "./about-hero";
import { RevealGroup, RevealHeading } from "@/lib/animation/reveal";
import { startFreeTrialLabel } from "@/lib/trial";

export function AboutContent() {
  return (
    <>
      <AboutHero />

      <section
        data-stack
        data-bg="#ffffff"
        className="relative bg-white py-28 md:py-40"
      >
        <div className="mx-auto w-full max-w-6xl px-6">
          <RevealGroup
            className="grid gap-16 md:grid-cols-[220px_1fr] md:gap-24"
            stagger={0.08}
          >
            <div data-reveal>
              <p className="editorial-chapter-label text-brand-dark">
                01 — Mission
              </p>
              <p className="mt-4 font-[family-name:var(--font-display)] text-[32px] leading-none text-brand-light/40">
                01
              </p>
            </div>
            <div className="max-w-2xl">
              <RevealHeading
                as="h2"
                className="font-[family-name:var(--font-display)] text-[clamp(32px,4vw,56px)] font-normal leading-[1.12] tracking-tight text-zinc-950"
              >
                Make winning work in the UK construction sector feel
                inevitable.
              </RevealHeading>
              <p data-reveal className="mt-6 text-[15px] leading-relaxed text-zinc-600">
                Every new building in the UK starts with a planning
                application. The data is public, the addresses are known, the
                intent is declared — yet most construction firms still find
                out about projects too late to win them. Plott
                collapses the week-long research cycle into a thirty-second
                workflow: see the site, know the applicant, approve the
                outreach.
              </p>
              <p data-reveal className="mt-5 text-[15px] leading-relaxed text-zinc-600">
                Our north star is simple — if your team can&apos;t get from
                an interesting polygon on a map to a branded letter or reviewed
                email draft in under five minutes, we&apos;re not done yet.
              </p>
            </div>
          </RevealGroup>
        </div>
      </section>

      <section
        data-stack
        data-bg="#fafaf9"
        className="relative bg-stone-50 py-28 md:py-40"
      >
        <div className="mx-auto w-full max-w-6xl px-6">
          <RevealGroup
            className="grid gap-16 md:grid-cols-[220px_1fr] md:gap-24"
            stagger={0.07}
          >
            <div data-reveal>
              <p className="editorial-chapter-label text-brand-dark">
                02 — How we built it
              </p>
              <p className="mt-4 font-[family-name:var(--font-display)] text-[32px] leading-none text-brand-light/40">
                02
              </p>
            </div>
            <div className="max-w-2xl">
              <RevealHeading
                as="h2"
                className="font-[family-name:var(--font-display)] text-[clamp(32px,4vw,56px)] font-normal leading-[1.12] tracking-tight text-zinc-950"
              >
                Ground truth first. Clever things, second.
              </RevealHeading>
              <p data-reveal className="mt-6 text-[15px] leading-relaxed text-zinc-600">
                We aggregate data from official UK government registers and
                commercial planning databases, refreshed continuously across
                all 337 local planning authorities. On top of that we layer
                applicant and agent enrichment from property ownership records
                and corporate filings, then bring it back to ground with a
                real A4 letter rendered as a print-ready PDF.
              </p>
              <dl className="mt-10 grid grid-cols-2 gap-x-8 gap-y-8 text-[13px] sm:grid-cols-3">
                {[
                  { k: "Coverage", v: "All 337 UK planning authorities" },
                  { k: "Data refresh", v: "Continuous, automated sync" },
                  { k: "Enrichment", v: "Ownership + corporate records" },
                  { k: "Mapping", v: "Photorealistic 3D visualisation" },
                  { k: "Output", v: "Print-ready branded letters" },
                  { k: "Compliance", v: "UK GDPR compliant" },
                ].map((row) => (
                  <div
                    key={row.k}
                    data-reveal
                    className="editorial-hairline pt-4"
                  >
                    <dt className="editorial-chapter-label text-brand-dark">
                      {row.k}
                    </dt>
                    <dd className="mt-2 text-zinc-900">{row.v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </RevealGroup>
        </div>
      </section>

      <section
        data-stack
        data-bg="#ffffff"
        className="relative bg-white py-28 md:py-40"
      >
        <div className="mx-auto w-full max-w-6xl px-6">
          <RevealGroup
            className="grid gap-16 md:grid-cols-[220px_1fr] md:gap-24"
            stagger={0.08}
          >
            <div data-reveal>
              <p className="editorial-chapter-label text-brand-dark">
                03 — Who it&apos;s for
              </p>
              <p className="mt-4 font-[family-name:var(--font-display)] text-[32px] leading-none text-brand-light/40">
                03
              </p>
            </div>
            <div className="max-w-2xl">
              <RevealHeading
                as="h2"
                className="font-[family-name:var(--font-display)] text-[clamp(32px,4vw,56px)] font-normal leading-[1.12] tracking-tight text-zinc-950"
              >
                The teams that actually run the pipeline.
              </RevealHeading>
              <ul className="mt-10 space-y-10">
                {[
                  {
                    k: "Business development teams",
                    v: "At SME construction firms, roofing contractors, modular housing suppliers and subcontractors — teams whose pipeline depends on being first to a live site.",
                  },
                  {
                    k: "Planning consultants",
                    v: "Independent consultancies and planning firms who need a continuous feed of relevant applications in their patch without re-running ad-hoc searches.",
                  },
                  {
                    k: "Property developers & advisors",
                    v: "Regeneration developers and commercial property advisors using the 3D map to evaluate sites and neighbours before a single meeting.",
                  },
                ].map((row) => (
                  <li
                    key={row.k}
                    data-reveal
                    className="editorial-hairline pt-6"
                  >
                    <h3 className="font-[family-name:var(--font-display)] text-[24px] font-normal text-zinc-950">
                      {row.k}
                    </h3>
                    <p className="mt-3 text-[14px] leading-relaxed text-zinc-600">
                      {row.v}
                    </p>
                  </li>
                ))}
              </ul>

              <div data-reveal className="mt-16 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-5">
                <Link
                  href="/auth/sign-up"
                  className="inline-flex items-center gap-2 rounded-full border border-zinc-900 bg-zinc-900 px-7 py-3.5 text-[13px] font-medium text-white transition hover:border-zinc-700 hover:bg-zinc-700"
                >
                  {startFreeTrialLabel()}
                  <ArrowRight className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                </Link>
                <Link
                  href="/pricing"
                  className="inline-flex items-center gap-2 rounded-full border border-zinc-300 px-7 py-3.5 text-[13px] font-medium text-zinc-900 transition hover:border-zinc-900"
                >
                  See pricing
                </Link>
              </div>
            </div>
          </RevealGroup>
        </div>
      </section>
    </>
  );
}
