"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  type PipelineStage,
  formatBallparkRange,
  formatBallparkWeeks,
} from "@/lib/pipeline-shared";
import type { PipelineLeadRow, PipelineTeamMember } from "@/lib/pipeline-display";
import { cn } from "@/lib/utils";
import {
  PulseIndicator,
  ShimmerBar,
  WaveformLoader,
} from "@/components/ui/loading-indicators";

export type { PipelineTeamMember };

type StageFilter = "all" | PipelineStage;
type AssignmentFilter = "all" | "assigned_to_me" | "unassigned" | "by_member";

export function PipelineBoard({
  currentUserId,
  initialLeads,
  teamMembers,
}: {
  currentUserId: string;
  initialLeads: PipelineLeadRow[];
  teamMembers: PipelineTeamMember[];
}) {
  const searchParams = useSearchParams();
  const highlightLeadId = searchParams.get("lead");
  const highlightRef = useRef<HTMLLIElement | null>(null);

  const [leads, setLeads] = useState(initialLeads);
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");
  const [assignmentFilter, setAssignmentFilter] =
    useState<AssignmentFilter>("all");
  const [memberFilterId, setMemberFilterId] = useState<string>("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [estimatingId, setEstimatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!highlightLeadId || !highlightRef.current) return;
    highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightLeadId, leads.length]);

  const visible = useMemo(() => {
    let list = leads;
    if (stageFilter !== "all") {
      list = list.filter((lead) => lead.stage === stageFilter);
    }
    if (assignmentFilter === "assigned_to_me") {
      list = list.filter((lead) => lead.assignedUserId === currentUserId);
    } else if (assignmentFilter === "unassigned") {
      list = list.filter((lead) => !lead.assignedUserId);
    } else if (assignmentFilter === "by_member" && memberFilterId) {
      list = list.filter((lead) => lead.assignedUserId === memberFilterId);
    }
    return list;
  }, [
    leads,
    stageFilter,
    assignmentFilter,
    memberFilterId,
    currentUserId,
  ]);

  function applyLeadUpdate(id: string, next: PipelineLeadRow) {
    setLeads((prev) => prev.map((lead) => (lead.id === id ? next : lead)));
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

  function assigneeLabel(member: PipelineTeamMember): string {
    return member.name?.trim() || member.email || "Team member";
  }

  const assignedToMeCount = leads.filter(
    (lead) => lead.assignedUserId === currentUserId,
  ).length;
  const unassignedCount = leads.filter((lead) => !lead.assignedUserId).length;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <FilterChip
            active={stageFilter === "all"}
            onClick={() => setStageFilter("all")}
            label={`All (${leads.length})`}
          />
          {PIPELINE_STAGES.map((stage) => {
            const count = leads.filter((lead) => lead.stage === stage).length;
            return (
              <FilterChip
                key={stage}
                active={stageFilter === stage}
                onClick={() => setStageFilter(stage)}
                label={`${PIPELINE_STAGE_LABELS[stage]} (${count})`}
              />
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FilterChip
            active={assignmentFilter === "all"}
            onClick={() => {
              setAssignmentFilter("all");
              setMemberFilterId("");
            }}
            label="Everyone"
          />
          <FilterChip
            active={assignmentFilter === "assigned_to_me"}
            onClick={() => {
              setAssignmentFilter("assigned_to_me");
              setMemberFilterId("");
            }}
            label={`Assigned to me (${assignedToMeCount})`}
          />
          <FilterChip
            active={assignmentFilter === "unassigned"}
            onClick={() => {
              setAssignmentFilter("unassigned");
              setMemberFilterId("");
            }}
            label={`Unassigned (${unassignedCount})`}
          />
          {teamMembers.length > 1 ? (
            <label className="inline-flex items-center gap-2 text-xs text-zinc-600">
              <span className="font-medium uppercase tracking-wide">
                Teammate
              </span>
              <select
                value={
                  assignmentFilter === "by_member" ? memberFilterId : ""
                }
                onChange={(e) => {
                  const value = e.target.value;
                  if (!value) {
                    setAssignmentFilter("all");
                    setMemberFilterId("");
                    return;
                  }
                  setAssignmentFilter("by_member");
                  setMemberFilterId(value);
                }}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
              >
                <option value="">Any teammate</option>
                {teamMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {assigneeLabel(member)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {visible.length === 0 ? (
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
          {visible.map((lead) => {
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
                        value={lead.assignedUserId ?? ""}
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
                        <option value="">Unassigned</option>
                        {teamMembers.map((member) => (
                          <option key={member.id} value={member.id}>
                            {assigneeLabel(member)}
                          </option>
                        ))}
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
