import type { MetadataRoute } from "next";
import { SITE_HOST, SITE_URL, disallowedCrawlerPaths } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [...disallowedCrawlerPaths],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_HOST,
  };
}
