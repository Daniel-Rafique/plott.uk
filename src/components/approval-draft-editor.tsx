"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { RichTextEditor } from "@/components/rich-text-editor";
import { PulseIndicator } from "@/components/ui/loading-indicators";
import {
  emailBodyHtml,
  emailSubject,
  letterBodyHtml,
  letterSubject,
  type OutreachDraftDisplay,
  type PreviewChannel,
} from "@/lib/outreach-draft-display";

type ViewMode = "preview" | "edit";

export type ApprovalDraftPatch = Partial<
  Pick<
    OutreachDraftDisplay,
    "subject" | "letterBodyHtml" | "emailBodyHtml" | "emailSubject" | "bodyHtml"
  >
>;

type Props = {
  approvalId: string;
  channel: PreviewChannel;
  draft: OutreachDraftDisplay;
  canEdit: boolean;
  onSaved: (patch: ApprovalDraftPatch) => void;
};

export function ApprovalDraftEditor({
  approvalId,
  channel,
  draft,
  canEdit,
  onSaved,
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("preview");
  const [previewSrcDoc, setPreviewSrcDoc] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const savedLetterBody = letterBodyHtml(draft);
  const savedEmailBody = emailBodyHtml(draft);
  const savedLetterSubject = letterSubject(draft);
  const savedEmailSubject = emailSubject(draft);

  const [letterBody, setLetterBody] = useState<string | null>(null);
  const [emailBody, setEmailBody] = useState<string | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [emailSubj, setEmailSubj] = useState<string | null>(null);

  useEffect(() => {
    setLetterBody(null);
    setEmailBody(null);
    setSubject(null);
    setEmailSubj(null);
    setViewMode("preview");
  }, [approvalId, channel]);

  const currentLetterBody = letterBody ?? savedLetterBody;
  const currentEmailBody = emailBody ?? savedEmailBody;
  const currentSubject = subject ?? savedLetterSubject;
  const currentEmailSubject = emailSubj ?? savedEmailSubject;

  const hasChanges =
    (letterBody !== null && letterBody !== savedLetterBody) ||
    (emailBody !== null && emailBody !== savedEmailBody) ||
    (subject !== null && subject !== savedLetterSubject) ||
    (emailSubj !== null && emailSubj !== savedEmailSubject);

  const previewPayload = useMemo(() => {
    if (channel === "letter") {
      return {
        letterBodyHtml: currentLetterBody,
        subject: currentSubject,
      };
    }
    return {
      emailBodyHtml: currentEmailBody,
      emailSubject: currentEmailSubject,
    };
  }, [
    channel,
    currentLetterBody,
    currentEmailBody,
    currentSubject,
    currentEmailSubject,
  ]);

  const previewIframeKey = useMemo(() => {
    if (!previewSrcDoc) return previewLoading ? "loading" : "empty";
    return `${previewSrcDoc.length}-${channel}`;
  }, [previewSrcDoc, previewLoading, channel]);

  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const res = await fetch(
        `/api/ai/approvals/${approvalId}/preview?channel=${channel}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(previewPayload),
        },
      );
      if (!res.ok) throw new Error("Preview failed");
      const html = await res.text();
      setPreviewSrcDoc(html);
    } catch {
      setPreviewSrcDoc("");
    } finally {
      setPreviewLoading(false);
    }
  }, [approvalId, channel, previewPayload]);

  useEffect(() => {
    if (viewMode !== "preview") return;
    const timer = window.setTimeout(() => {
      void loadPreview();
    }, hasChanges ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [viewMode, loadPreview, hasChanges]);

  async function handleSave() {
    if (!hasChanges) return;
    setSaving(true);
    try {
      const payload: Record<string, string> = { action: "update_draft" };
      if (letterBody !== null) payload.letterBodyHtml = letterBody;
      if (emailBody !== null) payload.emailBodyHtml = emailBody;
      if (subject !== null) payload.subject = subject;
      if (emailSubj !== null) payload.emailSubject = emailSubj;

      const res = await fetch(`/api/ai/approvals/${approvalId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save");

      const patch: ApprovalDraftPatch = {};
      if (letterBody !== null) {
        patch.letterBodyHtml = letterBody;
        patch.bodyHtml = letterBody;
      }
      if (emailBody !== null) patch.emailBodyHtml = emailBody;
      if (subject !== null) patch.subject = subject;
      if (emailSubj !== null) patch.emailSubject = emailSubj;

      onSaved(patch);
      setLetterBody(null);
      setEmailBody(null);
      setSubject(null);
      setEmailSubj(null);
      toast.success("Draft saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
          <div className="flex rounded-md border border-zinc-200 bg-zinc-50 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("preview")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors",
                viewMode === "preview"
                  ? "bg-white text-zinc-900 shadow-sm"
                  : "text-zinc-600 hover:text-zinc-900",
              )}
            >
              <Eye className="h-3.5 w-3.5" aria-hidden />
              Preview
            </button>
            <button
              type="button"
              onClick={() => setViewMode("edit")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors",
                viewMode === "edit"
                  ? "bg-white text-zinc-900 shadow-sm"
                  : "text-zinc-600 hover:text-zinc-900",
              )}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              Edit
            </button>
          </div>
          {hasChanges ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="ml-auto inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  Saving…
                </>
              ) : (
                "Save draft"
              )}
            </button>
          ) : null}
        </div>
      ) : null}

      {viewMode === "preview" || !canEdit ? (
        <div className="overflow-hidden bg-white">
          {previewLoading && !previewSrcDoc ? (
            <div className="flex h-[min(70vh,900px)] items-center justify-center">
              <PulseIndicator label="Composing preview" />
            </div>
          ) : (
            <iframe
              key={previewIframeKey}
              title={`${channel} preview`}
              srcDoc={previewSrcDoc}
              className="h-[min(70vh,900px)] w-full border-0 bg-white"
            />
          )}
        </div>
      ) : (
        <div className="space-y-3 px-4 pb-4">
          {channel === "email" ? (
            <label className="grid gap-1">
              <span className="text-xs font-medium text-zinc-600">
                Email subject
              </span>
              <input
                type="text"
                value={currentEmailSubject}
                onChange={(e) => setEmailSubj(e.target.value)}
                className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
              />
            </label>
          ) : (
            <label className="grid gap-1">
              <span className="text-xs font-medium text-zinc-600">
                Letter subject
              </span>
              <input
                type="text"
                value={currentSubject}
                onChange={(e) => setSubject(e.target.value)}
                className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
              />
            </label>
          )}
          <RichTextEditor
            value={channel === "letter" ? currentLetterBody : currentEmailBody}
            onChange={(html) =>
              channel === "letter" ? setLetterBody(html) : setEmailBody(html)
            }
            placeholder={
              channel === "letter"
                ? "Body only — letterhead and signature are added automatically…"
                : "Email message body…"
            }
          />
          {hasChanges ? (
            <p className="text-center text-[11px] text-zinc-500">
              Unsaved changes — save draft before approving
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function hasUnsavedDraftEdits(
  channel: PreviewChannel,
  draft: OutreachDraftDisplay,
  edits: {
    letterBody: string | null;
    emailBody: string | null;
    subject: string | null;
    emailSubj: string | null;
  },
): boolean {
  return (
    (edits.letterBody !== null && edits.letterBody !== letterBodyHtml(draft)) ||
    (edits.emailBody !== null && edits.emailBody !== emailBodyHtml(draft)) ||
    (edits.subject !== null && edits.subject !== letterSubject(draft)) ||
    (edits.emailSubj !== null && edits.emailSubj !== emailSubject(draft))
  );
}
