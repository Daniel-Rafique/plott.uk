import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { privatePageMetadata } from "@/lib/seo";
import { getSessionUser } from "@/lib/auth/session";
import { upsertUserFromSession } from "@/lib/tenant";
import { hasValidSecondFactorVerification } from "@/lib/auth/second-factor";
import { TwoFactorForm } from "./two-factor-form";

export const metadata = privatePageMetadata({
  title: "Two-factor verification",
});

export const dynamic = "force-dynamic";

export default async function TwoFactorPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect("/auth/sign-in");
  if (!sessionUser.emailVerified) redirect("/auth/verify-email");
  const user = await upsertUserFromSession(sessionUser);
  if (!user.twoFactorEmailEnabled) redirect("/app/dashboard");
  if (await hasValidSecondFactorVerification(user.id)) {
    redirect("/app/dashboard");
  }

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
            <div className="mb-6">
              <h1 className="text-center font-[family-name:var(--font-display)] text-2xl font-normal tracking-tight text-zinc-950">
                Confirm your sign-in
              </h1>
              <p className="mt-2 text-center text-sm text-zinc-500">
                We need one more email code before opening your workspace.
              </p>
            </div>
            <TwoFactorForm />
          </div>
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
