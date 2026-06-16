import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { HomePageContent } from "@/components/home/home-page-content";
import { publicPageMetadata } from "@/lib/seo";

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

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <SiteHeader />
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
