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
      <div className="flex w-96 flex-col border-r border-zinc-200 bg-zinc-50 p-6">
        <div className="h-8 w-32 animate-pulse rounded-md bg-zinc-200" />
        <div className="mt-4 h-4 w-64 animate-pulse rounded-md bg-zinc-200" />
        <div className="mt-2 h-4 w-56 animate-pulse rounded-md bg-zinc-200" />
        
        <div className="mt-8 flex flex-col gap-4">
          <div className="h-10 w-full animate-pulse rounded-xl bg-zinc-200" />
          <div className="h-10 w-full animate-pulse rounded-xl bg-zinc-200" />
        </div>
        
        <div className="mt-8 flex-1 overflow-hidden">
          <div className="flex flex-col gap-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-24 w-full animate-pulse rounded-xl bg-zinc-200" />
            ))}
          </div>
        </div>
      </div>
      <div className="flex-1 animate-pulse bg-zinc-100" />
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
