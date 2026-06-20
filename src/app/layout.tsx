import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Suspense } from "react";
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { MarketingShell } from "@/lib/animation/marketing-shell";
import { MarketingCapturePopup } from "@/components/marketing/email-capture";
import { PublicSiteShell } from "@/components/public-site-shell";
import { RouteProgress } from "@/components/route-progress";
import {
  DEFAULT_OG_IMAGE,
  SITE_NAME,
  SITE_URL,
  canonicalAlternates,
  indexRobots,
  jsonLdScriptProps,
  webSiteJsonLd,
} from "@/lib/seo";
import "mapbox-gl/dist/mapbox-gl.css";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

const GOOGLE_TAG_ID = "AW-18256689006";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Plott — Win every planning application in the UK",
    template: "%s · Plott",
  },
  description:
    "Turn open UK planning applications into signed contracts. 3D maps, applicant enrichment, branded letter generation and saved-search digests for construction firms.",
  keywords: [
    "UK planning applications",
    "Plott",
    "construction leads",
    "planning application search",
    "property ownership lookup",
    "saved planning searches",
    "applicant enrichment",
  ],
  authors: [{ name: "Plott" }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  alternates: canonicalAlternates("/"),
  openGraph: {
    type: "website",
    siteName: "Plott",
    title: "Plott — Win every planning application in the UK",
    description:
      "Turn open UK planning applications into signed contracts. 3D maps, applicant enrichment, branded letter generation and saved-search digests.",
    url: SITE_URL,
    locale: "en_GB",
    images: [
      {
        url: DEFAULT_OG_IMAGE,
        width: 1200,
        height: 630,
        alt: "Plott — 3D map of UK planning applications",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Plott — Win every planning application in the UK",
    description:
      "Turn open UK planning applications into signed contracts.",
    images: [DEFAULT_OG_IMAGE],
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: { url: "/apple-touch-icon.png", sizes: "180x180" },
  },
  manifest: "/site.webmanifest",
  robots: indexRobots,
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Plott",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "Turn open UK planning applications into signed contracts. 3D maps, applicant enrichment, branded letter generation and saved-search digests for construction firms.",
  url: SITE_URL,
  author: {
    "@type": "Organization",
    name: "Plott",
    url: SITE_URL,
  },
  areaServed: {
    "@type": "Country",
    name: "United Kingdom",
  },
  offers: {
    "@type": "AggregateOffer",
    priceCurrency: "GBP",
    lowPrice: "99",
    highPrice: "299",
    offerCount: "3",
  },
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Plott",
  url: SITE_URL,
  logo: `${SITE_URL}/logo-7.png`,
  contactPoint: {
    "@type": "ContactPoint",
    email: "hello@plott.uk",
    contactType: "customer service",
    areaServed: "GB",
    availableLanguage: "English",
  },
  sameAs: [],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en-GB"
      className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} antialiased`}
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={jsonLdScriptProps(jsonLd)}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={jsonLdScriptProps(organizationJsonLd)}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={jsonLdScriptProps(webSiteJsonLd())}
        />
      </head>
      <body className="flex flex-col bg-zinc-50 text-zinc-900">
        <Suspense fallback={null}>
          <RouteProgress />
        </Suspense>
        <MarketingShell>
          <PublicSiteShell>{children}</PublicSiteShell>
        </MarketingShell>
        <MarketingCapturePopup />
        <Analytics />
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_TAG_ID}`}
          strategy="afterInteractive"
        />
        <Script id="google-tag" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){window.dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GOOGLE_TAG_ID}');
          `}
        </Script>
      </body>
    </html>
  );
}
