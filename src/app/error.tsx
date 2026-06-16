"use client";

import { useEffect } from "react";
import Link from "next/link";
import { captureError } from "@/lib/observability";

export default function GlobalRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureError(error, { extra: { digest: error.digest ?? null } });
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 p-8 text-center">
      <div className="max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-zinc-900">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          We&apos;ve been notified and are on it. You can retry the last action
          or return to your dashboard.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-[11px] text-zinc-400">
            Ref: {error.digest}
          </p>
        )}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            Try again
          </button>
          <Link
            href="/app/dashboard"
            className="rounded-full border border-zinc-300 bg-white px-5 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
