import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AnswerResourcePage } from "@/components/marketing/answer-resource-page";
import {
  articleJsonLd,
  breadcrumbJsonLd,
  faqJsonLd,
  jsonLdScriptProps,
  publicPageMetadata,
} from "@/lib/seo";
import { resourceBySlug, resourcePages } from "@/lib/resources";

type Props = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return resourcePages.map((resource) => ({ slug: resource.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const resource = resourceBySlug(slug);
  if (!resource) return {};

  return publicPageMetadata({
    title: resource.title,
    description: resource.description,
    path: `/resources/${resource.slug}`,
    openGraphTitle: `${resource.title} — Plott`,
    openGraphDescription: resource.directAnswer,
  });
}

export default async function ResourceDetailPage({ params }: Props) {
  const { slug } = await params;
  const resource = resourceBySlug(slug);
  if (!resource) notFound();

  const path = `/resources/${resource.slug}`;
  const jsonLd = [
    breadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "Resources", path: "/resources" },
      { name: resource.title, path },
    ]),
    articleJsonLd({
      headline: resource.title,
      description: resource.description,
      path,
      datePublished: resource.updatedAt,
    }),
    faqJsonLd(resource.faqs),
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScriptProps(jsonLd)}
      />
      <main className="flex-1 bg-white">
        <AnswerResourcePage resource={resource} />
      </main>
    </>
  );
}
