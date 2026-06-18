import type { Metadata } from "next";
import Link from "next/link";
import {
  articleJsonLd,
  breadcrumbJsonLd,
  jsonLdScriptProps,
  publicPageMetadata,
} from "@/lib/seo";

export const metadata: Metadata = publicPageMetadata({
  title: "Terms of Service",
  description:
    "Plott terms of service — the legal agreement governing your use of the platform.",
  path: "/terms",
});

export const dynamic = "force-dynamic";

const LAST_UPDATED = "21 April 2026";

const termsJsonLd = [
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Terms of Service", path: "/terms" },
  ]),
  articleJsonLd({
    headline: "Plott Terms of Service",
    description:
      "The legal agreement governing customer use of the Plott planning intelligence platform.",
    path: "/terms",
    datePublished: "2026-04-21",
  }),
];

export default function TermsPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScriptProps(termsJsonLd)}
      />
      <main className="flex-1 bg-white">
        <div className="mx-auto w-full max-w-4xl px-6 py-24 md:py-32">
          <header className="editorial-hairline max-w-2xl pt-10">
            <p className="editorial-chapter-label text-brand-dark">
              Legal
            </p>
            <h1 className="mt-6 font-[family-name:var(--font-display)] text-[clamp(40px,6vw,72px)] font-normal leading-[1.05] tracking-tight text-zinc-950">
              Terms of Service
            </h1>
            <p className="mt-4 text-[13px] text-zinc-500">
              Last updated: {LAST_UPDATED}
            </p>
          </header>

          <article className="mt-16 space-y-12 text-[15px] leading-relaxed text-zinc-700">
            <section className="editorial-hairline pt-8">
              <h2 className="font-[family-name:var(--font-display)] text-[28px] font-normal tracking-tight text-zinc-950">
                1. Agreement
              </h2>
              <p className="mt-5">
                These Terms of Service (&ldquo;Terms&rdquo;) form a legally binding
                agreement between Plott Ltd (&ldquo;we&rdquo;,
                &ldquo;us&rdquo;) and the business that subscribes to Planning
                Leads (&ldquo;Customer&rdquo;). Where an individual uses Planning
                Leads on behalf of a Customer, they represent that they are
                authorised to bind the Customer to these Terms. We may update
                these Terms from time to time; material changes will be notified
                at least 30 days in advance.
              </p>
            </section>

            <section className="editorial-hairline pt-8">
              <h2 className="font-[family-name:var(--font-display)] text-[28px] font-normal tracking-tight text-zinc-950">
                2. The service
              </h2>
              <p className="mt-5">
                Plott provides a map-first interface to UK planning
                application data, enriched with applicant and agent details from
                public sources, plus branded outreach letter generation, team
                collaboration, saved searches, email digests and reminders. We may
                modify features over time but will not materially degrade the
                service during a paid term.
              </p>
            </section>

            <section className="editorial-hairline pt-8">
              <h2 className="font-[family-name:var(--font-display)] text-[28px] font-normal tracking-tight text-zinc-950">
                3. Acceptable use for outreach
              </h2>
              <p className="mt-5">
                You may use Plott to contact applicants, agents and
                property owners in relation to their planning applications for
                legitimate business reasons (e.g. offering professional services
                relevant to their development). You must:
              </p>
              <ul className="mt-5 space-y-3 text-[14px]">
                <li className="flex items-start gap-3">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand" />
                  <span>
                    Comply with the UK GDPR, the Data Protection Act 2018 and the
                    Privacy and Electronic Communications Regulations (PECR). In
                    particular, do not send unsolicited electronic marketing to
                    individuals without a lawful basis.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand" />
                  <span>
                    Honour opt-outs and unsubscribe requests promptly (within 28
                    days).
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand" />
                  <span>
                    Clearly identify yourself and your organisation in all outreach
                    and provide a valid contact address.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand" />
                  <span>
                    Use data derived from HM Land Registry only for purposes
                    permitted by the Land Registration Rules 2003 and your
                    PropertyData licence.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand" />
                  <span>
                    Not use Plott for harassment, discriminatory targeting,
                    scams, or any unlawful purpose.
                  </span>
                </li>
              </ul>
              <p className="mt-5 font-medium text-zinc-900">
                Breach of this section is grounds for immediate suspension or
                termination without refund.
              </p>
            </section>

            <section className="editorial-hairline pt-8">
              <h2 className="font-[family-name:var(--font-display)] text-[28px] font-normal tracking-tight text-zinc-950">
                4. Subscription, trial and payment
              </h2>
              <ul className="mt-5 space-y-3 text-[14px]">
                <li className="flex items-start gap-3">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand" />
                  <span>
                    Plans are billed monthly via Stripe. Prices exclude VAT unless
                    stated. A 3-day trial is available on the first
                    subscription per Customer.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand" />
                  <span>
                    You can cancel at any time via the in-app billing portal; access
                    continues until the end of the current billing period.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand" />
                  <span>
                    We may change pricing on 30 days&apos; notice; changes apply at
                    your next renewal.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand" />
                  <span>
                    Failed payments may result in immediate suspension of paid
                    access until payment is successfully collected.
                  </span>
                </li>
              </ul>
            </section>

            <section className="editorial-hairline pt-8">
              <h2 className="font-[family-name:var(--font-display)] text-[28px] font-normal tracking-tight text-zinc-950">
                5. Customer data &amp; tenant isolation
              </h2>
              <p className="mt-5">
                You retain ownership of all data you upload (&ldquo;Customer
                Data&rdquo;). We host each Customer in a logically isolated tenant
                and only access Customer Data to provide the service, to comply
                with law, or with your explicit permission. See our{" "}
                <Link href="/privacy" className="font-medium text-brand-dark underline decoration-brand/40 underline-offset-4 transition-colors hover:text-brand">
                  Privacy Notice
                </Link>{" "}
                and Data Processing Addendum.
              </p>
            </section>

            <section className="editorial-hairline pt-8">
              <h2 className="font-[family-name:var(--font-display)] text-[28px] font-normal tracking-tight text-zinc-950">
                6. Data Processing Addendum (DPA)
              </h2>
              <p className="mt-5">
                Where we process personal data on your behalf as a processor under
                UK GDPR, the{" "}
                <Link href="/legal/dpa" className="font-medium text-brand-dark underline decoration-brand/40 underline-offset-4 transition-colors hover:text-brand">
                  Data Processing Addendum
                </Link>{" "}
                forms part of these Terms. It covers confidentiality, security,
                sub-processors, international transfers, audits, breach
                notification and data return/deletion.
              </p>
            </section>

            <section className="editorial-hairline pt-8">
              <h2 className="font-[family-name:var(--font-display)] text-[28px] font-normal tracking-tight text-zinc-950">
                7. Third-party data
              </h2>
              <p className="mt-5">
                Planning, Land Registry and enrichment data is sourced from third
                parties (PlanWire, HM Land Registry via PropertyData, Companies
                House, Google). We make commercially reasonable efforts to keep
                it accurate but do not warrant completeness. You are responsible
                for verifying critical information before relying on it for legal
                or contractual purposes.
              </p>
            </section>

            <section className="editorial-hairline pt-8">
              <h2 className="font-[family-name:var(--font-display)] text-[28px] font-normal tracking-tight text-zinc-950">
                8. Intellectual property
              </h2>
              <p className="mt-5">
                All IP in the Plott platform is owned by or licensed to
                us. You receive a non-exclusive, non-transferable licence to use
                the platform for your internal business purposes during your
                subscription.
              </p>
            </section>

            <section className="editorial-hairline pt-8">
              <h2 className="font-[family-name:var(--font-display)] text-[28px] font-normal tracking-tight text-zinc-950">
                9. Warranties &amp; liability
              </h2>
              <p className="mt-5">
                The service is provided on an &ldquo;as is&rdquo; basis. To the
                maximum extent permitted by law we disclaim all implied
                warranties. Neither party excludes liability for death, personal
                injury caused by negligence, fraud, or any liability that cannot
                be excluded by English law.
              </p>
              <p className="mt-5">
                Our aggregate liability in any 12-month period is capped at the
                fees you paid for the service in that period. Neither party is
                liable for indirect, consequential or economic loss.
              </p>
            </section>

            <section className="editorial-hairline pt-8">
              <h2 className="font-[family-name:var(--font-display)] text-[28px] font-normal tracking-tight text-zinc-950">
                10. Suspension &amp; termination
              </h2>
              <p className="mt-5">
                Either party may terminate for material breach not remedied within
                30 days. We may suspend immediately for unlawful use, security
                threats, or non-payment. Upon termination, you may export your
                data for 30 days; after that we delete or anonymise Customer Data
                within the retention windows stated in our Privacy Notice.
              </p>
            </section>

            <section className="editorial-hairline pt-8">
              <h2 className="font-[family-name:var(--font-display)] text-[28px] font-normal tracking-tight text-zinc-950">
                11. Governing law
              </h2>
              <p className="mt-5">
                These Terms are governed by the laws of England &amp; Wales, with
                exclusive jurisdiction of the English courts.
              </p>
            </section>

            <section className="editorial-hairline pt-8">
              <h2 className="font-[family-name:var(--font-display)] text-[28px] font-normal tracking-tight text-zinc-950">
                12. Contact
              </h2>
              <p className="mt-5">
                Plott Ltd, registered in England &amp; Wales. Contract
                enquiries:{" "}
                <a href="mailto:legal@plott.uk" className="font-medium text-brand-dark underline decoration-brand/40 underline-offset-4 transition-colors hover:text-brand">
                  legal@plott.uk
                </a>
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
    </>
  );
}
