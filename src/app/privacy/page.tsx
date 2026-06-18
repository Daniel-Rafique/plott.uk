import type { Metadata } from "next";
import Link from "next/link";
import {
  articleJsonLd,
  breadcrumbJsonLd,
  jsonLdScriptProps,
  publicPageMetadata,
} from "@/lib/seo";

export const metadata: Metadata = publicPageMetadata({
  title: "Privacy Notice",
  description:
    "Plott privacy notice — how we collect, use, and protect your personal data under UK GDPR.",
  path: "/privacy",
});

const LAST_UPDATED = "21 April 2026";

const privacyJsonLd = [
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Privacy Notice", path: "/privacy" },
  ]),
  articleJsonLd({
    headline: "Plott Privacy Notice",
    description:
      "How Plott collects, uses, protects and stores personal data under UK GDPR.",
    path: "/privacy",
    datePublished: "2026-04-21",
  }),
];

export default function PrivacyPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScriptProps(privacyJsonLd)}
      />
      <main className="flex-1 bg-white">
        <div className="mx-auto w-full max-w-4xl px-6 py-24 md:py-32">
          <header className="editorial-hairline max-w-2xl pt-10">
            <p className="editorial-chapter-label text-brand-dark">
              Legal
            </p>
            <h1 className="mt-6 font-[family-name:var(--font-display)] text-[clamp(40px,6vw,72px)] font-normal leading-[1.05] tracking-tight text-zinc-950">
              Privacy Notice
            </h1>
            <p className="mt-4 text-[13px] text-zinc-500">
              Last updated: {LAST_UPDATED}
            </p>
          </header>

          <article className="mt-16 space-y-12 text-[15px] leading-relaxed text-zinc-700">
            <section className="editorial-hairline pt-8">
              <h2 className="font-[family-name:var(--font-display)] text-[28px] font-normal tracking-tight text-zinc-950">
                1. Who we are
              </h2>
              <p className="mt-5">
                Plott (&ldquo;we&rdquo;, &ldquo;us&rdquo;) operates the
                Plott SaaS platform at plott.uk. We are the
                &ldquo;controller&rdquo; for the personal data we process about our
                customers and their colleagues. Customers (typically construction,
                architecture, planning or property firms) are the controller for
                any personal data they upload and for their own outreach
                communications.
              </p>
            </section>

            <section className="editorial-hairline pt-8">
              <h2 className="font-[family-name:var(--font-display)] text-[28px] font-normal tracking-tight text-zinc-950">
                2. What personal data we process
              </h2>
              <ul className="mt-5 space-y-5 text-[14px]">
                <li className="flex items-start gap-3">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand" />
                  <div>
                    <strong className="font-semibold text-zinc-900">Account data:</strong>{" "}
                    <span className="text-zinc-700">
                      name, work email, role, company name, and identifiers required to sign you in securely.
                    </span>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand" />
                  <div>
                    <strong className="font-semibold text-zinc-900">Billing data:</strong>{" "}
                    <span className="text-zinc-700">
                      records needed to manage your subscription, tax and billing status, and billing address. Payment card details are processed only by our payment provider; we do not store your full card number.
                    </span>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand" />
                  <div>
                    <strong className="font-semibold text-zinc-900">Product usage:</strong>{" "}
                    <span className="text-zinc-700">
                      information about how you use the service, content you create, and operational records needed to run the product and keep it safe.
                    </span>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand" />
                  <div>
                    <strong className="font-semibold text-zinc-900">Uploaded assets:</strong>{" "}
                    <span className="text-zinc-700">
                      company logos, signatures, and documents you add to the service.
                    </span>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand" />
                  <div>
                    <strong className="font-semibold text-zinc-900">Third-party data about property and planning:</strong>{" "}
                    <span className="text-zinc-700">
                      information from public registers and our data partners where needed to provide the product.
                    </span>
                  </div>
                </li>
              </ul>
            </section>

            <section className="editorial-hairline pt-8">
              <h2 className="font-[family-name:var(--font-display)] text-[28px] font-normal tracking-tight text-zinc-950">
                3. Lawful bases (UK GDPR Art.6)
              </h2>
              <ul className="mt-5 space-y-5 text-[14px]">
                <li className="flex items-start gap-3">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand" />
                  <div>
                    <strong className="font-semibold text-zinc-900">Contract</strong>{" "}
                    <span className="text-zinc-700">
                      — for operating your account and providing the service you subscribe to.
                    </span>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand" />
                  <div>
                    <strong className="font-semibold text-zinc-900">Legitimate interests</strong>{" "}
                    <span className="text-zinc-700">
                      — for security, anti-abuse, analytics, and product improvement.
                    </span>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand" />
                  <div>
                    <strong className="font-semibold text-zinc-900">Legal obligation</strong>{" "}
                    <span className="text-zinc-700">
                      — for statutory accounting, anti-money-laundering and tax records.
                    </span>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand" />
                  <div>
                    <strong className="font-semibold text-zinc-900">Consent</strong>{" "}
                    <span className="text-zinc-700">
                      — for optional analytics cookies and marketing emails, where applicable.
                    </span>
                  </div>
                </li>
              </ul>
            </section>

            <section className="editorial-hairline pt-8">
              <h2 className="font-[family-name:var(--font-display)] text-[28px] font-normal tracking-tight text-zinc-950">
                4. Sub-processors
              </h2>
              <p className="mt-5">
                We use vetted service providers to host the platform, store data,
                authenticate users, process payments, send email, enrich public
                planning records with business contact context, and perform
                similar functions. See{" "}
                <Link href="/legal/subprocessors" className="font-medium text-brand-dark underline decoration-brand/40 underline-offset-4 transition-colors hover:text-brand">
                  /legal/subprocessors
                </Link>{" "}
                for the current enrichment-provider disclosure and how we provide
                wider sub-processor information. We notify customers of material
                changes in line with our agreements and applicable law.
              </p>
            </section>

            <section className="editorial-hairline pt-8">
              <h2 className="font-[family-name:var(--font-display)] text-[28px] font-normal tracking-tight text-zinc-950">
                5. Data retention
              </h2>
              <ul className="mt-5 space-y-3 text-[14px]">
                <li className="flex items-start gap-3">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand" />
                  <span>
                    Account + product data: retained while your subscription is
                    active, and up to 90 days after cancellation to handle
                    reactivation and statutory obligations.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand" />
                  <span>
                    Data we obtain from third parties to provide the product: kept only as long as needed for the service and our records obligations.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand" />
                  <span>
                    Billing records: retained for 7 years as required by UK tax law.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand" />
                  <span>
                    Operational and security records: retained for a defined period, then deleted or anonymised where we no longer need them.
                  </span>
                </li>
              </ul>
            </section>

            <section className="editorial-hairline pt-8">
              <h2 className="font-[family-name:var(--font-display)] text-[28px] font-normal tracking-tight text-zinc-950">
                6. International transfers
              </h2>
              <p className="mt-5">
                Primary data storage is in the EEA / UK. Where personal data is
                transferred outside the UK, we use transfer mechanisms and
                safeguards recognised under UK GDPR (for example, the UK
                Addendum to the EU standard contractual clauses) where
                required.
              </p>
            </section>

            <section className="editorial-hairline pt-8">
              <h2 className="font-[family-name:var(--font-display)] text-[28px] font-normal tracking-tight text-zinc-950">
                7. Your rights
              </h2>
              <p className="mt-5">
                Under UK GDPR you have the right to access, rectify, erase,
                restrict processing, portability, and to object to processing.
                Email us at{" "}
                <a href="mailto:privacy@plott.uk" className="font-medium text-brand-dark underline decoration-brand/40 underline-offset-4 transition-colors hover:text-brand">
                  privacy@plott.uk
                </a>
                . We respond within 30 days. You can also complain to the UK
                Information Commissioner&apos;s Office at{" "}
                <a href="https://ico.org.uk" className="font-medium text-brand-dark underline decoration-brand/40 underline-offset-4 transition-colors hover:text-brand">
                  ico.org.uk
                </a>
                .
              </p>
            </section>

            <section className="editorial-hairline pt-8">
              <h2 className="font-[family-name:var(--font-display)] text-[28px] font-normal tracking-tight text-zinc-950">
                8. Security
              </h2>
              <p className="mt-5">
                We encrypt data in transit and at rest, apply access controls
                across our systems, and protect accounts and data in line with
                good industry practice. Further detail is available to customers
                under contract.
              </p>
            </section>

            <section className="editorial-hairline pt-8">
              <h2 className="font-[family-name:var(--font-display)] text-[28px] font-normal tracking-tight text-zinc-950">
                9. Contact
              </h2>
              <p className="mt-5">
                Plott Ltd, registered in England &amp; Wales. Privacy
                enquiries:{" "}
                <a href="mailto:privacy@plott.uk" className="font-medium text-brand-dark underline decoration-brand/40 underline-offset-4 transition-colors hover:text-brand">
                  privacy@plott.uk
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
