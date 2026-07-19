"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_PIPELINE_PAGE_SIZE,
  PIPELINE_PAGE_SIZES,
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  type PipelinePageSize,
  type PipelineStage,
  type PipelineStageFilter,
  formatBallparkRange,
  formatBallparkWeeks,
  pipelineTotalPages,
} from "@/lib/pipeline-shared";
import type { PipelineLeadRow, PipelineTeamMember } from "@/lib/pipeline-display";
import { cn } from "@/lib/utils";
import {
  PulseIndicator,
  ShimmerBar,
  WaveformLoader,
} from "@/components/ui/loading-indicators";

export type { PipelineTeamMember };

export function PipelineBoard({
  currentUserId,
  initialLeads,
  teamMembers,
  total,
  page,
  pageSize,
  stageFilter,
  assigneeScope,
  stageCounts,
}: {
  currentUserId: string;
  initialLeads: PipelineLeadRow[];
  teamMembers: PipelineTeamMember[];
  total: number;
  page: number;
  pageSize: PipelinePageSize;
  stageFilter: PipelineStageFilter;
  assigneeScope: string;
  stageCounts: Record<string, number>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const highlightLeadId = searchParams.get("lead");
  const highlightRef = useRef<HTMLLIElement | null>(null);

  const [leads, setLeads] = useState(initialLeads);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [estimatingId, setEstimatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const didDefaultAssign = useRef(false);

  useEffect(() => {
    setLeads(initialLeads);
  }, [initialLeads]);

  useEffect(() => {
    if (!highlightLeadId || !highlightRef.current) return;
    highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightLeadId, leads.length]);

  function assigneeLabel(member: PipelineTeamMember): string {
    return member.name?.trim() || member.email || "Team member";
  }

  function applyLeadUpdate(id: string, next: PipelineLeadRow) {
    setLeads((prev) => prev.map((lead) => (lead.id === id ? next : lead)));
  }

  function replaceQuery(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value == null || value === "") {
        params.delete(key);
        continue;
      }
      // Omit defaults to keep URLs clean.
      if (key === "page" && value === "1") {
        params.delete(key);
        continue;
      }
      if (key === "pageSize" && value === String(DEFAULT_PIPELINE_PAGE_SIZE)) {
        params.delete(key);
        continue;
      }
      if (key === "stage" && value === "all") {
        params.delete(key);
        continue;
      }
      if (key === "assignee" && value === "me") {
        params.delete(key);
        continue;
      }
      params.set(key, value);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  function patchLead(
    id: string,
    patch: Record<string, unknown>,
    successMessage?: string,
  ) {
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
          toast.error(data.error ?? "Could not update lead");
          return;
        }
        applyLeadUpdate(id, data.lead);
        if (successMessage) toast.success(successMessage);
      } catch {
        setError("Network error updating lead");
        toast.error("Network error updating lead");
      } finally {
        setPendingId(null);
      }
    });
  }

  // New leads default to the current user, not Unassigned.
  useEffect(() => {
    if (didDefaultAssign.current) return;
    const unassigned = initialLeads.filter((lead) => !lead.assignedUserId);
    if (unassigned.length === 0) {
      didDefaultAssign.current = true;
      return;
    }
    didDefaultAssign.current = true;

    void (async () => {
      await Promise.all(
        unassigned.map(async (lead) => {
          try {
            const res = await fetch(`/api/pipeline/${lead.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ assignedUserId: currentUserId }),
            });
            const data = (await res.json().catch(() => ({}))) as {
              lead?: PipelineLeadRow;
            };
            if (res.ok && data.lead) {
              applyLeadUpdate(lead.id, data.lead);
            }
          } catch {
            // Non-blocking — user can still assign manually.
          }
        }),
      );
    })();
  }, [currentUserId, initialLeads, teamMembers]);

  const sortedTeamMembers = useMemo(() => {
    const me = teamMembers.find((member) => member.id === currentUserId);
    const others = teamMembers.filter((member) => member.id !== currentUserId);
    return me ? [me, ...others] : others;
  }, [teamMembers, currentUserId]);

  const totalPages = pipelineTotalPages(total, pageSize);
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  const selectClassName =
    "rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="grid gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              Stage
            </span>
            <select
              value={stageFilter}
              onChange={(e) =>
                replaceQuery({
                  stage: e.target.value,
                  page: "1",
                })
              }
              className={cn(selectClassName, "min-w-[11rem]")}
            >
              <option value="all">All stages ({stageCounts.all ?? 0})</option>
              {PIPELINE_STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {PIPELINE_STAGE_LABELS[stage]} ({stageCounts[stage] ?? 0})
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              Assigned to
            </span>
            <select
              value={assigneeScope}
              onChange={(e) =>
                replaceQuery({
                  assignee: e.target.value,
                  page: "1",
                })
              }
              className={cn(selectClassName, "min-w-[12rem]")}
            >
              <option value="me">Me</option>
              <option value="all">Everyone</option>
              <option value="unassigned">Unassigned</option>
              {sortedTeamMembers
                .filter((member) => member.id !== currentUserId)
                .map((member) => (
                  <option key={member.id} value={member.id}>
                    {assigneeLabel(member)}
                  </option>
                ))}
            </select>
          </label>
        </div>

        <p className="text-sm text-zinc-500">
          {total === 0
            ? "0 leads"
            : `${rangeStart}–${rangeEnd} of ${total} lead${total === 1 ? "" : "s"}`}
        </p>
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {leads.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 px-6 py-12 text-center">
          <p className="text-sm font-medium text-zinc-900">No leads match</p>
          <p className="mt-1 text-sm text-zinc-600">
            Try a different stage or assignment filter, or{" "}
            <Link href="/app/dashboard" className="underline underline-offset-2">
              open the map
            </Link>{" "}
            to find new applications.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
          {leads.map((lead) => {
            const busy = isPending && pendingId === lead.id;
            const estimating = estimatingId === lead.id;
            const ballpark =
              lead.estimateMinGbp != null && lead.estimateMaxGbp != null
                ? formatBallparkRange(lead.estimateMinGbp, lead.estimateMaxGbp)
                : null;
            const highlighted = highlightLeadId === lead.id;

            return (
              <li
                key={lead.id}
                ref={highlighted ? highlightRef : undefined}
                className={cn(
                  "px-4 py-4 sm:px-5",
                  highlighted && "bg-amber-50/80 ring-1 ring-inset ring-amber-200",
                )}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-zinc-950">
                        {lead.applicationRef ?? "Planning application"}
                      </span>
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-zinc-600">
                        {PIPELINE_STAGE_LABELS[lead.stage as PipelineStage] ??
                          lead.stage}
                      </span>
                      {lead.assignedUser ? (
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-800">
                          {assigneeLabel(lead.assignedUser)}
                        </span>
                      ) : null}
                      {lead.contact.personRole ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-900">
                          {lead.contact.personRole}
                        </span>
                      ) : null}
                    </div>

                    <p className="truncate text-sm text-zinc-700">
                      {lead.siteAddress ?? "Address unknown"}
                    </p>

                    <dl className="grid gap-1 text-sm text-zinc-600">
                      <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                        <dt className="font-medium text-zinc-700">Applicant</dt>
                        <dd>
                          {lead.contact.applicantName ?? "Unknown applicant"}
                        </dd>
                      </div>
                      {lead.contact.applicantAddress ? (
                        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                          <dt className="font-medium text-zinc-700">Address</dt>
                          <dd>{lead.contact.applicantAddress}</dd>
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                        <dt className="font-medium text-zinc-700">Email</dt>
                        <dd>
                          {lead.contact.primaryEmail ? (
                            <span className="inline-flex flex-wrap items-center gap-2">
                              <a
                                href={`mailto:${lead.contact.primaryEmail}`}
                                className="font-medium text-zinc-900 underline underline-offset-2 hover:text-zinc-600"
                              >
                                {lead.contact.primaryEmail}
                              </a>
                              {lead.contact.primaryEmailLabel ? (
                                <span className="text-xs text-zinc-500">
                                  {lead.contact.primaryEmailLabel}
                                </span>
                              ) : null}
                            </span>
                          ) : (
                            <span className="text-zinc-500">
                              No email on file
                            </span>
                          )}
                        </dd>
                      </div>
                      {lead.contact.agentName ? (
                        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                          <dt className="font-medium text-zinc-700">Agent</dt>
                          <dd>
                            {lead.contact.agentName}
                            {lead.contact.agentEmail ? (
                              <>
                                {" · "}
                                <a
                                  href={`mailto:${lead.contact.agentEmail}`}
                                  className="underline underline-offset-2 hover:text-zinc-900"
                                >
                                  {lead.contact.agentEmail}
                                </a>
                              </>
                            ) : null}
                          </dd>
                        </div>
                      ) : null}
                      {lead.workTypeLabel ? (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <dt className="font-medium text-zinc-700">Work type</dt>
                          <dd>
                            <span className="inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-800">
                              {lead.workTypeLabel}
                            </span>
                          </dd>
                        </div>
                      ) : lead.description ? (
                        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                          <dt className="font-medium text-zinc-700">Proposal</dt>
                          <dd className="line-clamp-2 text-zinc-500">
                            {lead.description}
                          </dd>
                        </div>
                      ) : null}
                    </dl>

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
                            patchLead(lead.id, {
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

                  <div className="flex w-full min-w-0 shrink-0 flex-col gap-2 sm:max-w-xs sm:items-end">
                    <label className="flex w-full items-center gap-2 text-xs text-zinc-600 sm:justify-end">
                      Assigned to
                      <select
                        disabled={busy}
                        value={lead.assignedUserId ?? currentUserId}
                        onChange={(e) => {
                          const value = e.target.value;
                          const nextId = value || null;
                          const member = teamMembers.find((m) => m.id === value);
                          patchLead(
                            lead.id,
                            { assignedUserId: nextId },
                            nextId
                              ? member
                                ? `Assigned to ${assigneeLabel(member)}`
                                : "Lead assigned"
                              : "Assignment cleared",
                          );
                        }}
                        className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 sm:max-w-[12rem]"
                      >
                        {sortedTeamMembers.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.id === currentUserId
                              ? `${assigneeLabel(member)} (you)`
                              : assigneeLabel(member)}
                          </option>
                        ))}
                        <option value="">Unassigned</option>
                      </select>
                    </label>
                    <label className="flex items-center gap-2 text-xs text-zinc-600">
                      Stage
                      <select
                        disabled={busy}
                        value={lead.stage}
                        onChange={(e) =>
                          patchLead(lead.id, { stage: e.target.value })
                        }
                        className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
                      >
                        {PIPELINE_STAGES.map((stage) => (
                          <option key={stage} value={stage}>
                            {PIPELINE_STAGE_LABELS[stage]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setPendingId(lead.id);
                        setEstimatingId(lead.id);
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
                              toast.error(data.error ?? "Estimate failed");
                              return;
                            }
                            applyLeadUpdate(lead.id, data.lead);
                          } catch {
                            setError("Network error running estimate");
                            toast.error("Network error running estimate");
                          } finally {
                            setPendingId(null);
                            setEstimatingId(null);
                          }
                        });
                      }}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-zinc-300 px-2 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60 sm:w-auto"
                    >
                      {estimating ? (
                        <PulseIndicator tone="ai" label="Estimating" />
                      ) : null}
                      {estimating
                        ? "Estimating…"
                        : ballpark
                          ? "Regenerate estimate"
                          : "Estimate"}
                    </button>
                    {estimating ? (
                      <div className="w-full space-y-2 rounded-md border border-indigo-100 bg-indigo-50/30 p-2.5 sm:max-w-xs">
                        <p className="flex items-center gap-2 text-xs text-zinc-600">
                          <WaveformLoader tone="ai" label="Summarising application" />
                          Summarising the application…
                        </p>
                        <div className="space-y-1.5">
                          <ShimmerBar height={10} width="100%" />
                          <ShimmerBar height={10} width="82%" />
                          <ShimmerBar height={10} width="64%" />
                        </div>
                      </div>
                    ) : null}
                    {lead.stage === "lost" ? (
                      <input
                        type="text"
                        disabled={busy}
                        placeholder="Lost reason"
                        defaultValue={lead.lostReason ?? ""}
                        onBlur={(e) => {
                          const value = e.target.value.trim();
                          if (value !== (lead.lostReason ?? "")) {
                            patchLead(lead.id, { lostReason: value || null });
                          }
                        }}
                        className="w-full min-w-0 rounded-md border border-zinc-300 px-2 py-1.5 text-sm sm:w-56"
                      />
                    ) : null}
                    <textarea
                      disabled={busy}
                      placeholder="Notes"
                      defaultValue={lead.notes ?? ""}
                      rows={2}
                      onBlur={(e) => {
                        const value = e.target.value.trim();
                        if (value !== (lead.notes ?? "")) {
                          patchLead(lead.id, { notes: value || null });
                        }
                      }}
                      className="w-full min-w-0 rounded-md border border-zinc-300 px-2 py-1.5 text-sm sm:w-56"
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-600">
          <div className="flex items-center gap-2">
            <span>
              {rangeStart}–{rangeEnd} of {total}
            </span>
            <select
              value={pageSize}
              onChange={(e) =>
                replaceQuery({
                  pageSize: e.target.value,
                  page: "1",
                })
              }
              className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs"
            >
              {PIPELINE_PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size} per page
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => replaceQuery({ page: String(page - 1) })}
              className="rounded-md border border-zinc-200 p-1.5 hover:bg-zinc-50 disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 text-xs font-medium">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => replaceQuery({ page: String(page + 1) })}
              className="rounded-md border border-zinc-200 p-1.5 hover:bg-zinc-50 disabled:opacity-40"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
