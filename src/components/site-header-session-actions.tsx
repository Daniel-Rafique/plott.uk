"use client";

import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import { MobileNav } from "@/components/mobile-nav";
import { authClient } from "@/lib/auth/client";

export function SiteHeaderSessionActions() {
  const { data: session } = authClient.useSession();
  const user = session?.user;

  return (
    <div className="flex items-center gap-3">
      {user ? (
        <>
          <Link
            href="/app/dashboard"
            className="hidden rounded-full bg-zinc-900 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-white shadow-sm transition hover:bg-zinc-800 md:inline-flex"
          >
            Dashboard
          </Link>
          <div className="hidden md:block">
            <SignOutButton />
          </div>
        </>
      ) : (
        <>
          <Link
            href="/auth/sign-in"
            className="hidden text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-700 transition-colors hover:text-zinc-950 md:inline-flex"
          >
            Sign in
          </Link>
          <Link
            href="/auth/sign-up"
            className="inline-flex items-center gap-1.5 rounded-full border border-zinc-900 bg-zinc-900 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-white transition hover:border-zinc-700 hover:bg-zinc-700 max-md:hidden"
          >
            Start free trial
          </Link>
        </>
      )}
      <MobileNav isSignedIn={Boolean(user)} />
    </div>
  );
}
