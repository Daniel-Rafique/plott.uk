import Link from "next/link";
import Image from "next/image";
import { privatePageMetadata } from "@/lib/seo";
import { SignUpForm } from "./sign-up-form";

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
                {isInvite ? "Join your team on Plott" : "Start your free trial"}
              </h1>
              <p className="mt-2 text-center text-sm text-zinc-500">
                {isInvite
                  ? "Create an account to accept your invitation."
                  : "Create an account to start finding leads."}
              </p>
            </div>
            <SignUpForm next={next} defaultEmail={email} />
          </div>
          
          <p className="mt-6 text-center text-sm text-zinc-500">
            Already have an account?{" "}
            <Link
              href={signInHref}
              className="font-medium text-zinc-900 underline underline-offset-2 hover:text-zinc-700"
            >
              Sign in
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
