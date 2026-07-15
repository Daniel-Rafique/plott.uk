import type { Metadata, MetadataRoute } from "next";

export const SITE_URL = "https://plott.uk";
export const SITE_HOST = "plott.uk";
export const SITE_NAME = "Plott";
export const DEFAULT_OG_IMAGE = "/og.png";

type SitemapEntry = MetadataRoute.Sitemap[number];
type JsonLdPrimitive = string | number | boolean | null;
export type JsonLd = JsonLdPrimitive | JsonLd[] | { [key: string]: JsonLd };

type FaqItem = {
  question: string;
  answer: string;
};

type HowToStep = {
  name: string;
  text: string;
  url?: string;
};

type BreadcrumbItem = {
  name: string;
  path: string;
};

type ArticleArgs = {
  headline: string;
  description: string;
  path: string;
  datePublished: string;
  dateModified?: string;
  image?: string;
};

type ProductOffer = {
  price: string;
  priceCurrency?: string;
  availability?: string;
};

type ProductArgs = {
  name: string;
  description: string;
  path: string;
  offers?: ProductOffer | ProductOffer[];
};

export const publicSitemapRoutes = [
  {
    path: "/",
    changeFrequency: "weekly",
    priority: 1,
  },
  {
    path: "/about",
    changeFrequency: "monthly",
    priority: 0.8,
  },
  {
    path: "/pricing",
    changeFrequency: "weekly",
    priority: 0.9,
  },
  {
    path: "/how-it-works",
    changeFrequency: "monthly",
    priority: 0.85,
  },
  {
    path: "/resources",
    changeFrequency: "weekly",
    priority: 0.8,
  },
  {
    path: "/resources/find-uk-planning-application-leads",
    changeFrequency: "monthly",
    priority: 0.75,
  },
  {
    path: "/resources/contact-planning-applicants-legally",
    changeFrequency: "monthly",
    priority: 0.75,
  },
  {
    path: "/resources/win-extension-work",
    changeFrequency: "monthly",
    priority: 0.75,
  },
  {
    path: "/contact",
    changeFrequency: "monthly",
    priority: 0.6,
  },
  {
    path: "/support",
    changeFrequency: "monthly",
    priority: 0.5,
  },
  {
    path: "/privacy",
    changeFrequency: "yearly",
    priority: 0.3,
  },
  {
    path: "/terms",
    changeFrequency: "yearly",
    priority: 0.3,
  },
] satisfies Array<
  Pick<SitemapEntry, "changeFrequency" | "priority"> & { path: string }
>;

export const disallowedCrawlerPaths = [
  "/app/",
  "/api/",
  "/auth/",
  "/invites/",
  "/monitoring",
  "/onboarding/",
  "/continue",
  "/subscribe",
] as const;

export const indexRobots = {
  index: true,
  follow: true,
} satisfies Metadata["robots"];

export const noindexRobots = {
  index: false,
  follow: false,
  googleBot: {
    index: false,
    follow: false,
  },
} satisfies Metadata["robots"];

export function absoluteUrl(path = "/") {
  if (path === "/") return SITE_URL;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export function canonicalAlternates(path = "/"): Metadata["alternates"] {
  return {
    canonical: absoluteUrl(path),
  };
}

export function publicPageMetadata({
  title,
  description,
  path,
  openGraphTitle,
  openGraphDescription,
  twitterTitle,
  twitterDescription,
  titleAbsolute = false,
}: {
  title: string;
  description: string;
  path: string;
  openGraphTitle?: string;
  openGraphDescription?: string;
  twitterTitle?: string;
  twitterDescription?: string;
  titleAbsolute?: boolean;
}): Metadata {
  return {
    title: titleAbsolute ? { absolute: title } : title,
    description,
    alternates: canonicalAlternates(path),
    robots: indexRobots,
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: openGraphTitle ?? title,
      description: openGraphDescription ?? description,
      url: absoluteUrl(path),
      locale: "en_GB",
      images: [
        {
          url: DEFAULT_OG_IMAGE,
          width: 1200,
          height: 630,
          alt: "Plott — See every site before your competitors do",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: twitterTitle ?? openGraphTitle ?? title,
      description: twitterDescription ?? openGraphDescription ?? description,
      images: [DEFAULT_OG_IMAGE],
    },
  };
}

export function jsonLdScriptProps(schema: JsonLd | JsonLd[]) {
  return {
    __html: JSON.stringify(schema).replace(/</g, "\\u003c"),
  };
}

export function faqJsonLd(items: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

export function howToJsonLd(args: {
  name: string;
  description: string;
  path: string;
  steps: HowToStep[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: args.name,
    description: args.description,
    url: absoluteUrl(args.path),
    step: args.steps.map((step, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: step.name,
      text: step.text,
      ...(step.url ? { url: absoluteUrl(step.url) } : {}),
    })),
  };
}

export function breadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function articleJsonLd(args: ArticleArgs) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: args.headline,
    description: args.description,
    url: absoluteUrl(args.path),
    datePublished: args.datePublished,
    dateModified: args.dateModified ?? args.datePublished,
    image: absoluteUrl(args.image ?? DEFAULT_OG_IMAGE),
    author: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/logo-7.png`,
      },
    },
  };
}

export function productJsonLd(args: ProductArgs) {
  const offers = Array.isArray(args.offers) ? args.offers : args.offers ? [args.offers] : [];

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: args.name,
    description: args.description,
    url: absoluteUrl(args.path),
    brand: {
      "@type": "Brand",
      name: SITE_NAME,
    },
    ...(offers.length
      ? {
          offers: offers.map((offer) => ({
            "@type": "Offer",
            price: offer.price,
            priceCurrency: offer.priceCurrency ?? "GBP",
            availability:
              offer.availability ?? "https://schema.org/InStock",
            url: absoluteUrl(args.path),
          })),
        }
      : {}),
  };
}

export function webSiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/app/dashboard?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

export function privatePageMetadata({
  title,
  description,
}: {
  title: string;
  description?: string;
}): Metadata {
  return {
    title,
    description,
    robots: noindexRobots,
  };
}
