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
    "From map to approved outreach in three steps. Draw your patch, resolve the people, then review branded letters or compliant email drafts before anything is sent.",
  path: "/how-it-works",
  openGraphTitle: "How Plott works — Map to approved outreach in 30 seconds",
  openGraphDescription:
    "Draw your patch, resolve the people, then approve branded letters or email drafts. Plus autonomous monitoring of your saved searches.",
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
      "Use Plott to draw a target patch, enrich planning applicants, and produce branded letters or human-approved email outreach drafts.",
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
        name: "Review approved outreach",
        text: "Generate an audit-friendly branded letter or email draft, then approve the message before any optional Resend email is sent.",
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
