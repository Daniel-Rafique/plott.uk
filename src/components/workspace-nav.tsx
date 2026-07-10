"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { PlanFeatures } from "@/lib/plan-features";

export type WorkspaceLink = {
  href: string;
  label: string;
  requires?: keyof Pick<
    PlanFeatures,
    "canSaveSearches" | "canUseAutoOutreach"
  >;
};

export const workspaceLinks: WorkspaceLink[] = [
  { href: "/app/dashboard", label: "Dashboard" },
  { href: "/app/letters", label: "Letters" },
  { href: "/app/pipeline", label: "Pipeline" },
  {
    href: "/app/outreach",
    label: "Outreach",
    requires: "canUseAutoOutreach",
  },
  {
    href: "/app/searches",
    label: "Saved searches",
    requires: "canSaveSearches",
  },
  { href: "/app/settings/branding", label: "Settings" },
];

export function visibleWorkspaceLinks(features: PlanFeatures): WorkspaceLink[] {
  return workspaceLinks.filter(
    (link) => !link.requires || Boolean(features[link.requires]),
  );
}

export function WorkspaceNav({
  isAdmin = false,
  features,
}: {
  isAdmin?: boolean;
  features: PlanFeatures;
}) {
  const pathname = usePathname();
  const links = isAdmin
    ? [...visibleWorkspaceLinks(features), { href: "/app/admin/agents", label: "Admin" }]
    : visibleWorkspaceLinks(features);
  return (
    <nav
      aria-label="Workspace"
      className="flex items-center gap-4 lg:gap-5 xl:gap-7 2xl:gap-9"
    >
      {links.map((l) => {
        const active =
          pathname === l.href ||
          (l.href !== "/app/dashboard" && pathname.startsWith(l.href));
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.22em] transition-colors",
              active
                ? "text-zinc-950"
                : "text-zinc-500 hover:text-zinc-950",
            )}
          >
            {l.label}
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute -bottom-[18px] left-0 right-0 h-px bg-zinc-950 transition-opacity",
                active ? "opacity-100" : "opacity-0",
              )}
            />
          </Link>
        );
      })}
    </nav>
  );
}
