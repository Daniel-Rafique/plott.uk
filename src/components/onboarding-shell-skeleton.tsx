import Link from "next/link";
import Image from "next/image";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

/**
 * Instant chrome for /onboarding (and /app gate redirects into it).
 * Real logo so the brand never disappears into a blank white page.
 */
export function OnboardingShellSkeleton({
  message = "Loading workspace setup…",
}: {
  message?: string;
}) {
  return (
    <div
      className="flex min-h-screen flex-col bg-zinc-50"
      aria-busy="true"
    >
      <span className="sr-only">{message}</span>

      <header className="py-6">
        <Link href="/" className="flex justify-center">
          <Image
            src="/logo-7.png"
            alt="Plott"
            width={120}
            height={32}
            className="h-8 w-auto object-contain"
            priority
          />
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 pb-16">
        <div className="w-full rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <div className="mb-8 space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-64 max-w-full" />
            <SkeletonText lines={2} className="mt-2" />
          </div>

          <div className="mb-8 flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-zinc-900" />
            <div className="h-1.5 flex-1 rounded-full bg-zinc-200" />
            <div className="h-1.5 flex-1 rounded-full bg-zinc-200" />
            <div className="h-1.5 flex-1 rounded-full bg-zinc-200" />
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          </div>

          <div className="mt-8 flex items-center justify-end">
            <Skeleton className="h-10 w-28 rounded-full" />
          </div>
        </div>
      </main>

      <footer className="py-6 text-center text-xs text-zinc-400">
        <Link href="/" className="hover:text-zinc-600">
          plott.uk
        </Link>
        {" · "}
        <Link href="/privacy" className="hover:text-zinc-600">
          Privacy
        </Link>
        {" · "}
        <Link href="/terms" className="hover:text-zinc-600">
          Terms
        </Link>
      </footer>
    </div>
  );
}
