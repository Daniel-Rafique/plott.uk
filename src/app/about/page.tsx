import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AboutContent } from "./about-content";
import {
  breadcrumbJsonLd,
  faqJsonLd,
  jsonLdScriptProps,
  publicPageMetadata,
} from "@/lib/seo";

export const metadata = publicPageMetadata({
  title: "About",
  description:
    "Plott is a map-first planning-intelligence platform for UK construction, property and planning teams. Built in Britain, covering all 337 local planning authorities.",
  path: "/about",
  openGraphTitle: "About Plott — Map-first planning intelligence",
  openGraphDescription:
    "Built in Britain for UK construction, property and planning teams. Covering all 337 local planning authorities.",
  twitterTitle: "About Plott",
  twitterDescription:
    "Map-first planning intelligence for UK construction firms.",
});

export const dynamic = "force-dynamic";

const aboutJsonLd = [
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "About", path: "/about" },
  ]),
  faqJsonLd([
    {
      question: "Where is Plott built?",
      answer:
        "Plott is built in Britain for UK construction, property and planning teams.",
    },
    {
      question: "How many local planning authorities does Plott cover?",
      answer:
        "Plott covers all 337 UK local planning authorities.",
    },
  ]),
];

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScriptProps(aboutJsonLd)}
      />
      <main className="flex-1">
        <AboutContent />
      </main>
      <SiteFooter />
    </div>
  );
}
