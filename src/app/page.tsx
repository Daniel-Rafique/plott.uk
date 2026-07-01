import { HomePageContent } from "@/components/home/home-page-content";
import {
  faqUkCoverage,
  faqWhatIsPlott,
  faqWhoIsPlottFor,
  PRODUCT_DESCRIPTION_SHORT,
  PRODUCT_META_DESCRIPTION,
  SEO_TITLE,
} from "@/lib/marketing/copy";
import {
  breadcrumbJsonLd,
  faqJsonLd,
  jsonLdScriptProps,
  publicPageMetadata,
} from "@/lib/seo";

export const metadata = publicPageMetadata({
  title: SEO_TITLE,
  description: PRODUCT_META_DESCRIPTION,
  path: "/",
  openGraphTitle: SEO_TITLE,
  openGraphDescription: PRODUCT_DESCRIPTION_SHORT,
  twitterTitle: SEO_TITLE,
  twitterDescription: PRODUCT_DESCRIPTION_SHORT,
  titleAbsolute: true,
});

const homeJsonLd = [
  breadcrumbJsonLd([{ name: "Home", path: "/" }]),
  faqJsonLd([
    {
      question: "What is Plott?",
      answer: faqWhatIsPlott(),
    },
    {
      question: "Who is Plott for?",
      answer: faqWhoIsPlottFor(),
    },
    {
      question: "Does Plott cover the whole UK?",
      answer: faqUkCoverage(),
    },
  ]),
];

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScriptProps(homeJsonLd)}
      />
      <main className="flex-1">
        <HomePageContent
          heroFontClassName="font-[family-name:var(--font-display)]"
        />
      </main>
    </>
  );
}
