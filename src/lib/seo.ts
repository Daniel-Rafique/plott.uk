import type { Metadata, MetadataRoute } from "next";

export const SITE_URL = "https://plott.uk";
export const SITE_HOST = "plott.uk";
export const SITE_NAME = "Plott";
export const DEFAULT_OG_IMAGE = "/og.png";

type SitemapEntry = MetadataRoute.Sitemap[number];

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
          alt: "Plott planning intelligence platform",
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
