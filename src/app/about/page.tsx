import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AboutContent } from "./about-content";
import { publicPageMetadata } from "@/lib/seo";

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

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <main className="flex-1">
        <AboutContent />
      </main>
      <SiteFooter />
    </div>
  );
}
