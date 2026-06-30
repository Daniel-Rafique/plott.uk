import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

type NotFoundPageProps = {
  variant: "marketing" | "app";
};

function MarketingNotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900">
      <SiteHeader />
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <p className="editorial-chapter-label text-brand-dark">404 — Not found</p>
        <h1 className="mt-6 max-w-xl font-[family-name:var(--font-display)] text-[clamp(32px,5vw,56px)] font-normal leading-[1.12] tracking-tight text-zinc-950">
          This page isn&apos;t on the map.
        </h1>
        <p className="mt-5 max-w-md text-[15px] leading-relaxed text-zinc-600">
          The URL may be wrong, or the page may have moved. Head back to Plott
          and start from a known route.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-zinc-900 bg-zinc-900 px-7 py-3.5 text-[13px] font-medium text-white transition hover:border-zinc-700 hover:bg-zinc-700"
          >
            Home
            <ArrowRight className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          </Link>
          <Link
            href="/how-it-works"
            className="inline-flex items-center gap-2 rounded-full border border-zinc-300 px-7 py-3.5 text-[13px] font-medium text-zinc-900 transition hover:border-zinc-900"
          >
            How it works
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function AppNotFound() {
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden p-8">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgb(161 161 170 / 0.25) 1px, transparent 0)",
          backgroundSize: "28px 28px",
        }}
        aria-hidden
      />
      <div className="relative max-w-lg rounded-2xl border border-zinc-200/80 bg-white/95 p-10 text-center shadow-sm backdrop-blur-sm">
        <p className="editorial-chapter-label text-brand-dark">404 — Not found</p>
        <h1 className="mt-5 font-[family-name:var(--font-display)] text-[clamp(28px,4vw,40px)] font-normal leading-tight tracking-tight text-zinc-950">
          This screen isn&apos;t on the map
        </h1>
        <p className="mx-auto mt-4 max-w-sm text-[15px] leading-relaxed text-zinc-600">
          The page may have moved or the link is out of date. Return to your
          dashboard or the Plott home page.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/app/dashboard"
            className="inline-flex items-center gap-2 rounded-full border border-zinc-900 bg-zinc-900 px-6 py-3 text-[13px] font-medium text-white transition hover:border-zinc-700 hover:bg-zinc-700"
          >
            Dashboard
            <ArrowRight className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-zinc-300 px-6 py-3 text-[13px] font-medium text-zinc-900 transition hover:border-zinc-900"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}

export function NotFoundPage({ variant }: NotFoundPageProps) {
  if (variant === "app") {
    return <AppNotFound />;
  }

  return <MarketingNotFound />;
}
