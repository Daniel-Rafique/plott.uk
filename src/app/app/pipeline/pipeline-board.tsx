"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  type PipelineStage,
  formatBallparkRange,
  formatBallparkWeeks,
} from "@/lib/pipeline-shared";
import { cn } from "@/lib/utils";

export type PipelineLeadRow = {
  id: string;
  planningEntity: number | null;
  applicationRef: string | null;
  siteAddress: string | null;
  description: string | null;
  stage: string;
  stageUpdatedAt: string;
  notes: string | null;
  lostReason: string | null;
  estimateMinGbp: number | null;
  estimateMaxGbp: number | null;
  estimateWeeks: number | null;
  includeBallparkInOutreach: boolean;
};

export function PipelineBoard({ initialLeads }: { initialLeads: PipelineLeadRow[] }) {
  const [leads, setLeads] = useState(initialLeads);
  const [filter, setFilter] = useState<"all" | PipelineStage>("all");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const visible = useMemo(
    () => (filter === "all" ? leads : leads.filter((l) => l.stage === filter)),
    [leads, filter],
  );

  function updateLead(id: string, patch: Partial<PipelineLeadRow> & { stage?: string }) {
    setPendingId(id);
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/pipeline/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          lead?: PipelineLeadRow;
        };
        if (!res.ok || !data.lead) {
          setError(data.error ?? "Could not update lead");
          return;
        }
        setLeads((prev) =>
          prev.map((l) => (l.id === id ? { ...l, ...data.lead! } : l)),
        );
      } catch {
        setError("Network error updating lead");
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <FilterChip
          active={filter === "all"}
          onClick={() => setFilter("all")}
          label={`All (${leads.length})`}
        />
        {PIPELINE_STAGES.map((stage) => {
          const count = leads.filter((l) => l.stage === stage).length;
          return (
            <FilterChip
              key={stage}
              active={filter === stage}
              onClick={() => setFilter(stage)}
              label={`${PIPELINE_STAGE_LABELS[stage]} (${count})`}
            />
          );
        })}
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 px-6 py-12 text-center">
          <p className="text-sm font-medium text-zinc-900">No leads in this stage</p>
          <p className="mt-1 text-sm text-zinc-600">
            Leads appear when you send outreach or when weekly digests rank new
            applications.{" "}
            <Link href="/app/dashboard" className="underline underline-offset-2">
              Open the map
            </Link>
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
          {visible.map((lead) => {
            const busy = isPending && pendingId === lead.id;
            const ballpark =
              lead.estimateMinGbp != null && lead.estimateMaxGbp != null
                ? formatBallparkRange(lead.estimateMinGbp, lead.estimateMaxGbp)
                : null;
            return (
              <li key={lead.id} className="px-4 py-4 sm:px-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-zinc-950">
                        {lead.applicationRef ?? "Planning application"}
                      </span>
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-zinc-600">
                        {PIPELINE_STAGE_LABELS[lead.stage as PipelineStage] ??
                          lead.stage}
                      </span>
                    </div>
                    <p className="truncate text-sm text-zinc-700">
                      {lead.siteAddress ?? "Address unknown"}
                    </p>
                    {lead.description ? (
                      <p className="line-clamp-2 text-sm text-zinc-500">
                        {lead.description}
                      </p>
                    ) : null}
                    {ballpark ? (
                      <p className="text-sm text-zinc-800">
                        Ballpark {ballpark}
                        {lead.estimateWeeks != null
                          ? ` · ${formatBallparkWeeks(lead.estimateWeeks)}`
                          : ""}
                      </p>
                    ) : null}
                    {ballpark ? (
                      <label className="flex items-center gap-2 text-xs text-zinc-600">
                        <input
                          type="checkbox"
                          disabled={busy}
                          checked={lead.includeBallparkInOutreach}
                          onChange={(e) =>
                            updateLead(lead.id, {
                              includeBallparkInOutreach: e.target.checked,
                            })
                          }
                          className="rounded border-zinc-300"
                        />
                        Include ballpark in outreach
                      </label>
                    ) : null}
                    {lead.planningEntity != null ? (
                      <Link
                        href={`/app/dashboard?entity=${lead.planningEntity}`}
                        className="inline-block text-xs font-medium text-zinc-600 underline underline-offset-2 hover:text-zinc-950"
                      >
                        View on map
                      </Link>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                    <label className="flex items-center gap-2 text-xs text-zinc-600">
                      Stage
                      <select
                        disabled={busy}
                        value={lead.stage}
                        onChange={(e) =>
                          updateLead(lead.id, { stage: e.target.value })
                        }
                        className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
                      >
                        {PIPELINE_STAGES.map((s) => (
                          <option key={s} value={s}>
                            {PIPELINE_STAGE_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setPendingId(lead.id);
                        setError(null);
                        startTransition(async () => {
                          try {
                            const res = await fetch(
                              `/api/pipeline/${lead.id}/estimate`,
                              {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ regenerate: true }),
                              },
                            );
                            const data = (await res.json().catch(() => ({}))) as {
                              error?: string;
                              lead?: PipelineLeadRow;
                            };
                            if (!res.ok || !data.lead) {
                              setError(data.error ?? "Estimate failed");
                              return;
                            }
                            setLeads((prev) =>
                              prev.map((l) =>
                                l.id === lead.id ? { ...l, ...data.lead! } : l,
                              ),
                            );
                          } catch {
                            setError("Network error running estimate");
                          } finally {
                            setPendingId(null);
                          }
                        });
                      }}
                      className="rounded-md border border-zinc-300 px-2 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                    >
                      {busy ? "Working…" : ballpark ? "Regenerate estimate" : "Estimate"}
                    </button>
                    {lead.stage === "lost" ? (
                      <input
                        type="text"
                        disabled={busy}
                        placeholder="Lost reason"
                        defaultValue={lead.lostReason ?? ""}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v !== (lead.lostReason ?? "")) {
                            updateLead(lead.id, { lostReason: v || null });
                          }
                        }}
                        className="w-full max-w-xs rounded-md border border-zinc-300 px-2 py-1.5 text-sm sm:w-56"
                      />
                    ) : null}
                    <textarea
                      disabled={busy}
                      placeholder="Notes"
                      defaultValue={lead.notes ?? ""}
                      rows={2}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== (lead.notes ?? "")) {
                          updateLead(lead.id, { notes: v || null });
                        }
                      }}
                      className="w-full max-w-xs rounded-md border border-zinc-300 px-2 py-1.5 text-sm sm:w-56"
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors",
        active
          ? "bg-zinc-950 text-white"
          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-950",
      )}
    >
      {label}
    </button>
  );
}
