"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Trash2, Upload } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Company = {
  id: string;
  name: string;
  addressLines: string;
  phone: string;
  email: string;
  websiteUrl: string;
  logoBlobUrl: string | null;
  logoBlobPathname: string | null;
  letterFooter: string;
};

export function BrandingSettings({ company }: { company: Company }) {
  const [form, setForm] = useState(company);
  const [saving, startSave] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [removeLogoOpen, setRemoveLogoOpen] = useState(false);
  const [removeLogoLoading, setRemoveLogoLoading] = useState(false);
  const [logoVersion, setLogoVersion] = useState<number>(() =>
    company.logoBlobUrl ? Date.now() : 0,
  );

  function update<K extends keyof Company>(key: K, value: Company[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    startSave(async () => {
      const res = await fetch("/api/company", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          addressLines: form.addressLines,
          phone: form.phone,
          email: form.email,
          websiteUrl: form.websiteUrl,
          letterFooter: form.letterFooter,
        }),
      });
      if (res.ok) toast.success("Branding saved");
      else toast.error("Could not save");
    });
  }

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo must be under 2MB");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/company/logo-upload", {
        method: "POST",
        body: formData,
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        pathname?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? `Upload failed (${res.status})`);
      }
      if (data.url) update("logoBlobUrl", data.url);
      if (data.pathname) update("logoBlobPathname", data.pathname);
      setLogoVersion(Date.now());
      toast.success("Logo updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function executeRemoveLogo() {
    if (!form.logoBlobUrl) return;
    setRemoveLogoLoading(true);
    try {
      const res = await fetch("/api/company/logo", { method: "DELETE" });
      if (res.ok) {
        update("logoBlobUrl", null);
        update("logoBlobPathname", null);
        toast.success("Logo removed");
        setRemoveLogoOpen(false);
      } else toast.error("Could not remove");
    } finally {
      setRemoveLogoLoading(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-10">
      <ConfirmDialog
        open={removeLogoOpen}
        onOpenChange={(next) => {
          if (!removeLogoLoading) setRemoveLogoOpen(next);
        }}
        title="Remove the logo?"
        description="Letters and PDFs will use text-only branding until you upload a new logo."
        confirmLabel="Remove logo"
        variant="destructive"
        isLoading={removeLogoLoading}
        onConfirm={executeRemoveLogo}
      />

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Branding</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Used on every PDF letter your team generates.
        </p>
      </header>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
          Company logo
        </h2>
        <div className="mt-4 flex items-start gap-6">
          <div className="flex h-28 w-48 items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50">
            {form.logoBlobUrl ? (
              <Image
                src={`/api/company/logo/view?v=${logoVersion}`}
                alt="Logo preview"
                width={180}
                height={96}
                className="max-h-24 w-auto object-contain"
                unoptimized
              />
            ) : (
              <span className="text-xs text-zinc-400">No logo uploaded</span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50">
              <Upload className="h-4 w-4" aria-hidden />
              {uploading ? "Uploading…" : "Upload logo"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="hidden"
                onChange={handleLogoChange}
                disabled={uploading}
              />
            </label>
            {form.logoBlobUrl && (
              <button
                type="button"
                onClick={() => setRemoveLogoOpen(true)}
                className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                Remove logo
              </button>
            )}
            <p className="text-xs text-zinc-500">
              PNG / SVG / WEBP up to 2 MB. Displays at ~90 px tall on letters.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
          Company details
        </h2>
        <Field label="Company name">
          <input
            value={form.name}
            required
            onChange={(e) => update("name", e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Registered address">
          <textarea
            rows={3}
            value={form.addressLines}
            onChange={(e) => update("addressLines", e.target.value)}
            className="input"
            placeholder="Line 1&#10;Line 2&#10;City, Postcode"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone">
            <input
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              className="input"
            />
          </Field>
        </div>
        <Field label="Website">
          <input
            value={form.websiteUrl}
            onChange={(e) => update("websiteUrl", e.target.value)}
            placeholder="https://"
            className="input"
          />
        </Field>
        <Field label="Letter footer (optional)">
          <textarea
            rows={2}
            value={form.letterFooter}
            onChange={(e) => update("letterFooter", e.target.value)}
            className="input"
            placeholder="e.g. Regulated by RICS · Company no. 12345678"
          />
        </Field>
      </section>

      <div className="flex justify-end">
        <button
          disabled={saving}
          className="rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>

      <style jsx>{`
        .input {
          display: block;
          width: 100%;
          border-radius: 6px;
          border: 1px solid #d4d4d8;
          background: white;
          padding: 8px 12px;
          font-size: 14px;
        }
        .input:focus {
          outline: none;
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
        }
      `}</style>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-600">
        {label}
      </span>
      {children}
    </label>
  );
}
