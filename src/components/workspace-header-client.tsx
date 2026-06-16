"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { BillingButton } from "@/components/billing-button";
import { SignOutButton } from "@/components/sign-out-button";
import {
  WorkspaceNav,
  visibleWorkspaceLinks,
} from "@/components/workspace-nav";
import type { PlanFeatures } from "@/lib/plan-features";
import { cn } from "@/lib/utils";

export function WorkspaceHeaderClient({
  companyName,
  userEmail,
  isAdmin,
  features,
}: {
  companyName: string;
  userEmail: string | null;
  isAdmin: boolean;
  features: PlanFeatures;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const links = isAdmin
    ? [...visibleWorkspaceLinks(features), { href: "/app/admin/agents", label: "Admin" }]
    : visibleWorkspaceLinks(features);

  return (
    <header className="z-20 shrink-0 border-b border-zinc-200 bg-white">
      <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-4 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-8 xl:gap-10">
          <Link
            href="/app/dashboard"
            aria-label="Plott — workspace home"
            className="group flex shrink-0 items-center gap-3"
          >
            <Image
              src="/logo-7.png"
              alt="Plott"
              width={120}
              height={32}
              className="h-8 w-auto object-contain transition-opacity group-hover:opacity-80"
              priority
            />
            <span
              aria-hidden
              className="hidden h-3 w-px bg-zinc-300 2xl:inline-block"
            />
            <span className="hidden max-w-[200px] truncate text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500 2xl:inline">
              {companyName}
            </span>
          </Link>
          <div className="hidden lg:block">
            <WorkspaceNav isAdmin={isAdmin} features={features} />
          </div>
        </div>

        <div className="hidden shrink-0 items-center gap-3 lg:flex">
          <span className="hidden max-w-[220px] truncate text-[11px] font-medium tracking-wide text-zinc-500 2xl:inline">
            {userEmail}
          </span>
          <BillingButton />
          <SignOutButton />
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-800 shadow-sm lg:hidden"
          aria-label={open ? "Close workspace menu" : "Open workspace menu"}
          aria-expanded={open}
        >
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>

      <div
        className={cn(
          "overflow-hidden border-t border-zinc-100 bg-white transition-[max-height,opacity] duration-200 lg:hidden",
          open ? "max-h-[520px] opacity-100" : "max-h-0 opacity-0",
        )}
      >
        <div className="space-y-4 px-4 pb-5 pt-3">
          <div className="rounded-2xl bg-zinc-50 p-3">
            <p className="truncate text-xs font-semibold text-zinc-900">
              {companyName}
            </p>
            <p className="mt-0.5 truncate text-xs text-zinc-500">
              {userEmail ?? "Signed in"}
            </p>
          </div>
          <nav aria-label="Mobile workspace" className="grid gap-1">
            {links.map((link) => {
              const active =
                pathname === link.href ||
                (link.href !== "/app/dashboard" && pathname.startsWith(link.href));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                    active
                      ? "bg-zinc-900 text-white"
                      : "text-zinc-700 hover:bg-zinc-100",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <div className="grid gap-2 border-t border-zinc-100 pt-4">
            <BillingButton />
            <SignOutButton />
          </div>
        </div>
      </div>
    </header>
  );
}
