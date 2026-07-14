import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import {
  redirectForStage,
  resolveStage,
} from "@/lib/auth/onboarding-gate";
import { StaleAuthUserError } from "@/lib/tenant";
import { privatePageMetadata } from "@/lib/seo";
import { sanitizeNext } from "@/lib/auth/sanitize-next";
import { OnboardingWizard } from "./onboarding-wizard";

export const dynamic = "force-dynamic";

export const metadata = privatePageMetadata({
  title: "Set up your workspace",
});

type Search = Promise<{ [k: string]: string | string[] | undefined }>;

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams?: Search;
}) {
  const sp = (await searchParams) ?? {};
  const preferredNext = sanitizeNext(sp.next);

  let resolved;
  try {
    resolved = await resolveStage();
  } catch (err) {
    if (err instanceof StaleAuthUserError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4">
          <div className="max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
            <h1 className="text-xl font-semibold text-zinc-950">
              Account setup issue
            </h1>
            <p className="mt-3 text-sm text-zinc-600">{err.message}</p>
            <Link
              href="/auth/sign-in"
              className="mt-6 inline-block text-sm font-medium text-zinc-900 underline underline-offset-2"
            >
              Back to sign in
            </Link>
          </div>
        </div>
      );
    }
    throw err;
  }
  if (resolved.stage !== "needs_company") {
    if (
      preferredNext &&
      (resolved.stage === "needs_plan" || resolved.stage === "ready")
    ) {
      redirect(preferredNext);
    }
    redirect(redirectForStage(resolved));
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="py-6">
        <Link href="/" className="flex justify-center">
          <Image
            src="/logo-7.png"
            alt="Plott"
            width={120}
            height={32}
            className="h-8 w-auto object-contain"
            priority
          />
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 pb-16">
        <OnboardingWizard
          next={preferredNext}
          initial={{
            name: resolved.company.name.endsWith("'s Workspace")
              ? ""
              : resolved.company.name,
            websiteUrl: resolved.company.websiteUrl ?? "",
            addressLines: resolved.company.addressLines ?? "",
            phone: resolved.company.phone ?? "",
            logoBlobUrl: resolved.company.logoBlobUrl ?? null,
          }}
        />
      </main>
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
