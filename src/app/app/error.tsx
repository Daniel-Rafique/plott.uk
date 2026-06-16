"use client";

import { useEffect } from "react";
import Link from "next/link";
import { captureError } from "@/lib/observability";

export default function AppError({
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
    <div className="flex h-full w-full items-center justify-center p-8">
      <div className="max-w-md rounded-2xl border border-red-100 bg-red-50/40 p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-red-900">
          This screen hit an error
        </h1>
        <p className="mt-2 text-sm text-red-800/90">
          Retry or go back to the dashboard. We&apos;ve logged the details.
        </p>
        <div className="mt-5 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-full bg-red-700 px-4 py-2 text-xs font-semibold text-white hover:bg-red-800"
          >
            Retry
          </button>
          <Link
            href="/app/dashboard"
            className="rounded-full border border-red-300 bg-white px-4 py-2 text-xs font-semibold text-red-900 hover:bg-red-50"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
