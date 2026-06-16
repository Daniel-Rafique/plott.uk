"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Eraser, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Initial = {
  name: string;
  title: string;
  signatureSvg: string | null;
  signatureBlobUrl: string | null;
};

type Tab = "draw" | "upload";

export function SignatureSettings({ initial }: { initial: Initial }) {
  const [tab, setTab] = useState<Tab>(
    initial.signatureBlobUrl ? "upload" : "draw",
  );
  const [name, setName] = useState(initial.name);
  const [title, setTitle] = useState(initial.title);
  const [signatureBlobUrl, setSignatureBlobUrl] = useState(
    initial.signatureBlobUrl,
  );
  const [savedSvg, setSavedSvg] = useState<string | null>(initial.signatureSvg);
  const [saving, startSave] = useTransition();

  async function saveMeta(e: React.FormEvent) {
    e.preventDefault();
    startSave(async () => {
      const res = await fetch("/api/user/signature-meta", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, title }),
      });
      if (res.ok) toast.success("Saved");
      else toast.error("Save failed");
    });
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Your signature</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Appears at the bottom of every letter you send from this workspace.
        </p>
      </header>

      <form onSubmit={saveMeta} className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-6 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600">
            Signer name
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            required
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600">
            Job title
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>
        <div className="sm:col-span-2 flex justify-end">
          <button
            disabled={saving}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save signer details"}
          </button>
        </div>
      </form>

      <div className="rounded-2xl border border-zinc-200 bg-white">
        <div className="flex gap-1 border-b border-zinc-200 px-4 pt-4">
          <TabButton active={tab === "draw"} onClick={() => setTab("draw")}>
            Draw signature
          </TabButton>
          <TabButton active={tab === "upload"} onClick={() => setTab("upload")}>
            Upload image
          </TabButton>
        </div>
        <div className="p-6">
          {tab === "draw" ? (
            <DrawPanel
              initialSvg={savedSvg}
              onSaved={(svg) => {
                setSavedSvg(svg);
                setSignatureBlobUrl(null);
              }}
              onRemoved={() => {
                setSavedSvg(null);
                setSignatureBlobUrl(null);
              }}
            />
          ) : (
            <UploadPanel
              currentUrl={signatureBlobUrl}
              onUploaded={(url) => {
                setSignatureBlobUrl(url);
                setSavedSvg(null);
              }}
              onRemoved={() => {
                setSignatureBlobUrl(null);
                setSavedSvg(null);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px rounded-t-md border-b-2 px-4 py-2 text-sm font-medium",
        active
          ? "border-blue-600 text-blue-600"
          : "border-transparent text-zinc-600 hover:text-zinc-900",
      )}
    >
      {children}
    </button>
  );
}

function DrawPanel({
  initialSvg,
  onSaved,
  onRemoved,
}: {
  initialSvg: string | null;
  onSaved: (svg: string) => void;
  onRemoved: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const padRef = useRef<{
    clear(): void;
    isEmpty(): boolean;
    toDataURL(type?: string): string;
    toSVG(): string;
    fromDataURL(d: string): void;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(initialSvg);

  useEffect(() => {
    queueMicrotask(() => setPreview(initialSvg));
  }, [initialSvg]);

  useEffect(() => {
    if (!canvasRef.current) return;
    let cancelled = false;
    (async () => {
      const mod = await import("signature_pad");
      if (cancelled) return;
      const SignaturePad = mod.default;
      const canvas = canvasRef.current!;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext("2d")?.scale(ratio, ratio);
      const pad = new SignaturePad(canvas, {
        penColor: "#111",
        minWidth: 0.6,
        maxWidth: 2.2,
      });
      padRef.current = pad as unknown as typeof padRef.current;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function clear() {
    padRef.current?.clear();
  }

  async function save() {
    const pad = padRef.current;
    if (!pad || pad.isEmpty()) {
      toast.error("Draw your signature first");
      return;
    }
    const svg = pad.toSVG();
    setSaving(true);
    try {
      const res = await fetch("/api/user/signature/draw", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ svg }),
      });
      if (!res.ok) throw new Error("Save failed");
      setPreview(svg);
      onSaved(svg);
      toast.success("Signature saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function executeRemove() {
    setRemoving(true);
    try {
      const res = await fetch("/api/user/signature", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      padRef.current?.clear();
      onRemoved();
      toast.success("Signature removed");
      setRemoveConfirmOpen(false);
    } catch {
      toast.error("Failed to remove signature");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={removeConfirmOpen}
        onOpenChange={(next) => {
          if (!removing) setRemoveConfirmOpen(next);
        }}
        title="Remove saved signature?"
        description="Letters will no longer include a graphic until you add one again."
        confirmLabel="Remove"
        variant="destructive"
        isLoading={removing}
        onConfirm={executeRemove}
      />
      <div className="relative h-44 w-full overflow-hidden rounded-lg border border-dashed border-zinc-300 bg-zinc-50">
        <canvas ref={canvasRef} className="h-full w-full touch-none" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={clear}
          className="inline-flex items-center gap-2 rounded-md border border-zinc-300 px-3 py-2 text-sm"
        >
          <Eraser className="h-4 w-4" aria-hidden />
          Clear
        </button>
        {preview ? (
          <button
            type="button"
            onClick={() => setRemoveConfirmOpen(true)}
            disabled={removing}
            className="text-sm text-red-600 hover:underline disabled:opacity-60"
          >
            Remove saved signature
          </button>
        ) : null}
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="ml-auto rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save signature"}
        </button>
      </div>
      {preview && (
        <div>
          <h3 className="mb-2 text-xs font-medium text-zinc-600">Current</h3>
          <div
            className="h-16 w-full rounded-md bg-white p-2 [&_svg]:h-full [&_svg]:w-auto"
            dangerouslySetInnerHTML={{ __html: preview }}
          />
        </div>
      )}
    </div>
  );
}

function UploadPanel({
  currentUrl,
  onUploaded,
  onRemoved,
}: {
  currentUrl: string | null;
  onUploaded: (url: string) => void;
  onRemoved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [version, setVersion] = useState<number>(() =>
    currentUrl ? Date.now() : 0,
  );

  async function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 512 * 1024) {
      toast.error("Signature image must be under 512KB");
      return;
    }
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/user/signature-upload", {
        method: "POST",
        body: formData,
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? `Upload failed (${res.status})`);
      }
      onUploaded(data.url);
      setVersion(Date.now());
      toast.success("Signature uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function executeRemove() {
    setRemoving(true);
    try {
      const res = await fetch("/api/user/signature", { method: "DELETE" });
      if (res.ok) {
        onRemoved();
        toast.success("Signature removed");
        setRemoveConfirmOpen(false);
      } else toast.error("Failed");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={removeConfirmOpen}
        onOpenChange={(next) => {
          if (!removing) setRemoveConfirmOpen(next);
        }}
        title="Remove saved signature?"
        description="Letters will no longer include a graphic until you add one again."
        confirmLabel="Remove"
        variant="destructive"
        isLoading={removing}
        onConfirm={executeRemove}
      />
      <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-white">
        {currentUrl ? (
          <Image
            src={`/api/user/signature/view?v=${version}`}
            alt="Signature"
            width={240}
            height={80}
            className="max-h-24 w-auto object-contain"
            unoptimized
          />
        ) : (
          <span className="text-xs text-zinc-500">
            Transparent PNG works best
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50">
          <Upload className="h-4 w-4" aria-hidden />
          {busy ? "Uploading…" : "Upload PNG / SVG"}
          <input
            type="file"
            accept="image/png,image/svg+xml"
            className="hidden"
            onChange={handle}
            disabled={busy}
          />
        </label>
        {currentUrl ? (
          <button
            type="button"
            onClick={() => setRemoveConfirmOpen(true)}
            className="text-sm text-red-600 hover:underline"
          >
            Remove saved signature
          </button>
        ) : null}
      </div>
    </div>
  );
}
