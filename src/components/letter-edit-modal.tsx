"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Pencil, Printer, Sparkles, Eye } from "lucide-react";
import { LetterAssistDrawer } from "./letter-assist-drawer";
import { RichTextEditor } from "./rich-text-editor";
import { BallparkPanel } from "./ballpark-panel";
import {
  replaceBallparkInHtml,
  stripBallparkFromHtml,
} from "@/lib/ballpark-html";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PulseIndicator } from "./ui/loading-indicators";

type LetterData = {
  id: string;
  recipientName: string;
  addressLines: string;
  subject: string;
  /** Body-only HTML — paragraphs between salutation and sign-off. */
  bodyHtml: string;
  applicationRef: string | null;
  siteAddress: string | null;
  planningEntity?: number | null;
  status: string;
};

type Props = {
  letter: LetterData | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (letter: LetterData) => void;
};

type ViewMode = "preview" | "edit";

export function LetterEditModal({ letter, isOpen, onClose, onSaved }: Props) {
  const [letterHtml, setLetterHtml] = useState<string | null>(null);
  const [assistOpen, setAssistOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("preview");
  const [previewSrcDoc, setPreviewSrcDoc] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);

  const currentBody = letterHtml ?? letter?.bodyHtml ?? "";

  const hasChanges = letterHtml !== null && letterHtml !== letter?.bodyHtml;

  const previewIframeKey = useMemo(() => {
    if (!previewSrcDoc) return previewLoading ? "loading" : "empty";
    let h = 0;
    const s = previewSrcDoc;
    for (let i = 0; i < s.length; i++) {
      h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    }
    return `${s.length}-${h}`;
  }, [previewSrcDoc, previewLoading]);

  useEffect(() => {
    if (!letter || !isOpen || viewMode !== "preview") return;
    let cancelled = false;
    queueMicrotask(() => setPreviewLoading(true));
    void fetch(`/api/letter/${letter.id}/render`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bodyHtml: currentBody }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Preview failed");
        const html = await res.text();
        if (!cancelled) setPreviewSrcDoc(html);
      })
      .catch(() => {
        if (!cancelled) setPreviewSrcDoc("");
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [letter, isOpen, viewMode, currentBody]);

  function handleOpenChange(open: boolean) {
    if (!open) {
      setLetterHtml(null);
      setAssistOpen(false);
      setViewMode("preview");
      setPreviewSrcDoc("");
      onClose();
    }
  }

  async function handleSave() {
    if (!letter || !hasChanges) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/letter/${letter.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bodyHtml: letterHtml }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success("Letter saved");
      onSaved?.({ ...letter, bodyHtml: letterHtml!, status: "draft" });
      setLetterHtml(null);
      onClose();
    } catch {
      toast.error("Failed to save letter");
    } finally {
      setSaving(false);
    }
  }

  function handlePrint() {
    if (!letter) return;
    if (hasChanges) {
      toast.message("Save your changes to print the latest version");
      return;
    }
    window.open(`/api/letter/pdf?id=${letter.id}`, "_blank", "noopener");
  }

  function applyBallpark(args: {
    minGbp: number;
    maxGbp: number;
    weeks: number;
    include: boolean;
  }) {
    const next = args.include
      ? replaceBallparkInHtml(currentBody, args)
      : stripBallparkFromHtml(currentBody);
    setLetterHtml(next);
    setViewMode("edit");
    toast.success(
      args.include
        ? "Ballpark inserted — save when ready"
        : "Ballpark removed — save when ready",
    );
  }

  if (!letter) {
    return (
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <p className="text-sm text-zinc-600">No letter selected.</p>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="relative max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <p className="editorial-chapter-label text-zinc-500">Edit letter</p>
          <DialogTitle className="text-lg font-semibold">
            {letter.recipientName}
          </DialogTitle>
          <DialogDescription>
            {letter.applicationRef
              ? `Reference: ${letter.applicationRef}`
              : letter.siteAddress ?? "Outreach letter"}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Recipient
            </p>
            <p className="mt-1 font-medium">{letter.recipientName}</p>
            <p className="whitespace-pre-line text-sm text-zinc-600">
              {letter.addressLines}
            </p>
          </div>

          <BallparkPanel
            planningEntity={letter.planningEntity}
            applicationRef={letter.applicationRef}
            siteAddress={letter.siteAddress}
            onApplyBallpark={applyBallpark}
          />

          <div>
            <p className="editorial-chapter-label mb-2 text-zinc-500">
              Letter content
            </p>
            <div className="flex flex-wrap items-center gap-2">
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

              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
              >
                <Printer className="h-4 w-4" aria-hidden />
                Print
              </button>
              <button
                type="button"
                onClick={() => setAssistOpen(true)}
                className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                <Sparkles className="h-4 w-4" aria-hidden />
                AI assist
              </button>
              {hasChanges && (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="ml-auto inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {saving && <PulseIndicator tone="inverse" label="Saving" />}
                  {saving ? "Saving…" : "Save changes"}
                </button>
              )}
            </div>
          </div>

          {viewMode === "preview" ? (
            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
              {previewLoading && !previewSrcDoc ? (
                <div className="flex h-[600px] items-center justify-center">
                  <PulseIndicator label="Composing preview" />
                </div>
              ) : (
                <iframe
                  key={previewIframeKey}
                  title="Letter preview"
                  srcDoc={previewSrcDoc}
                  className="h-[min(70vh,900px)] w-full border-0 bg-white"
                />
              )}
            </div>
          ) : (
            <RichTextEditor
              value={currentBody}
              onChange={(html) => setLetterHtml(html)}
              placeholder="Write the body of your letter (no letterhead or signature — those are added automatically)…"
            />
          )}

          {hasChanges && (
            <p className="editorial-chapter-label text-center text-zinc-500">
              Unsaved changes · click &ldquo;Save changes&rdquo; to keep them
            </p>
          )}
        </div>

        <LetterAssistDrawer
          open={assistOpen}
          onOpenChange={setAssistOpen}
          currentHtml={currentBody}
          reference={letter.applicationRef ?? ""}
          siteAddress={letter.siteAddress ?? ""}
          onApply={(next) => setLetterHtml(next)}
        />
      </DialogContent>
    </Dialog>
  );
}
