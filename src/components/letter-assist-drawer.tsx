"use client";

/**
 * Letter assist side drawer. Pairs with the letter preview to let the user
 * request rewrites ("make more formal", "shorter", custom instructions) and
 * see a streaming preview before applying.
 *
 * The drawer operates on body-only HTML — the paragraphs between the
 * salutation and sign-off. Letterhead, signature and footer are composed
 * server-side and are never shown here; the parent modal renders the full
 * composed letter separately via /api/letter/[id]/render.
 */

import { useEffect, useRef, useState } from "react";
import { Sparkles, X, Check, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { sanitizeHtmlFragment } from "@/lib/sanitize-html";
import { normalizeLetterBodyHtml } from "@/lib/letter-body-shape";
import posthog from "posthog-js";
import { WaveformLoader } from "./ui/loading-indicators";

type Preset = { id: string; label: string };

const PRESETS: Preset[] = [
  { id: "formal", label: "More formal" },
  { id: "concise", label: "Shorter" },
  { id: "friendly", label: "Warmer" },
  { id: "plain_english", label: "Plain English" },
  { id: "stronger_cta", label: "Stronger CTA" },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentHtml: string;
  reference?: string;
  siteAddress?: string;
  onApply: (newHtml: string) => void;
};

export function LetterAssistDrawer({
  open,
  onOpenChange,
  currentHtml,
  reference,
  siteAddress,
  onApply,
}: Props) {
  const [instruction, setInstruction] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [draftHtml, setDraftHtml] = useState("");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open) return;
    const resetTimer = window.setTimeout(() => {
      abortRef.current?.abort();
      abortRef.current = null;
      setStreaming(false);
      setDraftHtml("");
      setError(null);
    }, 0);
    return () => window.clearTimeout(resetTimer);
  }, [open]);

  async function rewrite(preset?: string) {
    const text = preset ?? instruction.trim();
    if (!text || streaming) return;
    setError(null);
    setDraftHtml("");
    setStreaming(true);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/ai/letter-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          html: currentHtml,
          instruction: text,
          reference,
          siteAddress,
        }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      if (!res.body) throw new Error("No response stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        setDraftHtml(buffer);
      }
      buffer += decoder.decode();
      setDraftHtml(stripFences(buffer));
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError((e as Error).message);
      toast.error((e as Error).message);
    } finally {
      setStreaming(false);
    }
  }

  function apply() {
    if (!draftHtml.trim()) return;
    posthog.capture("letter_ai_assist_applied", {
      instruction: instruction.trim() || undefined,
      reference,
    });
    onApply(
      normalizeLetterBodyHtml(stripFences(draftHtml), {
        siteAddress,
      }),
    );
    toast.success("Applied AI rewrite");
    onOpenChange(false);
  }

  function cancel() {
    abortRef.current?.abort();
    setStreaming(false);
  }

  if (!open) return null;

  const drawerContent = (
    <div
      role="dialog"
      aria-label="Letter assist"
      className="absolute inset-0 z-[100] flex"
    >
      <button
        type="button"
        aria-label="Close assistant"
        onClick={() => onOpenChange(false)}
        className="flex-1 bg-black/30 backdrop-blur-[1px]"
      />
      <aside className="flex h-full w-full max-w-xl flex-col border-l border-zinc-200 bg-white font-sans shadow-2xl">
        <header className="flex items-start justify-between border-b border-zinc-200 px-5 py-4">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-1 h-4 w-4 text-zinc-500" />
            <div>
              <p className="editorial-chapter-label text-zinc-500">
                AI assist
              </p>
              <h2 className="font-[family-name:var(--font-display)] text-[20px] font-normal leading-tight tracking-tight text-zinc-950">
                Rewrite this letter
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <div>
            <p className="editorial-chapter-label mb-2 text-zinc-500">
              Quick edits
            </p>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={streaming}
                  onClick={() => void rewrite(p.id)}
                  className="rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs text-zinc-700 transition-colors hover:border-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              htmlFor="assist-instruction"
              className="editorial-chapter-label mb-1 block text-zinc-500"
            >
              Or describe the edit in your own words
            </label>
            <textarea
              id="assist-instruction"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="e.g. Mention we're the appointed architect, and offer a free site visit"
              rows={3}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-200"
              disabled={streaming}
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                disabled={streaming || instruction.trim().length < 2}
                onClick={() => void rewrite()}
                className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
              >
                {streaming ? (
                  <>
                    <WaveformLoader tone="inverse" /> Streaming
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3 w-3" /> Rewrite
                  </>
                )}
              </button>
              {streaming && (
                <button
                  type="button"
                  onClick={cancel}
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50"
                >
                  Stop
                </button>
              )}
            </div>
          </div>

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {error}
            </p>
          )}

          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="editorial-chapter-label text-zinc-500">
                {draftHtml ? "Proposed rewrite" : "Current letter"}
              </p>
              {draftHtml && (
                <button
                  type="button"
                  onClick={() => setDraftHtml("")}
                  className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900"
                >
                  <RotateCcw className="h-3 w-3" /> Reset
                </button>
              )}
            </div>
            <div
              className={cn(
                "prose prose-sm max-w-none font-serif max-h-[50vh] overflow-auto rounded-md border bg-white p-6",
                draftHtml ? "border-zinc-900" : "border-zinc-200",
              )}
              dangerouslySetInnerHTML={{
                __html: sanitizeHtmlFragment(draftHtml || currentHtml),
              }}
            />
          </div>
        </div>

        <footer className="flex items-center justify-between border-t border-zinc-200 bg-zinc-50 px-5 py-3">
          <p className="text-[11px] text-zinc-500">
            The AI edits your draft locally — nothing is sent until you apply.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={!draftHtml.trim() || streaming}
              className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
            >
              <Check className="h-3 w-3" /> Apply rewrite
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );

  return drawerContent;
}

function stripFences(text: string): string {
  const match = text.match(/```(?:html)?\s*([\s\S]*?)```/);
  if (match) return match[1].trim();
  return text.trim();
}
