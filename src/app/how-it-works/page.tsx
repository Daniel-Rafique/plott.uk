import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { HowItWorksContent } from "./how-it-works-content";
import {
  breadcrumbJsonLd,
  howToJsonLd,
  jsonLdScriptProps,
  publicPageMetadata,
} from "@/lib/seo";

export const metadata = publicPageMetadata({
  title: "How it works",
  description:
    "From map to posted letter in three steps. Draw your patch, we resolve the people, you ship branded outreach — with an autonomous agent watching your saved searches around the clock.",
  path: "/how-it-works",
  openGraphTitle: "How Plott works — Map to letter in 30 seconds",
  openGraphDescription:
    "Draw your patch, we resolve the people, you ship branded outreach. Plus autonomous monitoring of your saved searches.",
});

export const dynamic = "force-dynamic";

const howItWorksJsonLd = [
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "How it works", path: "/how-it-works" },
  ]),
  howToJsonLd({
    name: "How to turn planning applications into outreach with Plott",
    description:
      "Use Plott to draw a target patch, enrich planning applicants, and produce branded outreach letters.",
    path: "/how-it-works",
    steps: [
      {
        name: "Draw the patch",
        text: "Open the 3D planning map and draw a polygon around the postcode, borough, county or custom territory you want to monitor.",
      },
      {
        name: "Resolve the people",
        text: "Plott enriches each planning application with applicant, agent and property context from lawful planning and ownership sources.",
      },
      {
        name: "Ship a branded letter",
        text: "Generate an audit-friendly, branded outreach letter or keep a saved search running for new opportunities.",
      },
    ],
  }),
];

export default function HowItWorksPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScriptProps(howItWorksJsonLd)}
      />
      <main className="flex-1">
        <HowItWorksContent />
      </main>
      <SiteFooter />
    </div>
  );
}
