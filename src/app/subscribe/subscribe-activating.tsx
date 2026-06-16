"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Shown immediately after a successful Stripe Checkout while we wait for the
 * webhook to update the company row. We POST `/api/stripe/sync-checkout` once
 * with the Checkout Session id (covers delayed or missing webhooks), then
 * poll every 3s until `resolveStage()` is ready.
 */
export function SubscribeActivating({
  companyName,
  sessionId,
}: {
  companyName: string;
  sessionId: string | null;
}) {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);
  const syncTried = useRef(false);

  useEffect(() => {
    if (!sessionId || syncTried.current) return;
    syncTried.current = true;
    void fetch("/api/stripe/sync-checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId }),
    })
      .then((res) => {
        if (res.ok) router.refresh();
        else syncTried.current = false;
      })
      .catch(() => {
        syncTried.current = false;
      });
  }, [sessionId, router]);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed((prev) => prev + 1);
      router.refresh();
    }, 3000);
    return () => clearInterval(interval);
  }, [router]);

  const stalled = elapsed > 6; // 18s+ with no webhook → offer a manual nudge.

  return (
    <section className="w-full max-w-lg rounded-3xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
      <div
        className="mx-auto mb-6 h-10 w-10 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900"
        aria-hidden="true"
      />
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        Activating your subscription
      </h1>
      <p className="mt-3 text-sm text-zinc-600">
        We&apos;re finalising things with Stripe for{" "}
        <span className="font-medium">{companyName}</span>. This normally takes
        a couple of seconds.
      </p>
      {stalled ? (
        <div className="mt-6 rounded-xl bg-amber-50 p-4 text-left text-sm text-amber-900">
          <p className="font-medium">Still activating…</p>
          <p className="mt-1">
            Stripe is taking longer than usual. You can safely refresh this
            page. If you&apos;re charged but still see this screen after a
            minute, contact support with your Stripe receipt.
          </p>
        </div>
      ) : (
        <p className="mt-6 text-xs text-zinc-400">
          This page refreshes automatically — no action needed.
        </p>
      )}
    </section>
  );
}
