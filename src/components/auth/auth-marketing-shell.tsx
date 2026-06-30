import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { AuthBenefitsPanel } from "@/components/auth/auth-benefits-panel";
import { AuthTrustStrip } from "@/components/auth/auth-trust-strip";

type Props = {
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

export function AuthMarketingShell({
  variant = "signup",
  eyebrow,
  title,
  subtitle,
  banner,
  stepIndicator,
  children,
  footer,
  signUpHref = "/auth/sign-up",
}: Props) {
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
        <div className="hidden lg:block">
          <AuthBenefitsPanel variant={variant} signUpHref={signUpHref} />
        </div>

        <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 lg:px-10 lg:py-16">
          <div className="w-full max-w-md">
            {/* Mobile benefits header */}
            <div className="mb-8 space-y-4 lg:hidden">
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

            <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
              {banner}
              {stepIndicator}

              <div className="mb-6 hidden lg:block">
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

              {children}

              <div className="mt-6 hidden lg:block">
                <AuthTrustStrip />
              </div>
            </div>

            {footer ? <div className="mt-6">{footer}</div> : null}
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
