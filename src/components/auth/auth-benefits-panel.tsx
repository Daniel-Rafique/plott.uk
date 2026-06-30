import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Map, Mail, Users } from "lucide-react";
import { HOME_CHAPTERS } from "@/lib/marketing/images";
import { AuthTrustStrip } from "@/components/auth/auth-trust-strip";

const BENEFITS = [
  {
    icon: Map,
    title: "Map-first search",
    description: "Draw your patch and see every planning application as it lands.",
  },
  {
    icon: Users,
    title: "Applicant enrichment",
    description: "Match applicants and agents from multiple authoritative sources.",
  },
  {
    icon: Mail,
    title: "Branded outreach",
    description: "Send print-ready letters and emails from one workspace.",
  },
] as const;

const STATS = [
  { value: "2.4M", label: "Applications indexed" },
  { value: "337", label: "Local planning authorities" },
  { value: "94%", label: "Applicant match rate" },
] as const;

type Props = {
  variant?: "signup" | "signin" | "verify";
  signUpHref?: string;
};

export function AuthBenefitsPanel({
  variant = "signup",
  signUpHref = "/auth/sign-up",
}: Props) {
  const hero = HOME_CHAPTERS.map;

  const headline =
    variant === "signin"
      ? "Win every planning application in your patch."
      : variant === "verify"
        ? "You're almost in."
        : "See every site before your competitors do.";

  const subline =
    variant === "signin"
      ? "Live planning intelligence for construction, property and planning teams."
      : variant === "verify"
        ? "Verify your email to unlock map search, enrichment and branded outreach."
        : "Map-first planning search with enrichment and outreach — built for UK professionals.";

  return (
    <div className="relative flex min-h-full flex-col justify-between overflow-hidden bg-zinc-950 p-10 lg:p-12 xl:p-14">
      <Image
        src={hero.src}
        alt={hero.alt}
        fill
        priority
        className="object-cover opacity-40"
        sizes="50vw"
      />
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-zinc-950/95 via-zinc-950/75 to-zinc-950/90"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
          backgroundSize: "24px 24px",
        }}
        aria-hidden
      />

      <div className="relative z-10">
        <p className="editorial-chapter-label text-brand-light/80">
          Plott · Planning intelligence
        </p>
        <h2 className="mt-6 max-w-md font-[family-name:var(--font-display)] text-[clamp(28px,3.5vw,44px)] font-normal leading-[1.12] tracking-tight text-white">
          {headline}
        </h2>
        <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-zinc-300">
          {subline}
        </p>
      </div>

      <div className="relative z-10 mt-10 space-y-8">
        <ul className="space-y-5">
          {BENEFITS.map(({ icon: Icon, title, description }) => (
            <li key={title} className="flex gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-brand-light/25 bg-brand/15">
                <Icon className="h-4 w-4 text-brand-light" aria-hidden />
              </span>
              <div>
                <p className="text-sm font-medium text-white">{title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-zinc-400">
                  {description}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <div className="grid grid-cols-3 gap-4 border-t border-white/10 pt-8">
          {STATS.map(({ value, label }) => (
            <div key={label}>
              <p className="font-[family-name:var(--font-display)] text-2xl text-white">
                {value}
              </p>
              <p className="mt-1 text-[11px] leading-snug text-zinc-400">
                {label}
              </p>
            </div>
          ))}
        </div>

        {variant === "signin" ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
            <p className="text-sm font-medium text-white">New to Plott?</p>
            <p className="mt-1 text-sm text-zinc-400">
              Start a free trial — map applications, enrich contacts and send
              outreach in minutes.
            </p>
            <Link
              href={signUpHref}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/90 px-5 py-2.5 text-[13px] font-semibold text-zinc-900 transition hover:bg-white"
            >
              Start free trial
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        ) : null}

        <AuthTrustStrip variant="dark" className="justify-start" />
      </div>
    </div>
  );
}
