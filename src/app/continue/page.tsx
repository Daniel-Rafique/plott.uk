import { redirect } from "next/navigation";
import {
  redirectForStage,
  resolveStage,
} from "@/lib/auth/onboarding-gate";
import { StaleAuthUserError } from "@/lib/tenant";
import { privatePageMetadata } from "@/lib/seo";
import { sanitizeNext } from "@/lib/auth/sanitize-next";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = privatePageMetadata({
  title: "Continue",
});

type Search = Promise<{ [k: string]: string | string[] | undefined }>;

/**
 * Stage-aware entry for signed-in users (marketing Dashboard, post sign-in).
 * Sends incomplete accounts into the funnel instead of bouncing through /app.
 */
export default async function ContinuePage({
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

  if (resolved.stage === "unauthenticated") {
    const signIn = preferredNext
      ? `/auth/sign-in?next=${encodeURIComponent(preferredNext)}`
      : "/auth/sign-in";
    redirect(signIn);
  }

  if (
    preferredNext &&
    (resolved.stage === "ready" ||
      resolved.stage === "needs_plan" ||
      resolved.stage === "needs_company")
  ) {
    if (resolved.stage === "ready") {
      redirect(preferredNext);
    }
    if (
      resolved.stage === "needs_company" &&
      preferredNext.startsWith("/subscribe")
    ) {
      redirect(`/onboarding?next=${encodeURIComponent(preferredNext)}`);
    }
    if (resolved.stage === "needs_plan" && preferredNext.startsWith("/subscribe")) {
      redirect(preferredNext);
    }
  }

  redirect(redirectForStage(resolved));
}
