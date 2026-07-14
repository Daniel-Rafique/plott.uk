"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X, ArrowRight } from "lucide-react";
import { gsap } from "gsap";
import { cn } from "@/lib/utils";
import { startFreeTrialLabel } from "@/lib/trial";
import { useOptionalFunnelModal } from "@/components/auth/funnel-modal";

const NAV_LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/about", label: "About" },
  { href: "/pricing", label: "Pricing" },
  { href: "/privacy", label: "Privacy" },
];

type Props = {
  isSignedIn: boolean;
};

function prefersReduced() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function MobileNav({ isSignedIn }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const funnel = useOptionalFunnelModal();
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closingRef = useRef(false);

  /**
   * Callback ref: fires synchronously the moment Radix mounts the panel
   * into the DOM. Refs inside useEffect are too late — the portal has
   * already painted and the "slide in" window is gone.
   */
  const setPanelRef = useCallback((el: HTMLDivElement | null) => {
    panelRef.current = el;
    if (!el) return;

    const ov = overlayRef.current;
    const items = el.querySelectorAll<HTMLElement>("[data-nav-item]");
    const cta = el.querySelector<HTMLElement>("[data-nav-cta]");

    if (prefersReduced()) {
      if (ov) gsap.set(ov, { opacity: 1 });
      gsap.set(el, { x: "0%", autoAlpha: 1 });
      gsap.set(items, { opacity: 1, y: 0 });
      if (cta) gsap.set(cta, { opacity: 1, y: 0 });
      return;
    }

    gsap.set(el, { x: "100%", autoAlpha: 1 });
    if (ov) gsap.set(ov, { opacity: 0 });
    gsap.set(items, { opacity: 0, y: 20 });
    if (cta) gsap.set(cta, { opacity: 0, y: 14 });

    const tl = gsap.timeline();
    if (ov) {
      tl.to(ov, { opacity: 1, duration: 0.35, ease: "power2.out" }, 0);
    }
    tl.to(el, { x: "0%", duration: 0.5, ease: "power3.out" }, 0);
    tl.to(
      items,
      { opacity: 1, y: 0, duration: 0.4, stagger: 0.055, ease: "power2.out" },
      0.18,
    );
    if (cta) {
      tl.to(
        cta,
        { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" },
        0.32,
      );
    }
  }, []);

  const playClose = useCallback(() => {
    if (closingRef.current) return;
    const ov = overlayRef.current;
    const panel = panelRef.current;
    if (!ov || !panel) {
      setOpen(false);
      return;
    }
    closingRef.current = true;

    if (prefersReduced()) {
      setOpen(false);
      closingRef.current = false;
      return;
    }

    const items = panel.querySelectorAll<HTMLElement>("[data-nav-item]");
    const cta = panel.querySelector<HTMLElement>("[data-nav-cta]");
    gsap.killTweensOf([ov, panel, ...Array.from(items), cta].filter(Boolean));

    const tl = gsap.timeline({
      onComplete: () => {
        setOpen(false);
        closingRef.current = false;
      },
    });

    if (items.length) {
      tl.to(
        items,
        {
          opacity: 0,
          y: -6,
          duration: 0.2,
          stagger: 0.03,
          ease: "power2.in",
        },
        0,
      );
    }
    if (cta) {
      tl.to(
        cta,
        { opacity: 0, y: 6, duration: 0.2, ease: "power2.in" },
        0,
      );
    }
    tl.to(
      panel,
      { x: "100%", duration: 0.42, ease: "power3.in" },
      0.08,
    );
    tl.to(ov, { opacity: 0, duration: 0.32, ease: "power2.in" }, 0.1);
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        setOpen(true);
      } else {
        playClose();
      }
    },
    [playClose],
  );

  useEffect(() => {
    if (open) {
      queueMicrotask(playClose);
    }
    // Close on route change; ignore `open` in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange} modal>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label="Open menu"
          className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-950 md:hidden"
        >
          <Menu className="h-5 w-5" strokeWidth={1.5} />
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay
          ref={overlayRef}
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          style={{ opacity: 0 }}
        />

        <Dialog.Content
          ref={setPanelRef}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="fixed inset-y-0 right-0 z-50 flex w-[85vw] max-w-sm flex-col bg-white shadow-2xl"
          style={{ transform: "translateX(100%)", visibility: "hidden" }}
        >
          <Dialog.Title className="sr-only">Site navigation</Dialog.Title>
          <Dialog.Description className="sr-only">
            Primary marketing links and sign-in options.
          </Dialog.Description>

          <div className="flex min-h-0 flex-1 flex-col">
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-6 py-5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-dark">
                Menu
              </span>
              <button
                type="button"
                aria-label="Close menu"
                className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
                onClick={() => playClose()}
              >
                <X className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </div>

            {/* Navigation links */}
            <nav
              aria-label="Mobile navigation"
              className="min-h-0 flex-1 overflow-y-auto px-6"
            >
              <ul className="space-y-1">
                {NAV_LINKS.map((link) => {
                  const active = pathname === link.href;
                  return (
                    <li key={link.href} data-nav-item>
                      <Link
                        href={link.href}
                        className={cn(
                          "flex items-center justify-between border-b border-zinc-100 py-5 text-[13px] font-semibold uppercase tracking-[0.18em] transition-colors",
                          active
                            ? "text-brand-dark"
                            : "text-zinc-700 hover:text-zinc-950",
                        )}
                      >
                        {link.label}
                        {active && (
                          <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            {/* Auth CTAs */}
            <div
              data-nav-cta
              className="shrink-0 border-t border-zinc-200 px-6 py-6"
            >
              {isSignedIn ? (
                <Link
                  href="/app/dashboard"
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-zinc-900 px-6 py-3.5 text-[12px] font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-zinc-800"
                >
                  Dashboard
                  <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
                </Link>
              ) : (
                <div className="flex flex-col gap-3">
                  {funnel ? (
                    <button
                      type="button"
                      onClick={() => {
                        playClose();
                        funnel.openFunnel({ step: "sign-up" });
                      }}
                      className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-zinc-900 px-6 py-3.5 text-[12px] font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-zinc-800"
                    >
                      {startFreeTrialLabel()}
                      <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
                    </button>
                  ) : (
                    <Link
                      href="/auth/sign-up"
                      className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-zinc-900 px-6 py-3.5 text-[12px] font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-zinc-800"
                    >
                      {startFreeTrialLabel()}
                      <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
                    </Link>
                  )}
                  {funnel ? (
                    <button
                      type="button"
                      onClick={() => {
                        playClose();
                        funnel.openFunnel({ step: "sign-in" });
                      }}
                      className="flex w-full cursor-pointer items-center justify-center rounded-full border border-zinc-300 px-6 py-3.5 text-[12px] font-semibold uppercase tracking-[0.18em] text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-950"
                    >
                      Sign in
                    </button>
                  ) : (
                    <Link
                      href="/auth/sign-in"
                      className="flex w-full cursor-pointer items-center justify-center rounded-full border border-zinc-300 px-6 py-3.5 text-[12px] font-semibold uppercase tracking-[0.18em] text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-950"
                    >
                      Sign in
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
