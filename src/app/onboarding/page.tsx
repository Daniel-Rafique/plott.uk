import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import {
  redirectForStage,
  resolveStage,
} from "@/lib/auth/onboarding-gate";
import { privatePageMetadata } from "@/lib/seo";
import { OnboardingWizard } from "./onboarding-wizard";

export const dynamic = "force-dynamic";

export const metadata = privatePageMetadata({
  title: "Set up your workspace",
});

export default async function OnboardingPage() {
  const resolved = await resolveStage();
  if (resolved.stage !== "needs_company") {
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
