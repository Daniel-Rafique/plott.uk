import Link from "next/link";
import Image from "next/image";
import { SiteHeaderSessionActions } from "@/components/site-header-session-actions";
import { SiteHeaderShell } from "./site-header-shell";

/**
 * Editorial marketing header — treated like a magazine masthead.
 *
 * Wordmark: Playfair Display serif, optically weighted to read as a
 * nameplate rather than a logo.
 * Nav: sans in editorial-chapter-label style (tracked 0.22em, uppercase,
 * small caps) so it reads as section labels — consistent with the
 * "01 — By the numbers" eyebrow treatment used throughout the site.
 *
 * The sticky glass behaviour and scroll-compress live in the client shell;
 * session-dependent actions resolve on the client via useSession() so the
 * Neon Auth server helper never mutates cookies during RSC render.
 */
export function SiteHeader() {
  return (
    <SiteHeaderShell>
      <Link
        href="/"
        aria-label="Plott home"
        className="flex shrink-0 items-center"
      >
        <Image
          src="/logo-7.png"
          alt="Plott"
          width={240}
          height={64}
          className="h-8 w-auto object-contain"
          priority
        />
      </Link>

      <nav
        aria-label="Primary"
        className="hidden items-center gap-10 text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-600 md:flex"
      >
        <Link
          href="/how-it-works"
          className="transition-colors hover:text-zinc-950"
        >
          How it works
        </Link>
        <Link
          href="/about"
          className="transition-colors hover:text-zinc-950"
        >
          About
        </Link>
        <Link
          href="/pricing"
          className="transition-colors hover:text-zinc-950"
        >
          Pricing
        </Link>
        <Link
          href="/privacy"
          className="transition-colors hover:text-zinc-950"
        >
          Privacy
        </Link>
      </nav>

      <SiteHeaderSessionActions />
    </SiteHeaderShell>
  );
}
