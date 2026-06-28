import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { Mail } from "lucide-react";
import { VerifyEmailForm } from "./verify-email-form";
import { redirectForStage, resolveStage } from "@/lib/auth/onboarding-gate";
import { privatePageMetadata } from "@/lib/seo";

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
  // If the user lands here but is already verified (e.g. bookmark, back-button,
  // follow-up login) skip the OTP form entirely and push them to the next
  // onboarding stage. Unauthenticated users fall through and see the form.
  const stage = await resolveStage();
  const sp = (await searchParams) ?? {};
  const rawNext = typeof sp.next === "string" ? sp.next : null;
  const justCreated = sp.created === "1" || sp.created === 1;
  if (stage.stage !== "unauthenticated" && stage.stage !== "unverified") {
    redirect(
      rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//")
        ? rawNext
        : redirectForStage(stage),
    );
  }
  const isInvite = rawNext?.startsWith("/invites/") ?? false;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-10 flex justify-center">
            <Image
              src="/logo-7.png"
              alt="Plott"
              width={120}
              height={32}
              className="h-10 w-auto object-contain"
              priority
            />
          </Link>
          
          <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
            {justCreated ? (
              <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                <p className="font-medium">Account created.</p>
                <p className="mt-1 text-emerald-800/90">
                  We sent a verification link to your email. Click the link or
                  enter the 6-digit code below to continue.
                </p>
              </div>
            ) : null}
            <div className="mb-6 flex flex-col items-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
                <Mail className="h-6 w-6 text-emerald-600" />
              </div>
              <h1 className="text-center font-[family-name:var(--font-display)] text-2xl font-normal tracking-tight text-zinc-950">
                Check your inbox
              </h1>
              <p className="mt-2 text-center text-sm text-zinc-500">
                {isInvite
                  ? "We sent a verification link and code to your email. Click the link or enter the code below to finish joining your team."
                  : "We sent a verification link and code to your email. Click the link or enter the code below to verify your account."}
              </p>
            </div>
            <Suspense fallback={<div className="text-center text-sm text-zinc-500">Loading…</div>}>
              <VerifyEmailForm />
            </Suspense>
          </div>
          
          <p className="mt-6 text-center text-sm text-zinc-500">
            Wrong email?{" "}
            <Link 
              href="/auth/sign-up" 
              className="font-medium text-zinc-900 underline underline-offset-2 hover:text-zinc-700"
            >
              Start over
            </Link>
          </p>
        </div>
      </div>
      
      <footer className="py-6 text-center text-xs text-zinc-400">
        <Link href="/" className="hover:text-zinc-600">plott.uk</Link>
        {" · "}
        <Link href="/privacy" className="hover:text-zinc-600">Privacy</Link>
        {" · "}
        <Link href="/terms" className="hover:text-zinc-600">Terms</Link>
      </footer>
    </div>
  );
}
