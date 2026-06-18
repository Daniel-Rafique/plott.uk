"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Trash2,
  MapPinned,
  Sparkles,
  AlertTriangle,
  Lock,
  LayoutDashboard,
} from "lucide-react";
import { toast } from "sonner";
import { gsap } from "gsap";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const PAGE_SIZE = 6;

function confidenceToOption(value: number | null): string {
  if (value === null) return "review";
  if (value <= 0.15) return "safe";
  return "most";
}

function optionToConfidence(option: string): number | null {
  switch (option) {
    case "safe":
      return 0.15;
    case "most":
      return 0.35;
    default:
      return null;
  }
}

function digestFrequencyLabel(
  f: "daily" | "weekly" | "monthly" | "quarterly",
): string {
  switch (f) {
    case "daily":
      return "Daily";
    case "weekly":
      return "Weekly";
    case "monthly":
      return "Monthly";
    case "quarterly":
      return "Quarterly";
    default:
      return f;
  }
}

function pulseDigestSaved(el: HTMLElement | null) {
  if (!el) return;
  gsap.fromTo(
    el,
    { scale: 1 },
    {
      scale: 1.06,
      duration: 0.16,
      ease: "power2.out",
      yoyo: true,
      repeat: 1,
      transformOrigin: "center center",
    },
  );
}

function PaginationControls({
  page,
  totalPages,
  onPageChange,
  label,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  label: string;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-3 py-2">
      <p className="text-xs font-medium text-zinc-500">
        {label} page {page + 1} of {totalPages}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 0}
          onClick={() => onPageChange(Math.max(0, page - 1))}
          className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Previous
        </button>
        <button
          type="button"
          disabled={page >= totalPages - 1}
          onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
          className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

type SavedSearch = {
  id: string;
  name: string;
  bbox: { west: number; south: number; east: number; north: number };
  frequency: string;
  lastRunAt: string | null;
  lastRunCount: number;
  notifyEmails: string[];
  autoOutreach: boolean;
  autoApproveBelowConfidence: number | null;
};

type Usage = {
  current: number;
  limit: number;
  planName: string;
};

export function SavedSearchesClient({
  initial,
  usage,
  canAutoOutreach,
}: {
  initial: SavedSearch[];
  usage: Usage;
  /** True only for Agency tier — controls auto-draft UI */
  canAutoOutreach: boolean;
}) {
  const [rows, setRows] = useState(initial);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [savedPage, setSavedPage] = useState(0);
  const digestControlRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const atLimit = usage.current >= usage.limit;

  const deleteTarget = deleteId ? rows.find((r) => r.id === deleteId) : null;
  const savedTotalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentSavedPage = Math.min(savedPage, savedTotalPages - 1);
  const visibleRows = useMemo(
    () =>
      rows.slice(
        currentSavedPage * PAGE_SIZE,
        currentSavedPage * PAGE_SIZE + PAGE_SIZE,
      ),
    [currentSavedPage, rows],
  );

  async function confirmRemove() {
    if (!deleteId) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/saved-searches/${deleteId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setRows((r) => r.filter((x) => x.id !== deleteId));
        setSavedPage((page) => Math.max(0, Math.min(page, savedTotalPages - 1)));
        toast.success("Saved search removed");
        setDeleteId(null);
      } else {
        toast.error("Could not delete saved search");
      }
    } finally {
      setDeleteLoading(false);
    }
  }

  async function setFrequency(
    id: string,
    frequency: "daily" | "weekly" | "monthly" | "quarterly",
  ) {
    const res = await fetch(`/api/saved-searches/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frequency }),
    });
    if (res.ok) {
      setRows((r) =>
        r.map((x) => (x.id === id ? { ...x, frequency } : x)),
      );
      pulseDigestSaved(digestControlRefs.current.get(id) ?? null);
      toast.success(
        `Email digest: ${digestFrequencyLabel(frequency)} — saved`,
        { duration: 3200 },
      );
    } else {
      toast.error("Could not update digest schedule");
    }
  }

  async function patch(id: string, payload: Partial<SavedSearch>) {
    const res = await fetch(`/api/saved-searches/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      setRows((r) => r.map((x) => (x.id === id ? { ...x, ...payload } : x)));
      toast.success("Saved");
    } else {
      toast.error("Could not update saved search");
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center">
        <MapPinned className="mx-auto h-10 w-10 text-zinc-300" aria-hidden />
        <p className="mt-4 text-sm font-medium text-zinc-800">
          No saved searches yet
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          On the dashboard, draw or pan to an area, then press{" "}
          <span className="font-medium">Save this area</span>.
        </p>
        <Link
          href="/app/dashboard"
          className="mt-6 inline-flex rounded-full bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
        >
          Open dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(next) => {
          if (!deleteLoading && !next) setDeleteId(null);
        }}
        title="Delete saved search?"
        description={
          deleteTarget ? (
            <>
              <p>
                This stops email digests for{" "}
                <span className="font-medium text-zinc-800">
                  {deleteTarget.name}
                </span>
                . You can save the area again from the dashboard later.
              </p>
            </>
          ) : (
            "This saved search will be removed."
          )
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="destructive"
        isLoading={deleteLoading}
        onConfirm={confirmRemove}
      />
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1.5">
          <MapPinned className="h-4 w-4 text-zinc-500" />
          <span className="text-sm font-medium text-zinc-700">
            {usage.current} / {usage.limit} saved searches
          </span>
          <span className="text-xs text-zinc-500">({usage.planName})</span>
        </div>
      </div>

      {atLimit && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
          <div className="flex-1 text-sm">
            <p className="font-medium text-amber-900">Saved search limit reached</p>
            <p className="mt-0.5 text-amber-700">
              Your {usage.planName} plan includes {usage.limit} saved search{usage.limit !== 1 ? "es" : ""}.
              Upgrade to Agency to monitor more areas.
            </p>
            <Link
              href="/app/settings/billing"
              className="mt-2 inline-block rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
            >
              Review billing options
            </Link>
          </div>
        </div>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Saved searches
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Area and filter digests for new planning opportunities.
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-600">
            No saved searches yet. Open the dashboard to save a map area.
          </div>
        ) : (
          <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleRows.map((r) => (
              <div
                key={r.id}
                className="flex min-h-[13rem] flex-col rounded-xl border border-zinc-200 bg-white shadow-sm transition-shadow hover:shadow-md"
              >
            {/* Card header */}
            <div className="flex items-start justify-between gap-2 border-b border-zinc-100 px-4 py-3">
              <div className="min-w-0 flex-1">
                <h3
                  className="truncate text-sm font-semibold text-zinc-900"
                  title={`${r.bbox.west.toFixed(4)}, ${r.bbox.south.toFixed(4)} → ${r.bbox.east.toFixed(4)}, ${r.bbox.north.toFixed(4)}`}
                >
                  {r.name}
                </h3>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <div
                  ref={(el) => {
                    if (el) digestControlRefs.current.set(r.id, el);
                    else digestControlRefs.current.delete(r.id);
                  }}
                  className="rounded-md"
                >
                  <select
                    value={r.frequency}
                    onChange={(e) =>
                      setFrequency(
                        r.id,
                        e.target.value as
                          | "daily"
                          | "weekly"
                          | "monthly"
                          | "quarterly",
                      )
                    }
                    className="rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-1 text-[11px] font-medium text-zinc-700"
                  >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => setDeleteId(r.id)}
                  className="rounded-md p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                  aria-label="Delete saved search"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            </div>

            {/* Card body */}
            <div className="flex flex-1 flex-col gap-3 px-4 py-3">
              <div className="space-y-1 text-[11px] text-zinc-500">
                <p>
                  Last run:{" "}
                  {r.lastRunAt
                    ? new Date(r.lastRunAt).toLocaleString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "never"}
                </p>
                <p>
                  {r.lastRunCount} lead{r.lastRunCount !== 1 ? "s" : ""} ·{" "}
                  {r.notifyEmails.length
                    ? r.notifyEmails.join(", ")
                    : "no notifications"}
                </p>
              </div>

              <Link
                href={`/app/dashboard?savedSearch=${encodeURIComponent(r.id)}`}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 py-1.5 text-xs font-medium text-zinc-800 transition-colors hover:border-zinc-300 hover:bg-zinc-100"
              >
                <LayoutDashboard className="h-3.5 w-3.5 shrink-0" aria-hidden />
                View search
              </Link>

              {/* Auto-outreach toggle */}
              {canAutoOutreach ? (
                <div className="mt-auto rounded-lg border border-indigo-100 bg-indigo-50/40 p-2.5">
                  <label className="flex items-center gap-2 text-[11px] font-medium text-indigo-900">
                    <input
                      type="checkbox"
                      checked={r.autoOutreach}
                      onChange={(e) =>
                        patch(r.id, { autoOutreach: e.target.checked })
                      }
                      className="h-3.5 w-3.5"
                    />
                    <Sparkles className="h-3 w-3 shrink-0" />
                    <span className="leading-tight">
                      Draft letters and emails for review
                    </span>
                  </label>
                  {r.autoOutreach ? (
                    <div className="mt-2 space-y-2 pl-[22px]">
                      <p className="rounded-md bg-white/80 px-2 py-1 text-[10px] font-medium text-indigo-800 ring-1 ring-indigo-100">
                        Review queue: letters + email drafts
                      </p>
                      <select
                        value={confidenceToOption(r.autoApproveBelowConfidence)}
                        onChange={(e) => {
                          patch(r.id, {
                            autoApproveBelowConfidence: optionToConfidence(
                              e.target.value,
                            ),
                          });
                        }}
                        className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px]"
                      >
                        <option value="review">
                          Review every letter draft
                        </option>
                        <option value="safe">
                          Auto-create low-risk letter drafts
                        </option>
                        <option value="most">
                          Auto-create most letter drafts
                        </option>
                      </select>
                      <p className="text-[10px] leading-relaxed text-indigo-700">
                        Emails always stay in Outreach for human approval before
                        sending.
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-auto rounded-lg border border-zinc-200 bg-zinc-50 p-2.5">
                  <div className="flex items-center gap-2 text-[11px] font-medium text-zinc-500">
                    <Lock className="h-3 w-3 shrink-0" />
                    <Sparkles className="h-3 w-3 shrink-0" />
                    <span className="leading-tight">
                      Draft letters and emails for review
                    </span>
                  </div>
                  <p className="mt-1.5 text-[10px] leading-relaxed text-zinc-500">
                    Autonomous outreach requires the{" "}
                    <Link href="/app/settings/billing" className="font-medium text-zinc-700 underline underline-offset-2 hover:text-zinc-900">
                      Agency plan
                    </Link>
                  </p>
                </div>
              )}
            </div>
          </div>
            ))}
          </div>
          <PaginationControls
            page={currentSavedPage}
            totalPages={savedTotalPages}
            onPageChange={setSavedPage}
            label="Saved searches"
          />
          </>
        )}
      </section>
    </div>
  );
}
