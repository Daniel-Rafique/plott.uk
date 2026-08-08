"use client";

import dynamic from "next/dynamic";
import type { PlanFeatures } from "@/lib/plan-features";

const DashboardClient = dynamic(
  () =>
    import("./dashboard-client").then((m) => ({ default: m.DashboardClient })),
  { ssr: false, loading: () => <DashboardSkeleton /> },
);

function DashboardSkeleton() {
  return (
    <div className="flex h-full min-h-0 w-full flex-1 overflow-hidden bg-white">
      <div className="relative min-h-0 min-w-0 flex-1 animate-pulse bg-zinc-100" />
      <div className="flex w-[400px] shrink-0 flex-col border-l border-zinc-200 bg-zinc-50 p-4">
        <div className="h-3 w-16 animate-pulse rounded bg-zinc-200" />
        <div className="mt-2 h-7 w-36 animate-pulse rounded-md bg-zinc-200" />
        <div className="mt-6 flex-1 space-y-3">
          <div className="h-16 w-full animate-pulse rounded-xl bg-zinc-200" />
          <div className="h-16 w-3/4 animate-pulse rounded-xl bg-zinc-200" />
          <div className="h-16 w-full animate-pulse rounded-xl bg-zinc-200" />
        </div>
        <div className="mt-4 h-16 w-full animate-pulse rounded-xl bg-zinc-200" />
      </div>
    </div>
  );
}

export function DashboardGate({ features }: { features: PlanFeatures }) {
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      <DashboardClient features={features} />
    </div>
  );
}
