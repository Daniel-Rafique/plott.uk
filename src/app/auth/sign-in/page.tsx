import { privatePageMetadata } from "@/lib/seo";
import { SignInForm } from "./sign-in-form";
import { AuthMarketingShell } from "@/components/auth/auth-marketing-shell";
import { AuthPageAnalytics } from "@/components/auth/auth-page-analytics";
import { AuthTransitionLink } from "@/components/auth/auth-transition-link";
import { startFreeTrialLabel } from "@/lib/trial";

export const metadata = privatePageMetadata({
  title: "Sign in",
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

export default async function AuthSignInPage({
  searchParams,
}: {
  searchParams?: Search;
}) {
  const sp = (await searchParams) ?? {};
  const rawNext = typeof sp.next === "string" ? sp.next : null;
  const pendingEmailVerification =
    rawNext?.startsWith("/auth/verify-email") ?? false;
  const next = sanitizeNext(sp.next);
  const email = sanitizeEmail(sp.email);
  const isInvite = next?.startsWith("/invites/") ?? false;

  const signUpParams = new URLSearchParams();
  if (next) signUpParams.set("next", next);
  if (email) signUpParams.set("email", email);
  const signUpHref =
    signUpParams.size > 0
      ? `/auth/sign-up?${signUpParams.toString()}`
      : "/auth/sign-up";

  return (
    <>
      <AuthPageAnalytics event="auth_signin_page_viewed" />
      <AuthMarketingShell
        variant="signin"
        signUpHref={signUpHref}
        title={isInvite ? "Accept your invitation" : "Welcome back"}
        subtitle={
          isInvite
            ? "Sign in to join your team on Plott."
            : "Sign in to your account to continue."
        }
        banner={
          pendingEmailVerification ? (
            <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <p className="font-medium">Account created — check your email.</p>
              <p className="mt-1 text-emerald-800/90">
                We sent a 6-digit verification code to your email. Enter it on
                the verify page, or sign in below once verified.
              </p>
            </div>
          ) : null
        }
        footer={
          <div className="flex flex-col items-center gap-4">
            {!isInvite ? (
              <AuthTransitionLink
                href={signUpHref}
                direction="signup"
                className="inline-flex w-full items-center justify-center rounded-full border border-zinc-300 bg-white px-6 py-3 text-sm font-semibold text-zinc-900 transition hover:border-zinc-900"
              >
                {startFreeTrialLabel()}
              </AuthTransitionLink>
            ) : null}
            <p className="text-center text-sm text-zinc-500">
              {isInvite ? "New to Plott?" : "Don't have an account?"}{" "}
              <AuthTransitionLink
                href={signUpHref}
                direction="signup"
                className="font-medium text-zinc-900 underline underline-offset-2 hover:text-zinc-700"
              >
                {isInvite ? "Create an account" : "Sign up free"}
              </AuthTransitionLink>
            </p>
          </div>
        }
      >
        <SignInForm next={next} defaultEmail={email} />
      </AuthMarketingShell>
    </>
  );
}
