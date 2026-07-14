import Link from "next/link";
import type { ResourcePage } from "@/lib/resources";
import { EmailCapture } from "@/components/marketing/email-capture";
import { startFreeTrialLabel } from "@/lib/trial";
import { FunnelCtaButton } from "@/components/auth/funnel-cta-button";

export function AnswerResourcePage({ resource }: { resource: ResourcePage }) {
  return (
    <article className="bg-white">
      <section className="relative overflow-hidden bg-zinc-950 px-6 py-28 text-white md:py-36">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(176,158,126,0.28),transparent_42%)]" />
        <div className="relative mx-auto max-w-5xl">
          <p className="editorial-chapter-label text-brand-light">
            {resource.eyebrow}
          </p>
          <h1 className="mt-6 max-w-4xl font-[family-name:var(--font-display)] text-[clamp(42px,6vw,82px)] font-normal leading-[1.04] tracking-tight">
            {resource.title}
          </h1>
          <p className="mt-6 max-w-2xl text-[15px] leading-relaxed text-zinc-300">
            {resource.description}
          </p>
          <p className="mt-8 text-[11px] uppercase tracking-[0.22em] text-zinc-500">
            Updated {new Date(resource.updatedAt).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}{" "}
            · {resource.readTime}
          </p>
        </div>
      </section>

      <section className="px-6 py-16 md:py-24">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[0.8fr_2fr]">
          <aside className="lg:sticky lg:top-28 lg:self-start">
            <div className="rounded-3xl border border-brand/25 bg-stone-50 p-7">
              <p className="editorial-chapter-label text-brand-dark">
                Direct answer
              </p>
              <p className="mt-5 text-[17px] leading-relaxed text-zinc-900">
                {resource.directAnswer}
              </p>
            </div>
          </aside>

          <div className="space-y-16">
            {resource.sections.map((section) => (
              <section key={section.title} className="editorial-hairline pt-8">
                <h2 className="font-[family-name:var(--font-display)] text-[32px] font-normal tracking-tight text-zinc-950">
                  {section.title}
                </h2>
                <p className="mt-5 text-[15px] leading-relaxed text-zinc-700">
                  {section.body}
                </p>
                {section.bullets ? (
                  <ul className="mt-6 space-y-3 text-[14px] text-zinc-700">
                    {section.bullets.map((bullet) => (
                      <li key={bullet} className="flex gap-3">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}

            <section className="rounded-3xl bg-zinc-950 p-8 text-white md:p-10">
              <p className="editorial-chapter-label text-brand-light">
                Next step
              </p>
              <h2 className="mt-4 font-[family-name:var(--font-display)] text-[32px] font-normal tracking-tight">
                {resource.cta.title}
              </h2>
              <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-zinc-300">
                {resource.cta.body}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <FunnelCtaButton
                  options={{ step: "sign-up" }}
                  className="rounded-full bg-white px-6 py-3 text-[13px] font-semibold text-zinc-950 transition hover:bg-zinc-200"
                >
                  {startFreeTrialLabel()}
                </FunnelCtaButton>
                <Link
                  href="/contact"
                  className="rounded-full border border-white/30 px-6 py-3 text-[13px] font-semibold text-white transition hover:border-white"
                >
                  Ask a question
                </Link>
              </div>
            </section>

            <EmailCapture
              source="resource_inline"
              leadMagnet={resource.cta.title}
              title={resource.cta.title}
              description={resource.cta.body}
              className="bg-stone-50"
            />

            <section className="editorial-hairline pt-8">
              <h2 className="font-[family-name:var(--font-display)] text-[32px] font-normal tracking-tight text-zinc-950">
                Frequently asked questions
              </h2>
              <div className="mt-8 divide-y divide-zinc-200">
                {resource.faqs.map((faq) => (
                  <div key={faq.question} className="py-6">
                    <h3 className="text-[17px] font-semibold text-zinc-950">
                      {faq.question}
                    </h3>
                    <p className="mt-3 text-[14px] leading-relaxed text-zinc-600">
                      {faq.answer}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </section>
    </article>
  );
}
