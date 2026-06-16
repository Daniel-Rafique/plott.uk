"use client";

/**
 * Conditionally applies height constraints to body based on route.
 * App routes need h-full for fixed viewport layout.
 * Marketing routes need min-h-screen for natural scrolling.
 */

import { usePathname } from "next/navigation";
import { useEffect } from "react";

export function BodyWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAppRoute = pathname?.startsWith("/app");

  useEffect(() => {
    if (typeof document === "undefined") return;

    const body = document.body;
    const html = document.documentElement;

    if (isAppRoute) {
      // App routes: fixed viewport
      body.classList.add("h-full", "min-h-0");
      body.classList.remove("min-h-screen");
      html.classList.add("h-full");
    } else {
      // Marketing routes: natural scroll
      body.classList.remove("h-full", "min-h-0");
      body.classList.add("min-h-screen");
      html.classList.remove("h-full");
    }
  }, [isAppRoute]);

  return <>{children}</>;
}
