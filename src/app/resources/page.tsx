import type { Metadata } from "next";
import Link from "next/link";
import {
  breadcrumbJsonLd,
  jsonLdScriptProps,
  publicPageMetadata,
} from "@/lib/seo";
import { resourcePages } from "@/lib/resources";

export const metadata: Metadata = publicPageMetadata({
  title: "Resources",
  description:
    "Answer-led guides for finding UK planning leads, contacting applicants lawfully, and winning more local construction work.",
  path: "/resources",
  openGraphTitle: "Planning Lead Resources — Plott",
  openGraphDescription:
    "Practical guides for turning planning applications into compliant outreach and new work.",
});

const resourcesJsonLd = breadcrumbJsonLd([
  { name: "Home", path: "/" },
  { name: "Resources", path: "/resources" },
]);

export default function ResourcesPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScriptProps(resourcesJsonLd)}
      />
      <main className="flex-1 bg-white">
        <section className="bg-zinc-950 px-6 py-28 text-white md:py-36">
          <div className="mx-auto max-w-6xl">
            <p className="editorial-chapter-label text-brand-light">
              Resources
            </p>
            <h1 className="mt-6 max-w-4xl font-[family-name:var(--font-display)] text-[clamp(44px,6vw,84px)] font-normal leading-[1.04] tracking-tight">
              Practical answers for planning-led growth.
            </h1>
            <p className="mt-6 max-w-2xl text-[15px] leading-relaxed text-zinc-300">
              Short, direct guides for builders, architects and consultants who
              want to turn planning applications into compliant conversations.
            </p>
          </div>
        </section>

        <section className="px-6 py-20 md:py-28">
          <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-3">
            {resourcePages.map((resource) => (
              <Link
                key={resource.slug}
                href={`/resources/${resource.slug}`}
                className="group rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm transition hover:-translate-y-1 hover:border-brand/50 hover:shadow-lg"
              >
                <p className="editorial-chapter-label text-brand-dark">
                  {resource.eyebrow}
                </p>
                <h2 className="mt-5 font-[family-name:var(--font-display)] text-[28px] font-normal leading-tight tracking-tight text-zinc-950">
                  {resource.title}
                </h2>
                <p className="mt-5 text-[14px] leading-relaxed text-zinc-600">
                  {resource.directAnswer}
                </p>
                <p className="mt-8 text-[12px] font-semibold text-zinc-950 underline underline-offset-4">
                  Read guide
                </p>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
