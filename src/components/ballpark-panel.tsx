"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  formatBallparkRange,
  formatBallparkWeeks,
} from "@/lib/pipeline-shared";
import { cn } from "@/lib/utils";

export type BallparkLead = {
  id: string;
  estimateMinGbp: number | null;
  estimateMaxGbp: number | null;
  estimateWeeks: number | null;
  includeBallparkInOutreach: boolean;
};

type Props = {
  planningEntity: number | null | undefined;
  applicationRef?: string | null;
  siteAddress?: string | null;
  description?: string | null;
  /** When set, show Apply / Remove actions that sync HTML bodies. */
  onApplyBallpark?: (args: {
    minGbp: number;
    maxGbp: number;
    weeks: number;
    include: boolean;
  }) => void | Promise<void>;
  className?: string;
  compact?: boolean;
};

export function BallparkPanel({
  planningEntity,
  applicationRef,
  siteAddress,
  description,
  onApplyBallpark,
  className,
  compact,
}: Props) {
  const [lead, setLead] = useState<BallparkLead | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [minGbp, setMinGbp] = useState("");
  const [maxGbp, setMaxGbp] = useState("");
  const [weeks, setWeeks] = useState("");

  useEffect(() => {
    if (planningEntity == null) {
      setLead(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetch(`/api/pipeline?planningEntity=${planningEntity}`)
      .then((res) => res.json())
      .then((json: { lead?: BallparkLead | null }) => {
        if (!cancelled) setLead(json.lead ?? null);
      })
      .catch(() => {
        if (!cancelled) setLead(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [planningEntity]);

  useEffect(() => {
    if (!lead) {
      setMinGbp("");
      setMaxGbp("");
      setWeeks("");
      return;
    }
    setMinGbp(
      lead.estimateMinGbp != null ? String(lead.estimateMinGbp) : "",
    );
    setMaxGbp(
      lead.estimateMaxGbp != null ? String(lead.estimateMaxGbp) : "",
    );
    setWeeks(
      lead.estimateWeeks != null ? String(lead.estimateWeeks) : "",
    );
  }, [lead]);

  async function ensureLead(): Promise<BallparkLead | null> {
    if (lead) return lead;
    if (planningEntity == null) return null;
    const res = await fetch("/api/pipeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planningEntity,
        applicationRef: applicationRef ?? null,
        siteAddress: siteAddress ?? null,
        description: description ?? null,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      lead?: BallparkLead;
    };
    if (!res.ok || !json.lead) {
      throw new Error(json.error ?? "Could not create pipeline lead");
    }
    setLead(json.lead);
    return json.lead;
  }

  async function patchLead(patch: Partial<BallparkLead>) {
    const current = await ensureLead();
    if (!current) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/pipeline/${current.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        lead?: BallparkLead;
      };
      if (!res.ok || !json.lead) {
        toast.error(json.error ?? "Could not update estimate");
        return;
      }
      setLead(json.lead);
      setEditing(false);
    } catch {
      toast.error("Network error updating estimate");
    } finally {
      setBusy(false);
    }
  }

  async function saveManualFigures() {
    const min = Number(minGbp);
    const max = Number(maxGbp);
    const w = Number(weeks);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < 0) {
      toast.error("Enter valid £ amounts");
      return;
    }
    if (min > max) {
      toast.error("Minimum cannot exceed maximum");
      return;
    }
    if (!Number.isFinite(w) || w < 0) {
      toast.error("Enter a valid weeks value");
      return;
    }
    await patchLead({
      estimateMinGbp: Math.round(min),
      estimateMaxGbp: Math.round(max),
      estimateWeeks: Math.round(w * 10) / 10,
    });
  }

  async function regenerate() {
    setBusy(true);
    try {
      const current = await ensureLead();
      if (!current) {
        toast.error("No planning application linked");
        return;
      }
      const res = await fetch(`/api/pipeline/${current.id}/estimate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate: true }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        lead?: BallparkLead;
      };
      if (!res.ok || !json.lead) {
        toast.error(json.error ?? "Estimate failed");
        return;
      }
      setLead(json.lead);
      setEditing(false);
      toast.success("Estimate updated");
    } catch {
      toast.error("Network error running estimate");
    } finally {
      setBusy(false);
    }
  }

  async function handleApply(include: boolean) {
    if (!onApplyBallpark) return;
    if (
      include &&
      (!lead ||
        lead.estimateMinGbp == null ||
        lead.estimateMaxGbp == null ||
        lead.estimateWeeks == null)
    ) {
      toast.error("Generate or enter an estimate first");
      return;
    }
    setBusy(true);
    try {
      if (lead && lead.includeBallparkInOutreach !== include) {
        const res = await fetch(`/api/pipeline/${lead.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ includeBallparkInOutreach: include }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          lead?: BallparkLead;
        };
        if (!res.ok || !json.lead) {
          toast.error(json.error ?? "Could not update include setting");
          return;
        }
        setLead(json.lead);
      }
      await onApplyBallpark({
        minGbp: lead?.estimateMinGbp ?? 0,
        maxGbp: lead?.estimateMaxGbp ?? 0,
        weeks: lead?.estimateWeeks ?? 0,
        include,
      });
    } finally {
      setBusy(false);
    }
  }

  if (planningEntity == null) return null;

  if (loading) {
    return (
      <div
        className={cn(
          "rounded-md border border-zinc-200 bg-white p-3 text-xs text-zinc-500",
          className,
        )}
      >
        Loading estimate…
      </div>
    );
  }

  const hasFigures =
    lead?.estimateMinGbp != null && lead?.estimateMaxGbp != null;

  return (
    <div
      className={cn(
        "rounded-md border border-zinc-200 bg-white p-3 space-y-2",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Ballpark estimate
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void regenerate()}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-600 hover:text-zinc-900 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="h-3 w-3" aria-hidden />
          )}
          {hasFigures ? "Regenerate" : "Estimate"}
        </button>
      </div>

      {hasFigures && !editing ? (
        <p className="text-xs text-zinc-800">
          {formatBallparkRange(lead!.estimateMinGbp!, lead!.estimateMaxGbp!)}
          {lead!.estimateWeeks != null
            ? ` · ${formatBallparkWeeks(lead!.estimateWeeks)}`
            : ""}
        </p>
      ) : null}

      {editing || !hasFigures ? (
        <div className="grid grid-cols-3 gap-2">
          <label className="grid gap-0.5 text-[10px] text-zinc-500">
            Min £
            <input
              type="number"
              min={0}
              value={minGbp}
              disabled={busy}
              onChange={(e) => setMinGbp(e.target.value)}
              className="rounded border border-zinc-300 px-1.5 py-1 text-xs text-zinc-900"
            />
          </label>
          <label className="grid gap-0.5 text-[10px] text-zinc-500">
            Max £
            <input
              type="number"
              min={0}
              value={maxGbp}
              disabled={busy}
              onChange={(e) => setMaxGbp(e.target.value)}
              className="rounded border border-zinc-300 px-1.5 py-1 text-xs text-zinc-900"
            />
          </label>
          <label className="grid gap-0.5 text-[10px] text-zinc-500">
            Weeks
            <input
              type="number"
              min={0}
              step={0.5}
              value={weeks}
              disabled={busy}
              onChange={(e) => setWeeks(e.target.value)}
              className="rounded border border-zinc-300 px-1.5 py-1 text-xs text-zinc-900"
            />
          </label>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {hasFigures && !editing ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => setEditing(true)}
            className="text-[11px] font-medium text-zinc-600 underline underline-offset-2 hover:text-zinc-900 disabled:opacity-50"
          >
            Edit figures
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveManualFigures()}
            className="rounded-md bg-zinc-900 px-2 py-1 text-[11px] font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            Save figures
          </button>
        )}
        {editing && hasFigures ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => setEditing(false)}
            className="text-[11px] text-zinc-500 hover:text-zinc-800"
          >
            Cancel
          </button>
        ) : null}
      </div>

      {hasFigures ? (
        <label className="flex items-center gap-2 text-[11px] text-zinc-600">
          <input
            type="checkbox"
            checked={lead!.includeBallparkInOutreach}
            disabled={busy}
            onChange={(e) =>
              void patchLead({ includeBallparkInOutreach: e.target.checked })
            }
            className="rounded border-zinc-300"
          />
          Include in outreach
        </label>
      ) : (
        <p className="text-[11px] text-zinc-500">
          Run an AI estimate or enter figures manually.
        </p>
      )}

      {onApplyBallpark && hasFigures ? (
        <div className={cn("flex flex-wrap gap-2", compact ? "pt-0" : "pt-1")}>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleApply(true)}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
          >
            Apply to message
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleApply(false)}
            className="rounded-md border border-transparent px-2 py-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-800 disabled:opacity-50"
          >
            Remove from message
          </button>
        </div>
      ) : null}
    </div>
  );
}
