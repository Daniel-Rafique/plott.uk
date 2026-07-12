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
    "From map to approved outreach and a live sales pipeline. Draw your patch, resolve the people, review branded letters or email drafts, then track and assign every lead.",
  path: "/how-it-works",
  openGraphTitle: "How Plott works — Map to outreach, then Pipeline",
  openGraphDescription:
    "Draw your patch, enrich applicants, approve branded letters or email drafts with optional ballparks, track leads in Pipeline, and let saved searches run themselves.",
});

const howItWorksJsonLd = [
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "How it works", path: "/how-it-works" },
  ]),
  howToJsonLd({
    name: "How to turn planning applications into outreach with Plott",
    description:
      "Use Plott to draw a target patch, enrich planning applicants, produce branded letters or human-approved email outreach drafts, and track every lead in Pipeline.",
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
        text: "Generate an audit-friendly branded letter or email draft with an optional ballpark estimate, then approve the message before any optional Resend email is sent.",
      },
      {
        name: "Track the pipeline",
        text: "Follow each lead from first contact to won or lost, with applicant details, work type, teammate assignment, and shared notes.",
      },
    ],
  }),
];

export default function HowItWorksPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScriptProps(howItWorksJsonLd)}
      />
      <main className="flex-1 bg-white">
        <HowItWorksContent />
      </main>
    </>
  );
}
