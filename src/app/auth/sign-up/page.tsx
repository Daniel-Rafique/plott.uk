import Link from "next/link";
import { privatePageMetadata } from "@/lib/seo";
import { SignUpForm } from "./sign-up-form";
import { AuthMarketingShell } from "@/components/auth/auth-marketing-shell";
import { AuthFunnelStep } from "@/components/auth/auth-funnel-step";
import { AuthPageAnalytics } from "@/components/auth/auth-page-analytics";
import { freeTrialEyebrow } from "@/lib/trial";

export const metadata = privatePageMetadata({
  title: "Create account",
});

type Search = Promise<{ [k: string]: string | string[] | undefined }>;

function sanitizeNext(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  if (raw.startsWith("/auth/")) return null;
  return raw;
}

function sanitizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}

export default async function AuthSignUpPage({
  searchParams,
}: {
  searchParams?: Search;
}) {
  const sp = (await searchParams) ?? {};
  const next = sanitizeNext(sp.next);
  const email = sanitizeEmail(sp.email);
  const isInvite = next?.startsWith("/invites/") ?? false;

  const signInParams = new URLSearchParams();
  if (next) signInParams.set("next", next);
  if (email) signInParams.set("email", email);
  const signInHref =
    signInParams.size > 0
      ? `/auth/sign-in?${signInParams.toString()}`
      : "/auth/sign-in";

  const signUpParams = new URLSearchParams();
  if (next) signUpParams.set("next", next);
  if (email) signUpParams.set("email", email);
  const signUpHref =
    signUpParams.size > 0
      ? `/auth/sign-up?${signUpParams.toString()}`
      : "/auth/sign-up";

  return (
    <>
      <AuthPageAnalytics event="auth_signup_page_viewed" />
      <AuthMarketingShell
        variant="signup"
        signUpHref={signUpHref}
        eyebrow={isInvite ? undefined : freeTrialEyebrow()}
        title={isInvite ? "Join your team on Plott" : "Start your free trial"}
        subtitle={
          isInvite
            ? "Create an account to accept your invitation."
            : "Map every planning application in your patch. Enrich applicants. Send branded outreach."
        }
        stepIndicator={
          isInvite ? null : (
            <AuthFunnelStep
              step={1}
              total={3}
              label="Create account"
              hint="Verify email → Set up workspace → Choose plan"
            />
          )
        }
        footer={
          <p className="text-center text-sm text-zinc-500">
            Already have an account?{" "}
            <Link
              href={signInHref}
              className="font-medium text-zinc-900 underline underline-offset-2 hover:text-zinc-700"
            >
              Sign in
            </Link>
          </p>
        }
      >
        <SignUpForm next={next} defaultEmail={email} />
      </AuthMarketingShell>
    </>
  );
}
