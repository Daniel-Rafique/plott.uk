"use client";

import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import { MobileNav } from "@/components/mobile-nav";
import { authClient } from "@/lib/auth/client";
import { startFreeTrialLabel } from "@/lib/trial";
import { useOptionalFunnelModal } from "@/components/auth/funnel-modal";
import { WorkspaceEntryCta } from "@/components/auth/workspace-entry-cta";

function SessionActionsSkeleton() {
  return (
    <div
      className="flex items-center gap-3"
      aria-hidden
      aria-busy="true"
    >
      <div className="hidden h-9 w-16 animate-pulse rounded-full bg-zinc-200 md:block" />
      <div className="hidden h-9 w-28 animate-pulse rounded-full bg-zinc-200 md:block" />
      <div className="h-9 w-9 animate-pulse rounded-md bg-zinc-200 md:hidden" />
    </div>
  );
}

export function SiteHeaderSessionActions() {
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user;
  const funnel = useOptionalFunnelModal();

  if (isPending) {
    return <SessionActionsSkeleton />;
  }

  return (
    <div className="flex items-center gap-3">
      {user ? (
        <>
          <WorkspaceEntryCta className="hidden rounded-full bg-zinc-900 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-white shadow-sm transition hover:bg-zinc-800 md:inline-flex">
            Dashboard
          </WorkspaceEntryCta>
          <div className="hidden md:block">
            <SignOutButton />
          </div>
        </>
      ) : (
        <>
          {funnel ? (
            <button
              type="button"
              onClick={() => funnel.openFunnel({ step: "sign-in" })}
              className="hidden cursor-pointer text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-700 transition-colors hover:text-zinc-950 md:inline-flex"
            >
              Sign in
            </button>
          ) : (
            <Link
              href="/auth/sign-in"
              className="hidden cursor-pointer text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-700 transition-colors hover:text-zinc-950 md:inline-flex"
            >
              Sign in
            </Link>
          )}
          {funnel ? (
            <button
              type="button"
              onClick={() => funnel.openFunnel({ step: "sign-up" })}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-zinc-900 bg-zinc-900 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-white transition hover:border-zinc-700 hover:bg-zinc-700 max-md:hidden"
            >
              {startFreeTrialLabel()}
            </button>
          ) : (
            <Link
              href="/auth/sign-up"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-zinc-900 bg-zinc-900 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-white transition hover:border-zinc-700 hover:bg-zinc-700 max-md:hidden"
            >
              {startFreeTrialLabel()}
            </Link>
          )}
        </>
      )}
      <MobileNav isSignedIn={Boolean(user)} />
    </div>
  );
}
