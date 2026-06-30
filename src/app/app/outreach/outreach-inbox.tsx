"use client";

/**
 * Outreach approval inbox. Lists AgentApprovals with a split view: the left
 * pane shows the queue, the right pane shows the draft letter alongside
 * metadata and an optional email-compose preview tab.
 */

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Sparkles,
  Clock,
  Inbox,
  Loader2,
  Mail,
  MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ResearchBriefingCard } from "@/components/research-briefing-card";
import { sanitizeHtmlFragment } from "@/lib/sanitize-html";
import {
  defaultPreviewChannel,
  emailSourceLabel,
  recipientEmail,
  type OutreachDraftDisplay,
  type PreviewChannel,
} from "@/lib/outreach-draft-display";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Issue = {
  severity: "error" | "warn";
  code: string;
  message: string;
};

type Approval = {
  id: string;
  status: string;
  kind: string;
  subjectRef: string | null;
  planningEntity: number | null;
  draft: unknown;
  issues: unknown;
  confidence: number | null;
  createdAt: string;
  model: string | null;
  costGbp: number | null;
  sentTo?: string | null;
  sentAt?: string | null;
  sentChannel?: string | null;
};

const STATUS_FILTERS = [
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "sent", label: "Sent" },
  { id: "rejected", label: "Rejected" },
  { id: "all", label: "All" },
];

export function OutreachInbox({
  canSendProspectEmail,
  companyName,
  replyToEmail,
  initialApprovals,
  counts,
}: {
  canSendProspectEmail: boolean;
  companyName: string;
  replyToEmail: string | null;
  initialApprovals: Approval[];
  counts: Record<string, number>;
}) {
  const [approvals, setApprovals] = useState(initialApprovals);
  const [filter, setFilter] = useState<string>("pending");
  const [hasEmailOnly, setHasEmailOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialApprovals.find((a) => a.status === "pending")?.id ??
      initialApprovals[0]?.id ??
      null,
  );
  const [previewChannel, setPreviewChannel] = useState<PreviewChannel>("email");
  const [busy, setBusy] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [rejectionNote, setRejectionNote] = useState("");

  const visible = useMemo(() => {
    let list =
      filter === "all" ? approvals : approvals.filter((a) => a.status === filter);
    if (hasEmailOnly) {
      list = list.filter((a) => Boolean(recipientEmail(a.draft as OutreachDraftDisplay)));
    }
    return list;
  }, [filter, hasEmailOnly, approvals]);

  const selected = visible.find((a) => a.id === selectedId) ?? null;

  const selectedDraft = (selected?.draft as OutreachDraftDisplay | null) ?? null;
  const selectedIssues = (selected?.issues as Issue[] | null) ?? null;
  const selectedRecipientEmail = recipientEmail(selectedDraft);
  const selectedEmailSource = emailSourceLabel(selectedDraft);

  useEffect(() => {
    if (visible.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !visible.some((a) => a.id === selectedId)) {
      setSelectedId(visible[0].id);
    }
  }, [visible, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const approval = approvals.find((a) => a.id === selectedId);
    const draft = (approval?.draft as OutreachDraftDisplay | null) ?? null;
    setPreviewChannel(defaultPreviewChannel(draft));
  }, [selectedId]);

  const rejectInFlight = busy && rejectDialogOpen;

  async function act(
    id: string,
    action: "approve" | "reject" | "send_email",
    note?: string,
  ): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch(`/api/ai/approvals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, rejectionNote: note }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      toast.success(
        action === "approve"
          ? "Approved — letter added to your drafts"
          : action === "send_email"
            ? "Approved — email sent"
            : "Rejected",
      );
      setApprovals((prev) =>
        prev.map((a) =>
          a.id === id
            ? {
                ...a,
                status:
                  action === "approve"
                    ? "approved"
                    : action === "send_email"
                      ? "sent"
                      : "rejected",
                sentTo: action === "send_email" ? json.sentTo ?? a.sentTo : a.sentTo,
                sentAt:
                  action === "send_email" ? new Date().toISOString() : a.sentAt,
                sentChannel:
                  action === "send_email" ? "email" : a.sentChannel,
              }
            : a,
        ),
      );
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  function openRejectDialog() {
    if (!selected) return;
    setRejectTargetId(selected.id);
    setRejectionNote("");
    setRejectDialogOpen(true);
  }

  async function confirmRejectDraft() {
    if (!rejectTargetId) return;
    const trimmed = rejectionNote.trim();
    const ok = await act(rejectTargetId, "reject", trimmed || undefined);
    if (ok) {
      setRejectDialogOpen(false);
      setRejectTargetId(null);
      setRejectionNote("");
    }
  }

  const mapHref =
    selected?.planningEntity != null
      ? `/app/dashboard?entity=${selected.planningEntity}`
      : "/app/dashboard";

  return (
    <>
      <Dialog
        open={rejectDialogOpen}
        onOpenChange={(open) => {
          if (rejectInFlight && !open) return;
          setRejectDialogOpen(open);
          if (!open) {
            setRejectionNote("");
            setRejectTargetId(null);
          }
        }}
      >
        <DialogContent
          className="sm:max-w-md [&>button.absolute]:hidden"
          onPointerDownOutside={(e) => {
            if (rejectInFlight) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (rejectInFlight) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>Reject this draft?</DialogTitle>
            <DialogDescription>
              Optionally add a short note for your records. Your team sees this on
              the rejection in Plott — it is not sent to the recipient.
            </DialogDescription>
          </DialogHeader>
          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-zinc-700">Reason (optional)</span>
            <textarea
              value={rejectionNote}
              onChange={(e) => setRejectionNote(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="e.g. Tone mismatch, factual concern, duplicate lead…"
              disabled={rejectInFlight}
              className="resize-y rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none placeholder:text-zinc-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50"
            />
          </label>
          <DialogFooter className="gap-2 sm:gap-0">
            <button
              type="button"
              onClick={() => setRejectDialogOpen(false)}
              disabled={rejectInFlight}
              className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void confirmRejectDraft()}
              disabled={rejectInFlight}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {rejectInFlight ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Please wait
                </>
              ) : (
                "Reject draft"
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(280px,320px)_1fr]">
        <aside className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center gap-1.5 border-b border-zinc-100 p-3">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                  filter === f.id
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-600 hover:bg-zinc-100",
                )}
              >
                {f.label}
                {counts[f.id] != null && f.id !== "all" ? (
                  <span className="ml-1 opacity-60">{counts[f.id]}</span>
                ) : null}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setHasEmailOnly((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                hasEmailOnly
                  ? "bg-indigo-600 text-white"
                  : "text-zinc-600 hover:bg-zinc-100",
              )}
            >
              <Mail className="h-3 w-3" />
              Has email
            </button>
          </div>

          <div className="max-h-[70vh] overflow-y-auto">
            {visible.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center text-sm text-zinc-500">
                <Inbox className="mb-2 h-8 w-8 text-zinc-300" />
                Nothing in this queue.
              </div>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {visible.map((a) => {
                  const draft = a.draft as OutreachDraftDisplay | null;
                  const isActive = a.id === selectedId;
                  const rowEmail = recipientEmail(draft);
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(a.id)}
                        className={cn(
                          "block w-full px-3 py-2.5 text-left transition-colors",
                          isActive ? "bg-indigo-50" : "hover:bg-zinc-50",
                        )}
                      >
                        <div className="flex items-center justify-between text-[11px] text-zinc-500">
                          <span className="font-mono">
                            {a.subjectRef ?? `#${a.planningEntity}`}
                          </span>
                          <StatusPill status={a.status} />
                        </div>
                        <p className="mt-1 line-clamp-1 text-sm font-medium text-zinc-900">
                          {draft?.recipient?.name ?? "Unknown recipient"}
                        </p>
                        <p className="line-clamp-1 text-xs text-zinc-500">
                          {draft?.subject ?? "(no subject)"}
                        </p>
                        {rowEmail ? (
                          <p className="mt-1 flex items-center gap-1 line-clamp-1 text-[11px] text-indigo-700">
                            <Mail className="h-3 w-3 shrink-0" aria-hidden />
                            <span className="truncate">{rowEmail}</span>
                          </p>
                        ) : (
                          <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                            Letter only
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        <section className="min-w-0 min-h-[60vh] rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          {!selected ? (
            <p className="text-sm text-zinc-500">Select an approval to review.</p>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-zinc-900">
                    {selectedDraft?.subject ?? "(no subject)"}
                  </h2>
                  <p className="text-xs text-zinc-500">
                    To: {selectedDraft?.recipient?.name ?? "Unknown"} · Ref{" "}
                    {selected.subjectRef ?? `#${selected.planningEntity}`}
                  </p>
                </div>
                <div className="flex max-w-sm flex-col items-end">
                  <p className="flex items-start justify-end gap-1.5 text-right text-xs leading-snug text-zinc-600">
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />
                    Please read before approving.
                  </p>
                </div>
              </div>

              {selectedIssues && selectedIssues.length > 0 && (
                <div className="mb-4 space-y-2">
                  <p className="text-xs text-zinc-600">
                    Manual review of the draft is required.
                  </p>
                  <div className="space-y-1">
                    {selectedIssues.map((issue, i) => (
                      <div
                        key={`${issue.code}-${i}`}
                        className={cn(
                          "flex items-start gap-2 rounded-md border px-3 py-2 text-xs",
                          issue.severity === "error"
                            ? "border-red-200 bg-red-50 text-red-900"
                            : "border-amber-200 bg-amber-50 text-amber-900",
                        )}
                      >
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                        <div>
                          <strong>{issueSeverityLabel(issue.severity)}: </strong>
                          {issue.message}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!selectedRecipientEmail && (
                <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  No email found — approve as a postal letter only.{" "}
                  <Link
                    href={mapHref}
                    className="font-medium text-amber-950 underline underline-offset-2 hover:text-amber-800"
                  >
                    View applicant on map
                  </Link>
                </div>
              )}

              {selectedRecipientEmail && !canSendProspectEmail && (
                <div className="mb-4 rounded-md border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
                  Email address found, but prospect email outreach is disabled for
                  this workspace.{" "}
                  <Link
                    href="/app/settings/notifications"
                    className="font-medium text-indigo-950 underline underline-offset-2 hover:text-indigo-800"
                  >
                    Enable in Settings → Notifications
                  </Link>{" "}
                  to send by email, or approve as a letter below.
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
                <div className="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
                  <div className="border-b border-zinc-200 bg-white px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      Message preview
                    </p>
                    <p className="mt-1 text-xs text-zinc-600">
                      One drafted message — send by email or save as a printable
                      letter.
                    </p>
                    <div className="mt-3 flex gap-1 rounded-lg border border-zinc-200 bg-zinc-50 p-1">
                      <ChannelTab
                        active={previewChannel === "email"}
                        disabled={!selectedRecipientEmail}
                        onClick={() => setPreviewChannel("email")}
                        icon={<Mail className="h-3.5 w-3.5" />}
                        label="Email"
                      />
                      <ChannelTab
                        active={previewChannel === "letter"}
                        onClick={() => setPreviewChannel("letter")}
                        icon={<MapPin className="h-3.5 w-3.5" />}
                        label="Letter"
                      />
                    </div>
                  </div>

                  {previewChannel === "email" && selectedRecipientEmail ? (
                    <OutreachMessageHeader
                      companyName={companyName}
                      replyToEmail={replyToEmail}
                      recipientEmail={selectedRecipientEmail}
                      recipientName={selectedDraft?.recipient?.name}
                      subject={selectedDraft?.subject}
                      sourceLabel={selectedEmailSource}
                    />
                  ) : null}

                  <article
                    className={cn(
                      "prose prose-sm max-w-none p-4",
                      previewChannel === "email" && selectedRecipientEmail
                        ? "bg-white"
                        : "bg-zinc-50",
                    )}
                    dangerouslySetInnerHTML={{
                      __html: sanitizeHtmlFragment(selectedDraft?.bodyHtml ?? ""),
                    }}
                  />
                </div>

                <aside className="space-y-3">
                  {selectedDraft?.recipient?.addressLines && (
                    <div className="rounded-md border border-zinc-200 bg-white p-3">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                        Address
                      </p>
                      <pre className="whitespace-pre-wrap text-xs text-zinc-700">
                        {selectedDraft.recipient.addressLines}
                      </pre>
                    </div>
                  )}
                  {selectedRecipientEmail && (
                    <div className="rounded-md border border-zinc-200 bg-white p-3">
                      <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                        <Mail className="h-3 w-3" />
                        Email
                      </p>
                      <p className="break-all text-xs text-zinc-700">
                        {selectedRecipientEmail}
                      </p>
                      {selectedEmailSource ? (
                        <p className="mt-1 text-[11px] text-zinc-500">
                          {selectedEmailSource}
                        </p>
                      ) : null}
                    </div>
                  )}
                  {selected?.sentChannel === "email" && selected.sentTo ? (
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-800">
                        Sent by email
                      </p>
                      <p className="break-all text-xs text-emerald-900">
                        {selected.sentTo}
                      </p>
                      {selected.sentAt ? (
                        <p className="mt-1 text-[11px] text-emerald-800">
                          {new Date(selected.sentAt).toLocaleString("en-GB")}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {(selectedDraft?.enrichment?.applicantName ||
                    selectedDraft?.enrichment?.agentName) && (
                    <ResearchBriefingCard
                      displayName={
                        selectedDraft.enrichment.agentName ||
                        selectedDraft.enrichment.applicantName
                      }
                      hint={
                        selected.subjectRef
                          ? `Planning application ${selected.subjectRef}`
                          : undefined
                      }
                    />
                  )}
                  <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-400">
                    <Clock className="h-3 w-3" />
                    Generated {new Date(selected.createdAt).toLocaleString("en-GB")}
                  </p>
                </aside>
              </div>

              {selected.status === "pending" ? (
                <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-zinc-100 pt-4">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={openRejectDialog}
                    className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    <XCircle className="h-4 w-4" />
                    Reject
                  </button>
                  {selectedRecipientEmail && canSendProspectEmail ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void act(selected.id, "approve")}
                        className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Approve &amp; draft letter
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void act(selected.id, "send_email")}
                        className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        <Mail className="h-4 w-4" />
                        Approve &amp; send email
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void act(selected.id, "approve")}
                      className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Approve &amp; draft letter
                    </button>
                  )}
                </div>
              ) : (
                <p className="mt-5 border-t border-zinc-100 pt-4 text-sm text-zinc-500">
                  Status: <StatusPill status={selected.status} />. No further
                  actions available.
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}

function OutreachMessageHeader({
  companyName,
  replyToEmail,
  recipientEmail: toEmail,
  recipientName,
  subject,
  sourceLabel,
}: {
  companyName: string;
  replyToEmail: string | null;
  recipientEmail: string;
  recipientName?: string;
  subject?: string;
  sourceLabel: string | null;
}) {
  return (
    <div className="divide-y divide-zinc-100 border-b border-zinc-200 bg-white text-sm">
      <HeaderRow label="From">
        <span className="font-medium text-zinc-900">{companyName}</span>
      </HeaderRow>
      {replyToEmail ? (
        <HeaderRow label="Reply-to">
          <span className="text-zinc-700">{replyToEmail}</span>
        </HeaderRow>
      ) : null}
      <HeaderRow label="To">
        <span className="font-medium text-zinc-900">
          {recipientName ? `${recipientName} · ` : ""}
          <span className="font-normal text-indigo-700">{toEmail}</span>
        </span>
        {sourceLabel ? (
          <span className="mt-0.5 block text-[11px] text-zinc-500">{sourceLabel}</span>
        ) : null}
      </HeaderRow>
      <HeaderRow label="Subject">
        <span className="font-medium text-zinc-900">{subject ?? "(no subject)"}</span>
      </HeaderRow>
    </div>
  );
}

function HeaderRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1 px-4 py-2.5 sm:grid-cols-[72px_1fr] sm:items-start sm:gap-3">
      <span className="text-xs font-medium text-zinc-500">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function ChannelTab({
  active,
  disabled,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-white text-zinc-900 shadow-sm"
          : "text-zinc-600 hover:text-zinc-900",
        disabled && "cursor-not-allowed opacity-40",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function issueSeverityLabel(severity: Issue["severity"]): string {
  return severity === "error" ? "Must review" : "Heads-up";
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-amber-100 text-amber-900",
    approved: "bg-emerald-100 text-emerald-900",
    sent: "bg-indigo-100 text-indigo-900",
    rejected: "bg-zinc-200 text-zinc-700",
  };
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        map[status] ?? "bg-zinc-200 text-zinc-700",
      )}
    >
      {status}
    </span>
  );
}
