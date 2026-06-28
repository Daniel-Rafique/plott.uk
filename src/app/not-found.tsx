import type { Metadata } from "next";
import { NotFoundPage } from "@/components/not-found-page";
import { noindexRobots } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Page not found",
  robots: noindexRobots,
};

export default function NotFound() {
  return <NotFoundPage variant="marketing" />;
}
