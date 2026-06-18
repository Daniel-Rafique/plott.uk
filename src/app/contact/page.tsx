import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ContactForm } from "@/components/contact/contact-form";
import {
  breadcrumbJsonLd,
  faqJsonLd,
  jsonLdScriptProps,
  publicPageMetadata,
} from "@/lib/seo";

export const metadata: Metadata = publicPageMetadata({
  title: "Contact",
  description:
    "Get in touch with Plott — product questions, partnerships, or anything we can help with.",
  path: "/contact",
  openGraphTitle: "Contact Plott",
  openGraphDescription:
    "Questions about the product, pricing, or working with us? A human will reply within one working day.",
});

export const dynamic = "force-dynamic";

const contactJsonLd = [
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Contact", path: "/contact" },
  ]),
  faqJsonLd([
    {
      question: "How quickly does Plott reply to sales questions?",
      answer:
        "A member of the Plott team normally replies to product, pricing and partnership enquiries within one working day.",
    },
    {
      question: "Can I ask about planning-lead coverage before subscribing?",
      answer:
        "Yes. Tell us your trade, location and target job type and we can help you understand whether Plott is a good fit.",
    },
  ]),
];

export default function ContactPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScriptProps(contactJsonLd)}
      />
      <main className="flex-1">
        <section className="relative bg-white py-24 md:py-32">
          <div className="mx-auto grid w-full max-w-6xl gap-16 px-6 md:grid-cols-[1fr_1.1fr] md:gap-20">
            <div>
              <p className="editorial-chapter-label text-zinc-500">
                Get in touch
              </p>
              <h1 className="mt-4 font-[family-name:var(--font-display)] text-[clamp(36px,4.6vw,64px)] font-normal leading-[1.08] tracking-tight text-zinc-950">
                Tell us about your team.
              </h1>
              <p className="mt-6 max-w-md text-[15px] leading-relaxed text-zinc-600">
                Questions about the product, pricing, or working with us?
                Drop us a note and a human will reply within one working
                day.
              </p>

              <dl className="mt-12 space-y-6 text-[13px]">
                <div className="editorial-hairline pt-4">
                  <dt className="editorial-chapter-label text-zinc-500">
                    Sales &amp; partnerships
                  </dt>
                  <dd className="mt-2 text-zinc-900">
                    hello@plott.uk
                  </dd>
                </div>
                <div className="editorial-hairline pt-4">
                  <dt className="editorial-chapter-label text-zinc-500">
                    Product support
                  </dt>
                  <dd className="mt-2 text-zinc-900">
                    <a
                      href="/support"
                      className="underline underline-offset-4 hover:text-zinc-700"
                    >
                      /support
                    </a>
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-10">
              <ContactForm source="contact" />
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
