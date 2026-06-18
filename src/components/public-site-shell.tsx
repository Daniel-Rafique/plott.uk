"use client";

import { usePathname } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { TidioWidget } from "@/components/tidio-widget";

const PUBLIC_SHELL_EXACT_PATHS = new Set([
  "/",
  "/about",
  "/contact",
  "/how-it-works",
  "/pricing",
  "/privacy",
  "/resources",
  "/support",
  "/terms",
]);

const PUBLIC_SHELL_PREFIXES = ["/legal", "/resources"];

function usesPublicShell(pathname: string | null): boolean {
  if (!pathname) return false;
  if (PUBLIC_SHELL_EXACT_PATHS.has(pathname)) return true;
  return PUBLIC_SHELL_PREFIXES.some((prefix) =>
    pathname.startsWith(`${prefix}/`),
  );
}

export function PublicSiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (!usesPublicShell(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900">
      <SiteHeader />
      <div className="flex min-w-0 w-full flex-1 flex-col overflow-x-clip">
        {children}
        <SiteFooter />
      </div>
      <TidioWidget />
    </div>
  );
}
