import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { VerifyEmailForm } from "./verify-email-form";
import { redirectForStage, resolveStage } from "@/lib/auth/onboarding-gate";
import { privatePageMetadata } from "@/lib/seo";
import { AuthMarketingShell } from "@/components/auth/auth-marketing-shell";
import { AuthFunnelStep } from "@/components/auth/auth-funnel-step";

export const metadata = privatePageMetadata({
  title: "Verify email",
});

export const dynamic = "force-dynamic";

type Search = Promise<{ [k: string]: string | string[] | undefined }>;

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams?: Search;
}) {
  const stage = await resolveStage();
  const sp = (await searchParams) ?? {};
  const rawNext = typeof sp.next === "string" ? sp.next : null;
  const justCreated = sp.created === "1";
  if (stage.stage !== "unauthenticated" && stage.stage !== "unverified") {
    redirect(
      rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//")
        ? rawNext
        : redirectForStage(stage),
    );
  }
  const isInvite = rawNext?.startsWith("/invites/") ?? false;

  return (
    <AuthMarketingShell
      variant="verify"
      title="Check your inbox"
      subtitle={
        isInvite
          ? "We sent a 6-digit code to your email. Enter it below to finish joining your team."
          : "You're one step from searching 2.4M planning applications. Enter the code we sent to your email."
      }
      banner={
        justCreated ? (
          <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <p className="font-medium">Account created.</p>
            <p className="mt-1 text-emerald-800/90">
              We sent a 6-digit code to your email. Enter it below to continue.
            </p>
          </div>
        ) : null
      }
      stepIndicator={
        isInvite ? null : (
          <AuthFunnelStep
            step={2}
            total={3}
            label="Verify email"
            hint="Set up workspace → Choose plan"
          />
        )
      }
      footer={
        <p className="text-center text-sm text-zinc-500">
          Wrong email?{" "}
          <Link
            href="/auth/sign-up"
            className="font-medium text-zinc-900 underline underline-offset-2 hover:text-zinc-700"
          >
            Start over
          </Link>
        </p>
      }
    >
      <Suspense
        fallback={
          <div className="text-center text-sm text-zinc-500">Loading…</div>
        }
      >
        <VerifyEmailForm />
      </Suspense>
    </AuthMarketingShell>
  );
}
