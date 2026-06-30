"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, type ReactNode } from "react";
import { AuthBenefitsPanel } from "@/components/auth/auth-benefits-panel";
import { AuthTrustStrip } from "@/components/auth/auth-trust-strip";
import {
  animateAuthBenefitsEnter,
  animateAuthPanelEnter,
  consumeAuthTransitionDirection,
} from "@/components/auth/auth-transition";

export type AuthMarketingShellProps = {
  variant?: "signup" | "signin" | "verify";
  eyebrow?: string;
  title: string;
  subtitle: string;
  banner?: ReactNode;
  stepIndicator?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  signUpHref?: string;
};

export function AuthMarketingShellClient({
  variant = "signup",
  eyebrow,
  title,
  subtitle,
  banner,
  stepIndicator,
  children,
  footer,
  signUpHref = "/auth/sign-up",
}: AuthMarketingShellProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const benefitsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const direction = consumeAuthTransitionDirection();
    const cleanup = animateAuthPanelEnter(panel, direction);
    return () => {
      cleanup?.();
    };
  }, [variant, title]);

  useEffect(() => {
    const benefits = benefitsRef.current;
    if (!benefits) return;
    return animateAuthBenefitsEnter(benefits);
  }, [variant]);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="sticky top-0 z-40 border-b border-zinc-200/40 bg-white/60 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-6 px-6 py-4">
          <Link href="/" className="flex shrink-0 items-center">
            <Image
              src="/logo-7.png"
              alt="Plott"
              width={100}
              height={28}
              className="h-8 w-auto object-contain"
              priority
            />
          </Link>
          <Link
            href="/pricing"
            className="text-[13px] font-medium text-zinc-600 transition hover:text-zinc-900"
          >
            Pricing
          </Link>
        </div>
      </header>

      <div className="flex flex-1 flex-col lg:grid lg:grid-cols-2">
        <div ref={benefitsRef} className="hidden lg:block" key={variant}>
          <AuthBenefitsPanel variant={variant} signUpHref={signUpHref} />
        </div>

        <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 lg:px-10 lg:py-16">
          <div className="w-full max-w-md">
            <div className="mb-8 space-y-4 lg:hidden" data-auth-reveal>
              {eyebrow ? (
                <span className="inline-flex items-center rounded-full border border-brand-light/40 bg-brand/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-dark">
                  {eyebrow}
                </span>
              ) : null}
              <div>
                <h1 className="font-[family-name:var(--font-display)] text-[clamp(28px,6vw,36px)] font-normal leading-tight tracking-tight text-zinc-950">
                  {title}
                </h1>
                <p className="mt-2 text-[15px] leading-relaxed text-zinc-600">
                  {subtitle}
                </p>
              </div>
              <AuthTrustStrip />
            </div>

            <div ref={panelRef} data-auth-panel>
              <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
                {banner ? <div data-auth-reveal>{banner}</div> : null}
                {stepIndicator ? (
                  <div data-auth-reveal>{stepIndicator}</div>
                ) : null}

                <div className="mb-6 hidden lg:block" data-auth-reveal>
                  {eyebrow ? (
                    <p className="editorial-chapter-label mb-3 text-brand-dark">
                      {eyebrow}
                    </p>
                  ) : null}
                  <h1 className="font-[family-name:var(--font-display)] text-[clamp(28px,3vw,36px)] font-normal leading-tight tracking-tight text-zinc-950">
                    {title}
                  </h1>
                  <p className="mt-2 text-[15px] leading-relaxed text-zinc-600">
                    {subtitle}
                  </p>
                </div>

                <div data-auth-reveal>{children}</div>

                <div className="mt-6 hidden lg:block" data-auth-reveal>
                  <AuthTrustStrip />
                </div>
              </div>

              {footer ? (
                <div className="mt-6" data-auth-reveal>
                  {footer}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <footer className="border-t border-zinc-200/60 py-5 text-center text-xs text-zinc-400">
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
