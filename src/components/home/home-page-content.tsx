"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { ArrowRight, Compass, Ruler, ShieldCheck } from "lucide-react";
import { ByTheNumbers } from "./by-the-numbers";
import { HowItWorks } from "./how-it-works";
import { FeaturesGrid } from "./features-grid";
import { Testimonials } from "./testimonials";
import { ProjectsGallery } from "./projects-gallery";
import { useTextReveal } from "@/lib/animation/use-text-reveal";
import { useGsapReveal } from "@/lib/animation/use-gsap-reveal";
import { StackingSections } from "@/lib/animation/stacking-sections";
import { authClient } from "@/lib/auth/client";
import { EmailCapture } from "@/components/marketing/email-capture";

const Map3DHero = dynamic(
  () => import("./map3d-hero").then((m) => m.Map3DHero),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-zinc-900 via-zinc-950 to-black" />
    ),
  },
);

type Props = {
  heroFontClassName: string;
};

export function HomePageContent({ heroFontClassName }: Props) {
  const { data: session } = authClient.useSession();
  const isSignedIn = Boolean(session?.user);

  const ctaHeadingRef = useTextReveal<HTMLHeadingElement>();
  const ctaRef = useGsapReveal<HTMLDivElement>({ stagger: 0.08 });

  return (
    <StackingSections>
      {/* HERO — ambient Mapbox scene for a smooth marketing-page card. */}
      <section
        data-stack
        data-bg="#0a0a0a"
        className="relative flex min-h-[100svh] items-center justify-center overflow-hidden bg-black"
      >
        <Map3DHero />

        <div className="relative z-10 mx-auto w-full max-w-7xl px-6 py-24 md:py-32">
          <motion.div
            className="max-w-3xl space-y-7"
            initial="hidden"
            animate="visible"
            variants={{
              hidden: {},
              visible: {
                transition: { staggerChildren: 0.09, delayChildren: 0.1 },
              },
            }}
          >
            <motion.div
              variants={{
                hidden: { opacity: 0, y: 14 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
              }}
              className="inline-flex items-center gap-2 rounded-full border border-brand-light/30 bg-brand/20 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-brand-light backdrop-blur-md"
            >
              <Compass className="h-3.5 w-3.5" aria-hidden />
              Live planning intelligence for the UK
            </motion.div>
            <motion.h1
              variants={{
                hidden: { opacity: 0, y: 24 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
              }}
              className={`${heroFontClassName} text-balance text-5xl font-normal leading-[1.05] text-white md:text-6xl lg:text-7xl`}
            >
              See every site
              <span className="block bg-gradient-to-r from-brand-light via-white to-brand-light/70 bg-clip-text text-transparent">
                before your competitors do.
              </span>
            </motion.h1>
            <motion.p
              variants={{
                hidden: { opacity: 0, y: 16 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.55 } },
              }}
              className="max-w-2xl text-lg leading-relaxed text-zinc-200 md:text-xl"
            >
              Map-first planning-application search with photorealistic 3D,
              applicant enrichment and branded outreach — all in one workspace
              built for construction, property and planning professionals.
            </motion.p>
            <motion.div
              variants={{
                hidden: { opacity: 0, y: 14 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
              }}
              className="flex flex-wrap items-center gap-4 pt-4"
            >
              {!isSignedIn ? (
                <>
                  <Link
                    href="/auth/sign-up"
                    className="group inline-flex items-center gap-2 rounded-full bg-white/90 px-8 py-3.5 text-sm font-semibold text-zinc-900 shadow-lg shadow-brand/20  transition-all duration-300 ease-out hover:-translate-y-0.5 hover:bg-white/20 hover:text-white hover:shadow-xl"
                  >
                    Start 3-day trial
                    <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                  <Link
                    href="/pricing"
                    className="inline-flex rounded-full border border-white/30 bg-white/10 px-8 py-3.5 text-sm font-semibold text-white backdrop-blur-md transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-white/50 hover:bg-white/20 hover:shadow-lg hover:shadow-white/10"
                  >
                    View pricing
                  </Link>
                </>
              ) : (
                <Link
                  href="/app/dashboard"
                  className="group inline-flex items-center gap-2 rounded-full bg-white/90 px-8 py-3.5 text-sm font-semibold text-zinc-900 shadow-lg shadow-brand/20 backdrop-blur-sm transition-all duration-300 ease-out hover:-translate-y-0.5 hover:bg-white/20 hover:text-white hover:shadow-xl"
                >
                  Open dashboard
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
                </Link>
              )}
            </motion.div>
            <motion.div
              variants={{
                hidden: { opacity: 0, y: 8 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
              }}
              className="flex flex-wrap items-center gap-6 pt-6 text-xs text-zinc-300"
            >
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-brand-light" />
                FREE 3-day trial
              </span>
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5 text-brand-light" aria-hidden />
                UK GDPR compliant
              </span>
              <span className="inline-flex items-center gap-2">
                <Ruler className="h-3.5 w-3.5 text-brand-light" aria-hidden />
                337 LPAs covered
              </span>
            </motion.div>
          </motion.div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-32 bg-gradient-to-b from-transparent to-black" />
      </section>

      <ByTheNumbers />

      <HowItWorks />

      <FeaturesGrid />

      <Testimonials />

      <ProjectsGallery />

      {/* 06 — CTA. Editorial block, no gradient. */}
      <section
        data-stack
        data-bg="#fafaf9"
        className="relative flex min-h-[100svh] items-center bg-stone-50 py-28 md:py-36"
      >
        <div ref={ctaRef} className="mx-auto w-full max-w-5xl px-6 text-center">
          <span
            data-reveal
            aria-hidden
            className="inline-block font-[family-name:var(--font-display)] text-4xl text-brand"
          >
            &amp;
          </span>
          <h2
            ref={ctaHeadingRef}
            className="mt-6 font-[family-name:var(--font-display)] text-[clamp(36px,5.5vw,80px)] font-normal leading-[1.08] tracking-tight text-zinc-950"
          >
            Ready to win the next site?
          </h2>
          <p
            data-reveal
            className="mx-auto mt-6 max-w-xl text-[15px] leading-relaxed text-zinc-600"
          >
            Spin up a workspace, invite your team, and start outreach in under
            ten minutes. No credit card for the first fourteen days.
          </p>
          <div
            data-reveal
            className="mt-12 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4"
          >
            <Link
              href={isSignedIn ? "/app/dashboard" : "/auth/sign-up"}
              className="inline-flex items-center gap-2 rounded-full border border-zinc-900 bg-zinc-900 px-7 py-3.5 text-[13px] font-medium text-white transition hover:border-zinc-700 hover:bg-zinc-700"
            >
              {isSignedIn ? "Open dashboard" : "Start free trial"}
              <ArrowRight className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-transparent px-7 py-3.5 text-[13px] font-medium text-zinc-900 transition hover:border-zinc-900"
            >
              Compare plans
            </Link>
          </div>
          <div data-reveal className="mx-auto mt-12 max-w-2xl text-left">
            <EmailCapture
              source="home_inline"
              leadMagnet="UK Planning Lead Checklist"
              title="Get the UK Planning Lead Checklist"
              description="Qualify applications, enrich applicant context and start privacy-aware outreach with a short checklist built for UK planning leads."
            />
          </div>
        </div>
      </section>
    </StackingSections>
  );
}
