import Link from "next/link";
import Image from "next/image";

/**
 * Minimal full-page placeholder while /app layout resolves stage / redirects.
 * Keeps the Plott logo on screen so soft navigations never flash blank white.
 */
export function BrandedRouteLoading({
  message = "Loading…",
}: {
  message?: string;
}) {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-zinc-50"
      aria-busy="true"
    >
      <span className="sr-only">{message}</span>
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
      <div
        className="mt-8 h-1 w-24 animate-pulse rounded-full bg-zinc-200"
        aria-hidden
      />
    </div>
  );
}
