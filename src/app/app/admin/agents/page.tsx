/**
 * Admin agent trace viewer.
 *
 * Shows the last ~200 `AgentRun` rows across all tenants, aggregated stats for
 * the past 24 hours, and per-run details. Gated by `ADMIN_EMAILS`.
 *
 * This page is deliberately narrow: we don't let admins mutate state here
 * (no "retry" or "delete") — observability only. Structured traces live in
 * Langfuse; this UI is the zero-dependency fallback.
 */

import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { isCurrentUserAdmin } from "@/lib/admin";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  running: "bg-amber-50 text-amber-800 border-amber-200",
  succeeded: "bg-emerald-50 text-emerald-800 border-emerald-200",
  failed: "bg-red-50 text-red-800 border-red-200",
};

type Search = {
  kind?: string;
  status?: string;
  companyId?: string;
};

async function getData(search: Search) {
  const where: Prisma.AgentRunWhereInput = {};
  if (search.kind) where.kind = search.kind;
  if (search.status) where.status = search.status;
  if (search.companyId) where.companyId = search.companyId;

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [runs, last24hStats, byKind] = await Promise.all([
    prisma.agentRun.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        company: { select: { id: true, name: true, slug: true } },
        user: { select: { id: true, email: true, name: true } },
      },
    }),
    prisma.agentRun.aggregate({
      where: { createdAt: { gte: since24h } },
      _count: { _all: true },
      _sum: { costGbp: true, totalTokens: true, toolCalls: true },
      _avg: { durationMs: true },
    }),
    prisma.agentRun.groupBy({
      by: ["kind", "status"],
      _count: { _all: true },
      _sum: { costGbp: true },
      where: { createdAt: { gte: since7d } },
    }),
  ]);

  return { runs, last24hStats, byKind };
}

export default async function AdminAgentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/auth/sign-in");
  const ok = await isCurrentUserAdmin();
  if (!ok) notFound();

  const raw = await searchParams;
  const search: Search = {
    kind: typeof raw.kind === "string" ? raw.kind : undefined,
    status: typeof raw.status === "string" ? raw.status : undefined,
    companyId: typeof raw.companyId === "string" ? raw.companyId : undefined,
  };

  const { runs, last24hStats, byKind } = await getData(search);

  const runsCount = last24hStats._count?._all ?? 0;
  const cost24h = Number(last24hStats._sum?.costGbp ?? 0);
  const tokens24h = last24hStats._sum?.totalTokens ?? 0;
  const tools24h = last24hStats._sum?.toolCalls ?? 0;
  const avgMs = Math.round(last24hStats._avg?.durationMs ?? 0);

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600">
            Admin
          </p>
          <h1 className="text-2xl font-semibold text-zinc-900">
            Agent runs (last 200)
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            All tenants · all agents · failures highlighted
          </p>
        </div>
        <Link
          href="/app/admin/agents"
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Clear filters
        </Link>
      </header>

      <div className="space-y-6">
        <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Runs (24h)" value={runsCount.toLocaleString()} />
          <Stat label="Cost (24h)" value={`£${cost24h.toFixed(2)}`} />
          <Stat label="Tokens (24h)" value={tokens24h.toLocaleString()} />
          <Stat label="Tool calls (24h)" value={tools24h.toLocaleString()} />
          <Stat label="Avg latency" value={`${avgMs} ms`} />
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-4 py-2">
            <h2 className="text-sm font-semibold text-zinc-900">
              Past 7 days by kind
            </h2>
          </div>
          <div className="divide-y divide-zinc-100">
            {byKind.length === 0 ? (
              <p className="px-4 py-3 text-xs text-zinc-500">
                No agent runs yet.
              </p>
            ) : (
              byKind
                .slice()
                .sort((a, b) => (b._count?._all ?? 0) - (a._count?._all ?? 0))
                .map((row) => {
                  const runCount = row._count?._all ?? 0;
                  const sumCost = Number(row._sum?.costGbp ?? 0);
                  return (
                    <div
                      key={`${row.kind}-${row.status}`}
                      className="flex items-center justify-between px-4 py-2 text-sm"
                    >
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/app/admin/agents?kind=${encodeURIComponent(row.kind)}`}
                          className="font-mono text-xs text-indigo-700 hover:underline"
                        >
                          {row.kind}
                        </Link>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_BADGE[row.status] ?? "border-zinc-200 bg-zinc-50 text-zinc-700"}`}
                        >
                          {row.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-zinc-600">
                        <span>{runCount} runs</span>
                        <span>£{sumCost.toFixed(4)}</span>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 text-[11px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Kind</th>
                <th className="px-3 py-2">Model</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Tenant</th>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2 text-right">Tokens</th>
                <th className="px-3 py-2 text-right">Cost</th>
                <th className="px-3 py-2 text-right">Tools</th>
                <th className="px-3 py-2 text-right">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {runs.length === 0 ? (
                <tr>
                  <td
                    className="px-3 py-8 text-center text-zinc-500"
                    colSpan={10}
                  >
                    No agent runs match these filters.
                  </td>
                </tr>
              ) : (
                runs.map((r) => (
                  <tr key={r.id} className="hover:bg-zinc-50/60">
                    <td className="whitespace-nowrap px-3 py-2 text-zinc-600">
                      {new Date(r.createdAt).toLocaleString("en-GB")}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/app/admin/agents?kind=${encodeURIComponent(r.kind)}`}
                        className="font-mono text-[11px] text-indigo-700 hover:underline"
                      >
                        {r.kind}
                      </Link>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-zinc-500">
                      {r.model}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_BADGE[r.status] ?? "border-zinc-200 bg-zinc-50 text-zinc-700"}`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-zinc-700">
                      <Link
                        href={`/app/admin/agents?companyId=${r.company.id}`}
                        className="hover:underline"
                      >
                        {r.company.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-zinc-600">
                      {r.user?.email ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-700">
                      {r.totalTokens.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-700">
                      £{Number(r.costGbp).toFixed(4)}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-700">
                      {r.toolCalls}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-600">
                      {r.durationMs ? `${r.durationMs} ms` : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        {runs.some((r) => r.status === "failed") ? (
          <section className="rounded-xl border border-red-200 bg-red-50/40 p-4">
            <h3 className="mb-2 text-sm font-semibold text-red-900">
              Recent failures
            </h3>
            <ul className="space-y-1 text-xs text-red-800">
              {runs
                .filter((r) => r.status === "failed")
                .slice(0, 10)
                .map((r) => (
                  <li key={r.id} className="flex items-start gap-2">
                    <span className="font-mono text-[11px] text-red-700">
                      {r.kind}
                    </span>
                    <span className="truncate">
                      {r.errorMessage ?? "(no error message)"}
                    </span>
                  </li>
                ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-zinc-900">{value}</p>
    </div>
  );
}
