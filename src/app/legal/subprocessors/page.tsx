import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sub-processors",
  description:
    "How Plott uses sub-processors and how customers can obtain sub-processor information.",
  robots: { index: false, follow: true },
};

const LAST_UPDATED = "16 June 2026";

export default function SubprocessorsPage() {
  return (
    <main className="flex-1 bg-white">
        <div className="mx-auto w-full max-w-4xl px-6 py-24 md:py-32">
          <header className="editorial-hairline max-w-2xl pt-10">
            <p className="editorial-chapter-label text-brand-dark">Legal</p>
            <h1 className="mt-6 font-[family-name:var(--font-display)] text-[clamp(40px,6vw,72px)] font-normal leading-[1.05] tracking-tight text-zinc-950">
              Sub-processors
            </h1>
            <p className="mt-4 text-[13px] text-zinc-500">
              Last updated: {LAST_UPDATED}
            </p>
          </header>

          <article className="mt-16 space-y-12 text-[15px] leading-relaxed text-zinc-700">
            <section className="editorial-hairline pt-8">
              <h2 className="font-[family-name:var(--font-display)] text-[28px] font-normal tracking-tight text-zinc-950">
                How we engage sub-processors
              </h2>
              <p className="mt-5">
                Like most cloud services, we use carefully vetted third parties
                to host infrastructure, process payments, deliver email, and
                perform other functions needed to run Plott. 
              </p>
              <p className="mt-5">
                If you are an existing customer, the current sub-processor
                register (or equivalent) is provided under your agreement with
                us, including where a data processing agreement applies. If you
                are evaluating Plott and need sub-processor information for
                diligence, contact us at{" "}
                <a
                  href="mailto:privacy@plott.uk"
                  className="font-medium text-brand-dark underline decoration-brand/40 underline-offset-4 transition-colors hover:text-brand"
                >
                  privacy@plott.uk
                </a>{" "}
                and we will provide what you need in line with a reasonable
                confidentiality or evaluation process.
              </p>
              <p className="mt-5">
                Where a new or replacement sub-processor will process personal
                data on your behalf, we will give you the advance notice required
                by your contract and applicable law (often at least 30 days)
                before they begin, unless a shorter period is required by law or
                we need to make a change urgently for security, compliance, or
                continuity of service.
              </p>
            </section>

            <section className="editorial-hairline pt-8">
              <h2 className="font-[family-name:var(--font-display)] text-[28px] font-normal tracking-tight text-zinc-950">
                Enrichment providers
              </h2>
              <p className="mt-5">
                Plott may use specialist data providers to enrich public planning
                application records with company and contact context for outreach
                workflows. Current enrichment providers include Companies House,
                Hunter.io, Tavily, PlanWire, and PropertyData where enabled for
                a customer workspace.
              </p>
              <p className="mt-5">
                Hunter.io is used for structured business email discovery and
                verification. We use it only server-side for contact enrichment;
                any prospect email outreach in Plott requires workspace opt-in,
                human approval, compliance checks, and suppression-list checks.
              </p>
            </section>

            <section className="editorial-hairline pt-8">
              <h2 className="font-[family-name:var(--font-display)] text-[28px] font-normal tracking-tight text-zinc-950">
                Related
              </h2>
              <p className="mt-5">
                For how we use personal data in general, see our{" "}
                <Link
                  href="/privacy"
                  className="font-medium text-brand-dark underline decoration-brand/40 underline-offset-4 transition-colors hover:text-brand"
                >
                  Privacy notice
                </Link>
                .
              </p>
            </section>
          </article>

          <div className="mt-20 border-t border-zinc-200 pt-8">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-[13px] font-medium text-zinc-600 transition-colors hover:text-brand-dark"
            >
              ← Return home
            </Link>
          </div>
        </div>
      </main>
  );
}
