import { redirect } from "next/navigation";
import Link from "next/link";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { SavedSearchesClient } from "./searches-client";
import { getCompanyPlan } from "@/lib/pricing";
import { getCompanyPlanFeatures } from "@/lib/plan-features";

export const dynamic = "force-dynamic";

export default async function SavedSearchesPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/auth/sign-in");

  const features = getCompanyPlanFeatures(ctx.company);
  if (!features.canSaveSearches) {
    return (
      <div className="mx-auto w-full max-w-3xl overflow-auto px-6 py-10">
        <section className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Pro feature
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-zinc-900">
            Saved searches are available on Pro and Agency
          </h1>
          <p className="mt-3 text-sm leading-6 text-zinc-600">
            Upgrade to monitor map areas, receive email digests, and unlock
            pinned application tracking from your dashboard.
          </p>
          <Link
            href={features.upgradeHref}
            className="mt-6 inline-flex rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            Review billing options
          </Link>
        </section>
      </div>
    );
  }

  const searches = await prisma.savedSearch.findMany({
    where: { companyId: ctx.company.id },
    orderBy: { createdAt: "desc" },
  });
  const plan = getCompanyPlan(ctx.company);
  const planFeatures = getCompanyPlanFeatures(ctx.company);

  return (
    <div className="mx-auto w-full max-w-6xl overflow-auto px-6 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900">Saved searches</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Pin a map area + filters. We&apos;ll email your team a digest of new
          leads on schedule.
        </p>
      </header>
      <SavedSearchesClient
        initial={searches.map((s) => ({
          id: s.id,
          name: s.name,
          bbox: s.bbox as {
            west: number;
            south: number;
            east: number;
            north: number;
          },
          frequency: s.frequency,
          lastRunAt: s.lastRunAt?.toISOString() ?? null,
          lastRunCount: s.lastRunCount,
          notifyEmails: s.notifyEmails,
          autoOutreach: s.autoOutreach,
          autoApproveBelowConfidence: s.autoApproveBelowConfidence,
        }))}
        usage={{
          current: searches.length,
          limit: planFeatures.savedSearchLimit,
          planName: plan.name,
        }}
        canAutoOutreach={planFeatures.canUseAutoOutreach}
      />
    </div>
  );
}
