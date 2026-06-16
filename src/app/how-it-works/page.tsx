import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { HowItWorksContent } from "./how-it-works-content";
import { publicPageMetadata } from "@/lib/seo";

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

export default function HowItWorksPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <main className="flex-1">
        <HowItWorksContent />
      </main>
      <SiteFooter />
    </div>
  );
}
