import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ContactForm } from "@/components/contact/contact-form";
import { publicPageMetadata } from "@/lib/seo";

export const metadata = publicPageMetadata({
  title: "Support",
  description:
    "Product support for Plott — send us a message and we'll help you get unblocked.",
  path: "/support",
});

export const dynamic = "force-dynamic";

export default function SupportPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <main className="flex-1">
        <section className="relative bg-white py-24 md:py-32">
          <div className="mx-auto grid w-full max-w-6xl gap-16 px-6 md:grid-cols-[1fr_1.1fr] md:gap-20">
            <div>
              <p className="editorial-chapter-label text-zinc-500">
                Support
              </p>
              <h1 className="mt-4 font-[family-name:var(--font-display)] text-[clamp(36px,4.6vw,64px)] font-normal leading-[1.08] tracking-tight text-zinc-950">
                We&rsquo;re here to help.
              </h1>
              <p className="mt-6 max-w-md text-[15px] leading-relaxed text-zinc-600">
                Stuck on something, spotted a bug, or need a hand with a
                letter? Send the details and we&rsquo;ll get back to you
                within one working day.
              </p>

              <dl className="mt-12 space-y-6 text-[13px]">
                <div className="editorial-hairline pt-4">
                  <dt className="editorial-chapter-label text-zinc-500">
                    Include if possible
                  </dt>
                  <dd className="mt-2 text-zinc-700">
                    Planning application reference, letter ID, screenshots,
                    and the browser you&rsquo;re using.
                  </dd>
                </div>
                <div className="editorial-hairline pt-4">
                  <dt className="editorial-chapter-label text-zinc-500">
                    Response
                  </dt>
                  <dd className="mt-2 text-zinc-900">
                    support@plott.uk — replies within one working
                    day.
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-10">
              <ContactForm source="support" />
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
