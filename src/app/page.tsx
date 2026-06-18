import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { HomePageContent } from "@/components/home/home-page-content";
import {
  breadcrumbJsonLd,
  faqJsonLd,
  jsonLdScriptProps,
  publicPageMetadata,
} from "@/lib/seo";

export const metadata = publicPageMetadata({
  title: "Plott — Win every planning application in the UK",
  description:
    "Turn open UK planning applications into signed contracts. 3D maps, applicant enrichment, branded letter generation and saved-search digests for construction firms.",
  path: "/",
  openGraphTitle: "Plott — Win every planning application in the UK",
  openGraphDescription:
    "Turn open UK planning applications into signed contracts with map-first planning intelligence.",
  twitterTitle: "Plott — Win every planning application in the UK",
  twitterDescription:
    "Turn open UK planning applications into signed contracts.",
  titleAbsolute: true,
});

const homeJsonLd = [
  breadcrumbJsonLd([{ name: "Home", path: "/" }]),
  faqJsonLd([
    {
      question: "What is Plott?",
      answer:
        "Plott is a map-first planning intelligence platform that helps UK construction, property and planning teams find live planning applications, enrich applicant details, and create outreach.",
    },
    {
      question: "Who is Plott for?",
      answer:
        "Plott is built for builders, architects, property consultants and planning teams that want to find high-intent local projects before competitors do.",
    },
    {
      question: "Does Plott cover the whole UK?",
      answer:
        "Plott covers all 337 UK local planning authorities and combines planning data with applicant enrichment and saved-search monitoring.",
    },
  ]),
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <SiteHeader />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScriptProps(homeJsonLd)}
      />
      <div className="flex min-w-0 w-full flex-1 flex-col overflow-x-clip">
        <main className="flex-1">
          <HomePageContent
            heroFontClassName="font-[family-name:var(--font-display)]"
          />
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
