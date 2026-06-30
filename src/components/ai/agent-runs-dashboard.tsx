"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useMountReveal } from "@/lib/animation/use-mount-reveal";
import type {
  AgentRunRow,
  AgentRunsByKindRow,
  AgentRunsFilters,
} from "@/lib/agent-runs-query";
import { agentRunsQueryString } from "@/lib/agent-runs-query";

const STATUS_BADGE: Record<string, string> = {
  running: "bg-amber-50 text-amber-800 border-amber-200",
  succeeded: "bg-emerald-50 text-emerald-800 border-emerald-200",
  failed: "bg-red-50 text-red-800 border-red-200",
};

type Props = {
  scope: "company" | "platform";
  basePath: string;
  filters: AgentRunsFilters;
  runs: AgentRunRow[];
  stats24h: {
    runs: number;
    costGbp: number;
    tokens: number;
    toolCalls: number;
    avgMs: number;
  };
  byKind7d: AgentRunsByKindRow[];
};

export function AgentRunsDashboard({
  scope,
  basePath,
  filters,
  runs,
  stats24h,
  byKind7d,
}: Props) {
  const statsRef = useMountReveal(true, { selector: "[data-reveal]", y: 12 });

  const failedInView = runs.filter((r) => r.status === "failed");
  const showFailuresBlock =
    filters.status === "failed" || failedInView.length > 0;

  function filterHref(partial: Partial<AgentRunsFilters>) {
    return agentRunsQueryString({ ...filters, ...partial }, basePath);
  }

  return (
    <div className="space-y-8">
      <header className="border-b border-zinc-200/80 pb-8">
        {scope === "company" ? (
          <Link
            href="/app/settings/ai"
            className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-zinc-600 transition hover:text-zinc-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            AI assistant
          </Link>
        ) : null}
        <p className="editorial-chapter-label text-brand-dark">
          {scope === "platform" ? "Admin · Agent observability" : "AI · Run history"}
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-[clamp(28px,4vw,40px)] font-normal leading-tight tracking-tight text-zinc-950">
          {filters.status === "failed"
            ? "Failed AI runs"
            : "Agent run history"}
        </h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-zinc-600">
          {scope === "platform"
            ? "All tenants · last 200 matching runs · failures highlighted with error messages."
            : "Your workspace · last 200 matching runs · see what succeeded and what needs attention."}
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <FilterPill
            href={filterHref({ status: undefined })}
            active={!filters.status}
            label="All"
          />
          <FilterPill
            href={filterHref({ status: "failed" })}
            active={filters.status === "failed"}
            label="Failed"
          />
          <FilterPill
            href={filterHref({ status: "running" })}
            active={filters.status === "running"}
            label="Running"
          />
          {filters.kind || filters.status || filters.companyId ? (
            <Link
              href={basePath}
              className="ml-1 rounded-full border border-zinc-300 px-3 py-1 text-[11px] font-medium text-zinc-600 transition hover:border-zinc-900 hover:text-zinc-900"
            >
              Clear filters
            </Link>
          ) : null}
        </div>
      </header>

      {showFailuresBlock && failedInView.length > 0 ? (
        <section className="rounded-2xl border border-red-200/80 bg-gradient-to-br from-red-50/90 to-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-red-950">
            Recent failures
            {filters.status === "failed" ? (
              <span className="ml-2 font-normal text-red-700/80">
                ({failedInView.length} in this view)
              </span>
            ) : null}
          </h2>
          <ul className="mt-4 space-y-3">
            {failedInView.slice(0, 10).map((r) => (
              <li
                key={r.id}
                className="rounded-lg border border-red-100 bg-white/80 px-4 py-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-red-800">
                    {r.kind}
                  </span>
                  <span className="text-[11px] text-zinc-500">
                    {new Date(r.createdAt).toLocaleString("en-GB")}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-red-900/90">
                  {r.errorMessage ?? "(no error message recorded)"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section
        ref={statsRef}
        className="grid grid-cols-2 gap-3 md:grid-cols-5"
      >
        <StatCard
          label="Runs (24h)"
          value={stats24h.runs.toLocaleString()}
          highlight={filters.status === "failed"}
        />
        <StatCard label="Cost (24h)" value={`£${stats24h.costGbp.toFixed(2)}`} />
        <StatCard
          label="Tokens (24h)"
          value={stats24h.tokens.toLocaleString()}
        />
        <StatCard
          label="Tool calls (24h)"
          value={stats24h.toolCalls.toLocaleString()}
        />
        <StatCard label="Avg latency" value={`${stats24h.avgMs} ms`} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="editorial-hairline border-b border-zinc-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-zinc-900">
            Past 7 days by kind
          </h2>
        </div>
        <div className="divide-y divide-zinc-100">
          {byKind7d.length === 0 ? (
            <p className="px-5 py-4 text-sm text-zinc-500">
              No agent runs in the last 7 days.
            </p>
          ) : (
            byKind7d
              .slice()
              .sort((a, b) => b.count - a.count)
              .map((row) => (
                <div
                  key={`${row.kind}-${row.status}`}
                  className="flex items-center justify-between px-5 py-3 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <Link
                      href={filterHref({ kind: row.kind })}
                      className="font-mono text-xs text-brand-dark hover:underline"
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
                    <span>{row.count} runs</span>
                    <span>£{row.costGbp.toFixed(4)}</span>
                  </div>
                </div>
              ))
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="editorial-hairline border-b border-zinc-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-zinc-900">
            Run log (newest first)
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="sticky top-0 bg-zinc-50/95 text-[11px] uppercase tracking-wider text-zinc-500 backdrop-blur-sm">
              <tr>
                <th className="px-4 py-2.5">When</th>
                <th className="px-4 py-2.5">Kind</th>
                <th className="px-4 py-2.5">Model</th>
                <th className="px-4 py-2.5">Status</th>
                {scope === "platform" ? (
                  <th className="px-4 py-2.5">Tenant</th>
                ) : null}
                <th className="px-4 py-2.5">User</th>
                <th className="px-4 py-2.5 text-right">Tokens</th>
                <th className="px-4 py-2.5 text-right">Cost</th>
                <th className="px-4 py-2.5 text-right">Tools</th>
                <th className="px-4 py-2.5 text-right">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {runs.length === 0 ? (
                <tr>
                  <td
                    className="px-4 py-10 text-center text-sm text-zinc-500"
                    colSpan={scope === "platform" ? 10 : 9}
                  >
                    No agent runs match these filters.
                  </td>
                </tr>
              ) : (
                runs.map((r) => (
                  <tr key={r.id} className="transition hover:bg-zinc-50/70">
                    <td className="whitespace-nowrap px-4 py-2.5 text-zinc-600">
                      {new Date(r.createdAt).toLocaleString("en-GB")}
                    </td>
                    <td className="px-4 py-2.5">
                      <Link
                        href={filterHref({ kind: r.kind })}
                        className="font-mono text-[11px] text-brand-dark hover:underline"
                      >
                        {r.kind}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-zinc-500">
                      {r.model}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_BADGE[r.status] ?? "border-zinc-200 bg-zinc-50 text-zinc-700"}`}
                      >
                        {r.status}
                      </span>
                    </td>
                    {scope === "platform" ? (
                      <td className="px-4 py-2.5 text-zinc-700">
                        <Link
                          href={agentRunsQueryString(
                            { ...filters, companyId: r.company.id },
                            basePath,
                          )}
                          className="hover:underline"
                        >
                          {r.company.name}
                        </Link>
                      </td>
                    ) : null}
                    <td className="px-4 py-2.5 text-zinc-600">
                      {r.user?.email ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-zinc-700">
                      {r.totalTokens.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-zinc-700">
                      £{r.costGbp.toFixed(4)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-zinc-700">
                      {r.toolCalls}
                    </td>
                    <td className="px-4 py-2.5 text-right text-zinc-600">
                      {r.durationMs ? `${r.durationMs} ms` : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function FilterPill({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? "rounded-full border border-zinc-900 bg-zinc-900 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white"
          : "rounded-full border border-zinc-300 bg-white px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-700 transition hover:border-zinc-900"
      }
    >
      {label}
    </Link>
  );
}

function StatCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      data-reveal
      className={
        highlight
          ? "rounded-2xl border border-brand-light/50 bg-brand/5 p-4 shadow-sm"
          : "rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
      }
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </p>
      <p className="mt-2 text-xl font-semibold tracking-tight text-zinc-950">
        {value}
      </p>
    </div>
  );
}
