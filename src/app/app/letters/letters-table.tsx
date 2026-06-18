"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Loader2,
  Pencil,
  Printer,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LetterEditModal } from "@/components/letter-edit-modal";

type MarkSentWarning = {
  id: string;
  issues: string[];
  variant: "compliance" | "ai";
};

type Row = {
  id: string;
  recipientName: string;
  applicationRef: string | null;
  siteAddress: string | null;
  status: string;
  sentAt: string | null;
  createdAt: string;
  author: string;
  pdfBlobUrl: string | null;
  pendingReminders: number;
};

type LetterDetail = {
  id: string;
  recipientName: string;
  addressLines: string;
  subject: string;
  bodyHtml: string;
  applicationRef: string | null;
  siteAddress: string | null;
  status: string;
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-700",
  printed: "bg-blue-100 text-blue-700",
  sent: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
};

type SortKey = "recipientName" | "applicationRef" | "status" | "author" | "createdAt";
type SortDir = "asc" | "desc";

const PAGE_SIZES = [25, 50, 100] as const;

export function LettersTable({ rows: initial }: { rows: Row[] }) {
  const [rows, setRows] = useState(initial);
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(25);

  const [viewOpen, setViewOpen] = useState(false);
  const [viewLetter, setViewLetter] = useState<LetterDetail | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editLetter, setEditLetter] = useState<LetterDetail | null>(null);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  /** Second step when deleting a letter already marked sent (record-keeping). */
  const [forceDeleteSentLetterId, setForceDeleteSentLetterId] = useState<
    string | null
  >(null);
  const [markSentWarning, setMarkSentWarning] =
    useState<MarkSentWarning | null>(null);

  // Reminder modal state.
  const [reminderLetter, setReminderLetter] = useState<Row | null>(null);
  const [reminderDate, setReminderDate] = useState("");
  const [reminderNote, setReminderNote] = useState(
    "Follow up with the applicant"
  );
  const [reminderSaving, setReminderSaving] = useState(false);

  // Tracks which row's reminder badge should pulse after a successful schedule.
  // Paired with a timestamp so re-setting the same id re-triggers the effect.
  const [pulseTarget, setPulseTarget] = useState<{
    id: string;
    at: number;
  } | null>(null);

  // Per-row action loading state: maps letter id → the action in-flight.
  const [actionLoading, setActionLoading] = useState<
    Record<string, "sent" | "reminder" | "print" | null>
  >({});

  function setLoading(id: string, action: "sent" | "reminder" | "print" | null) {
    setActionLoading((s) => ({ ...s, [id]: action }));
  }

  function openReminder(row: Row) {
    setReminderLetter(row);
    // Default to 1 week from today.
    const d = new Date();
    d.setDate(d.getDate() + 7);
    setReminderDate(d.toISOString().slice(0, 10));
    setReminderNote("Follow up with the applicant");
  }

  function applyReminderPreset(days: number) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    setReminderDate(d.toISOString().slice(0, 10));
  }

  async function submitReminder() {
    if (!reminderLetter || !reminderDate) return;
    setReminderSaving(true);
    try {
      const res = await fetch("/api/reminders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          letterId: reminderLetter.id,
          dueAt: reminderDate,
          note: reminderNote.trim() || "Follow up",
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to schedule reminder");
        return;
      }
      toast.success(
        `Reminder scheduled for ${new Date(reminderDate).toLocaleDateString("en-GB")}`
      );
      const lid = reminderLetter.id;
      setRows((r) =>
        r.map((x) =>
          x.id === lid ? { ...x, pendingReminders: x.pendingReminders + 1 } : x
        )
      );
      setReminderLetter(null);
      setPulseTarget({ id: lid, at: Date.now() });
    } catch (err) {
      toast.error("Failed to schedule reminder");
      console.error("submitReminder error:", err);
    } finally {
      setReminderSaving(false);
    }
  }

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (!q) return true;
      return (
        r.recipientName.toLowerCase().includes(q) ||
        (r.applicationRef ?? "").toLowerCase().includes(q) ||
        (r.siteAddress ?? "").toLowerCase().includes(q)
      );
    });
    list.sort((a, b) => {
      const av = (a[sortKey] ?? "").toLowerCase();
      const bv = (b[sortKey] ?? "").toLowerCase();
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [rows, filter, status, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const paginated = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "createdAt" ? "desc" : "asc");
    }
    setPage(0);
  }

  // Reset to first page when filters change.
  useEffect(() => {
    queueMicrotask(() => setPage(0));
  }, [filter, status]);

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function fetchLetterDetail(id: string): Promise<LetterDetail | null> {
    const res = await fetch(`/api/letter/${id}`);
    if (!res.ok) {
      toast.error("Failed to load letter");
      return null;
    }
    const data = await res.json();
    return data.letter as LetterDetail;
  }

  async function openView(id: string) {
    setViewLoading(true);
    setViewOpen(true);
    const letter = await fetchLetterDetail(id);
    setViewLetter(letter);
    setViewLoading(false);
  }

  async function openEdit(id: string) {
    const letter = await fetchLetterDetail(id);
    setEditLetter(letter);
    if (letter) setEditOpen(true);
  }

  function handleEditSaved(updated: LetterDetail) {
    setRows((r) =>
      r.map((x) =>
        x.id === updated.id
          ? { ...x, recipientName: updated.recipientName, status: updated.status }
          : x
      )
    );
  }

  async function deleteLetter(id: string, force = false) {
    setDeleting(true);
    const url = force ? `/api/letter/${id}?force=true` : `/api/letter/${id}`;
    const res = await fetch(url, { method: "DELETE" });
    if (res.status === 409 && !force) {
      setDeleting(false);
      setDeleteConfirmId(null);
      setForceDeleteSentLetterId(id);
      return;
    }
    setDeleting(false);
    if (!res.ok) {
      toast.error("Failed to delete letter");
      return;
    }
    toast.success("Letter deleted");
    setRows((r) => r.filter((x) => x.id !== id));
    setDeleteConfirmId(null);
    setForceDeleteSentLetterId(null);
  }

  async function bulkDownload() {
    if (selected.size === 0) return;
    const res = await fetch("/api/letter/pdf/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ letterIds: Array.from(selected) }),
    });
    if (!res.ok) {
      toast.error("Bulk generation failed");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `letters-${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function printOne(id: string) {
    setLoading(id, "print");
    try {
      // Open the server-rendered PDF in a new tab. The browser's built-in PDF
      // viewer gives a clean Print dialog (no URL or page-number footer, no
      // browser-generated <title> header) and always matches the emailed PDF.
      window.open(`/api/letter/pdf?id=${id}`, "_blank", "noopener");
      toast.success("Opening letter PDF");
    } finally {
      setLoading(id, null);
    }
  }

  async function markSent(id: string, force = false): Promise<boolean> {
    setLoading(id, "sent");
    const toastId = toast.loading("Marking as sent...");
    try {
      const res = await fetch(`/api/letter/${id}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "sent", force }),
      });

      if (res.status === 409) {
        const data = (await res.json()) as {
          issues?: Array<{ message: string }>;
        };
        toast.dismiss(toastId);
        if (force) {
          toast.error("Could not mark as sent");
          return false;
        }
        const issues =
          data.issues?.map((i) => i.message).filter(Boolean) ?? [];
        setMarkSentWarning({
          id,
          issues: issues.length ? issues : ["Unknown warning"],
          variant: "compliance",
        });
        return false;
      }

      if (res.status === 422) {
        const data = (await res.json()) as {
          issues?: Array<{ message: string }>;
        };
        toast.dismiss(toastId);
        if (force) {
          toast.error("Could not mark as sent");
          return false;
        }
        const issues =
          data.issues?.map((i) => i.message).filter(Boolean) ?? [];
        setMarkSentWarning({
          id,
          issues: issues.length ? issues : ["Unknown issue"],
          variant: "ai",
        });
        return false;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to mark as sent", { id: toastId });
        return false;
      }

      setRows((r) =>
        r.map((x) =>
          x.id === id
            ? { ...x, status: "sent", sentAt: new Date().toISOString() }
            : x
        )
      );
      toast.success("Marked as sent", { id: toastId });
      return true;
    } catch (err) {
      toast.error("Failed to mark as sent", { id: toastId });
      console.error("markSent error:", err);
      return false;
    } finally {
      setLoading(id, null);
    }
  }


  const markSentDialogLoading =
    markSentWarning != null &&
    actionLoading[markSentWarning.id] === "sent";

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={forceDeleteSentLetterId !== null}
        onOpenChange={(next) => {
          if (!next && !deleting) setForceDeleteSentLetterId(null);
        }}
        title="Delete sent letter?"
        description={
          <p>
            This letter is marked as sent and kept for your records. Deleting
            it cannot be undone.
          </p>
        }
        confirmLabel="Delete anyway"
        variant="destructive"
        isLoading={deleting}
        onConfirm={async () => {
          if (forceDeleteSentLetterId) {
            await deleteLetter(forceDeleteSentLetterId, true);
          }
        }}
      />

      <ConfirmDialog
        open={markSentWarning !== null}
        onOpenChange={(next) => {
          if (!next && !markSentDialogLoading) setMarkSentWarning(null);
        }}
        title={
          markSentWarning?.variant === "ai"
            ? "AI compliance flagged this letter"
            : "Compliance warnings"
        }
        description={
          markSentWarning ? (
            <>
              {markSentWarning.variant === "compliance" ? (
                <p className="font-medium text-zinc-800">
                  Warnings were detected:
                </p>
              ) : (
                <p className="font-medium text-zinc-800">
                  The check reported:
                </p>
              )}
              <ul>
                {markSentWarning.issues.map((msg, i) => (
                  <li key={`${i}-${msg.slice(0, 40)}`}>{msg}</li>
                ))}
              </ul>
              <p className="mt-2">
                {markSentWarning.variant === "ai"
                  ? "Mark as sent anyway? If the letter is already posted, this only updates your records."
                  : "Mark as sent anyway?"}
              </p>
            </>
          ) : null
        }
        confirmLabel="Mark as sent"
        isLoading={markSentDialogLoading}
        onConfirm={async () => {
          if (markSentWarning) {
            const ok = await markSent(markSentWarning.id, true);
            if (ok) setMarkSentWarning(null);
          }
        }}
      />

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search recipient, reference, address"
          className="w-72 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="printed">Printed</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
        </select>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-zinc-500">
            {selected.size} selected
          </span>
          <button
            disabled={selected.size === 0}
            onClick={bulkDownload}
            className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            <Download className="h-4 w-4" aria-hidden />
            Download selected (ZIP)
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="w-10 px-3 py-2"></th>
              <SortableHeader label="Recipient" sortKey="recipientName" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHeader label="Reference" sortKey="applicationRef" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHeader label="Status" sortKey="status" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHeader label="Author" sortKey="author" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHeader label="Created" sortKey="createdAt" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((r) => (
              <tr key={r.id} className="border-t border-zinc-100">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                    aria-label={`Select letter for ${r.recipientName}`}
                  />
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium">{r.recipientName}</div>
                  {r.siteAddress && (
                    <div className="text-xs text-zinc-500">{r.siteAddress}</div>
                  )}
                </td>
                <td className="px-3 py-2 text-zinc-600">
                  {r.applicationRef ?? "—"}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      STATUS_COLORS[r.status] ?? "bg-zinc-100 text-zinc-700"
                    )}
                  >
                    {r.status}
                  </span>
                  {r.pendingReminders > 0 && (
                    <ReminderBadge
                      count={r.pendingReminders}
                      pulseKey={
                        pulseTarget?.id === r.id ? pulseTarget.at : null
                      }
                    />
                  )}
                </td>
                <td className="px-3 py-2 text-zinc-600">{r.author}</td>
                <td className="px-3 py-2 text-zinc-600">
                  {new Date(r.createdAt).toLocaleDateString("en-GB")}
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <IconBtn
                      onClick={() => openView(r.id)}
                      label="View letter"
                      icon={<Eye className="h-4 w-4" aria-hidden />}
                    />
                    <IconBtn
                      onClick={() => openEdit(r.id)}
                      label="Edit letter"
                      icon={<Pencil className="h-4 w-4" aria-hidden />}
                    />
                    <IconBtn
                      onClick={() => printOne(r.id)}
                      label="Print PDF"
                      disabled={actionLoading[r.id] === "print"}
                      icon={
                        actionLoading[r.id] === "print" ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                          <Printer className="h-4 w-4" aria-hidden />
                        )
                      }
                    />
                    {r.pdfBlobUrl && (
                      <a
                        href={`/api/letter/${r.id}/stored-pdf`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md p-1.5 text-zinc-600 hover:bg-zinc-100"
                        title="Open stored PDF"
                      >
                        <FileText className="h-4 w-4" aria-hidden />
                      </a>
                    )}
                    {r.status !== "sent" && (
                      <IconBtn
                        onClick={() => markSent(r.id)}
                        label="Mark as sent"
                        disabled={actionLoading[r.id] === "sent"}
                        icon={
                          actionLoading[r.id] === "sent" ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                          ) : (
                            <Check className="h-4 w-4" aria-hidden />
                          )
                        }
                      />
                    )}
                    <IconBtn
                      onClick={() => openReminder(r)}
                      label="Schedule reminder"
                      icon={<Bell className="h-4 w-4" aria-hidden />}
                    />
                    <IconBtn
                      onClick={() => setDeleteConfirmId(r.id)}
                      label="Delete letter"
                      icon={<Trash2 className="h-4 w-4" aria-hidden />}
                      variant="danger"
                    />
                  </div>
                </td>
              </tr>
            ))}
            {paginated.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-12 text-center text-zinc-500">
                  No letters match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-600">
          <div className="flex items-center gap-2">
            <span>
              {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, filtered.length)} of{" "}
              {filtered.length}
            </span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(0);
              }}
              className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs"
            >
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s} per page
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="rounded-md border border-zinc-200 p-1.5 hover:bg-zinc-50 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 text-xs font-medium">
              Page {safePage + 1} of {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              className="rounded-md border border-zinc-200 p-1.5 hover:bg-zinc-50 disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* View Letter Modal */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>View Letter</DialogTitle>
            <DialogDescription>
              {viewLetter?.applicationRef
                ? `Reference: ${viewLetter.applicationRef}`
                : "Letter preview"}
            </DialogDescription>
          </DialogHeader>
          {viewLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
            </div>
          ) : viewLetter ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Recipient
                </p>
                <p className="mt-1 font-medium">{viewLetter.recipientName}</p>
                <p className="whitespace-pre-line text-sm text-zinc-600">
                  {viewLetter.addressLines}
                </p>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Subject
                </p>
                <p className="mt-1 font-medium">{viewLetter.subject}</p>
              </div>
              <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
                {/* Compose the full letter server-side (letterhead + body +
                    signature) so the preview always matches what prints. */}
                <iframe
                  title="Letter preview"
                  src={`/api/letter/${viewLetter.id}/render`}
                  className="h-[min(70vh,900px)] w-full border-0 bg-white"
                />
              </div>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-zinc-500">
              Letter not found.
            </p>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Letter Modal with AI Assist */}
      <LetterEditModal
        letter={editLetter}
        isOpen={editOpen}
        onClose={() => {
          setEditOpen(false);
          setEditLetter(null);
        }}
        onSaved={handleEditSaved}
      />

      {/* Reminder Scheduler Modal */}
      <Dialog
        open={reminderLetter !== null}
        onOpenChange={(open) => !open && setReminderLetter(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule a reminder</DialogTitle>
            <DialogDescription>
              {reminderLetter
                ? `We'll email you to follow up on your letter to ${reminderLetter.recipientName}.`
                : "We'll email you to follow up on this letter."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
                Quick presets
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "In 3 days", days: 3 },
                  { label: "In 1 week", days: 7 },
                  { label: "In 2 weeks", days: 14 },
                  { label: "In 1 month", days: 30 },
                ].map((p) => (
                  <button
                    key={p.days}
                    type="button"
                    onClick={() => applyReminderPreset(p.days)}
                    className="rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label
                htmlFor="reminder-date"
                className="mb-1 block text-sm font-medium text-zinc-700"
              >
                Remind me on
              </label>
              <input
                id="reminder-date"
                type="date"
                value={reminderDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setReminderDate(e.target.value)}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
            </div>

            <div>
              <label
                htmlFor="reminder-note"
                className="mb-1 block text-sm font-medium text-zinc-700"
              >
                Note
              </label>
              <textarea
                id="reminder-note"
                value={reminderNote}
                onChange={(e) => setReminderNote(e.target.value)}
                rows={3}
                placeholder="What should we remind you about?"
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={() => setReminderLetter(null)}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitReminder}
              disabled={reminderSaving || !reminderDate}
              className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {reminderSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              {reminderSaving ? "Scheduling..." : "Schedule reminder"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog
        open={deleteConfirmId !== null}
        onOpenChange={(open) => !open && setDeleteConfirmId(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Letter</DialogTitle>
            <DialogDescription>
              This action cannot be undone. The letter will be permanently
              removed.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={() => setDeleteConfirmId(null)}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => deleteConfirmId && deleteLetter(deleteConfirmId)}
              disabled={deleting}
              className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function IconBtn({
  onClick,
  label,
  icon,
  variant = "default",
  disabled = false,
}: {
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  variant?: "default" | "danger";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        "rounded-md p-1.5 transition-colors",
        disabled && "cursor-not-allowed opacity-50",
        !disabled && variant === "danger" && "text-red-600 hover:bg-red-50",
        !disabled && variant === "default" && "text-zinc-600 hover:bg-zinc-100"
      )}
    >
      {icon}
    </button>
  );
}

/**
 * Reminder badge with a GSAP pulse animation that fires whenever `pulseKey`
 * changes to a non-null value. Used after a reminder is successfully
 * scheduled, to give a bit of tactile confirmation on the bell indicator.
 *
 * Respects `prefers-reduced-motion`: if the user has asked for reduced
 * motion, we skip the tween entirely.
 */
function ReminderBadge({
  count,
  pulseKey,
  title,
}: {
  count: number;
  pulseKey: number | null;
  title?: string;
}) {
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const bellRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (pulseKey == null) return;
    const wrap = wrapRef.current;
    const bell = bellRef.current;
    if (!wrap) return;

    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        wrap,
        { scale: 1 },
        {
          scale: 1.35,
          duration: 0.25,
          ease: "power2.out",
          yoyo: true,
          repeat: 3,
          transformOrigin: "center center",
          onComplete: () => {
            gsap.to(wrap, { scale: 1, duration: 0.2, ease: "power2.out" });
          },
        }
      );
      if (bell) {
        gsap.fromTo(
          bell,
          { rotation: -18 },
          {
            rotation: 18,
            duration: 0.12,
            ease: "sine.inOut",
            yoyo: true,
            repeat: 5,
            transformOrigin: "50% 20%",
            onComplete: () => {
              gsap.to(bell, { rotation: 0, duration: 0.15 });
            },
          }
        );
      }
    }, wrap);

    return () => ctx.revert();
  }, [pulseKey]);

  return (
    <span
      ref={wrapRef}
      className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-amber-700"
      title={title ?? `${count} reminder(s)`}
    >
      <Bell ref={bellRef} className="h-3 w-3" aria-hidden />
      {count}
    </span>
  );
}

function SortableHeader({
  label,
  sortKey: key,
  currentKey,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const active = currentKey === key;
  return (
    <th className="px-3 py-2 text-left">
      <button
        type="button"
        onClick={() => onSort(key)}
        className="group inline-flex items-center gap-1 hover:text-zinc-900"
      >
        {label}
        {active ? (
          dir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-0 group-hover:opacity-50" />
        )}
      </button>
    </th>
  );
}
