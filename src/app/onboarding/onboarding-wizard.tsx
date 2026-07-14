"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import posthog from "posthog-js";
import { resolvePostOnboardingPath } from "@/lib/auth/sanitize-next";
import { cn } from "@/lib/utils";

export type WizardInitial = {
  name: string;
  websiteUrl: string;
  addressLines: string;
  phone: string;
  logoBlobUrl: string | null;
};

export type OnboardingWizardProps = {
  initial: WizardInitial;
  /** Preferred post-onboarding path (e.g. /subscribe?plan=agency). */
  next?: string | null;
  embedded?: boolean;
  compact?: boolean;
  onComplete?: (nextPath: string) => void;
};

const STEPS = [
  { id: "company", label: "Company" },
  { id: "address", label: "Address" },
  { id: "logo", label: "Branding" },
  { id: "playbook", label: "Trade" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

const PLAYBOOK_CHOICES = [
  { id: "loft_extension_builder", name: "Loft & extension builder" },
  { id: "general_builder", name: "General builder" },
  { id: "roofing", name: "Roofing contractor" },
  { id: "planning_consultant", name: "Planning consultant" },
  { id: "", name: "Skip for now" },
] as const;

export function OnboardingWizard({
  initial,
  next: preferredNext = null,
  embedded = false,
  compact = false,
  onComplete,
}: OnboardingWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<StepId>("company");
  const [name, setName] = useState(initial.name);
  const [websiteUrl, setWebsiteUrl] = useState(initial.websiteUrl);
  const [addressLines, setAddressLines] = useState(initial.addressLines);
  const [phone, setPhone] = useState(initial.phone);
  const [logoBlobUrl, setLogoBlobUrl] = useState<string | null>(
    initial.logoBlobUrl,
  );
  const [logoVersion, setLogoVersion] = useState<number>(() =>
    initial.logoBlobUrl ? Date.now() : 0,
  );
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playbookId, setPlaybookId] = useState<string>("");

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  function canAdvance(): boolean {
    if (step === "company") return name.trim().length >= 2;
    if (step === "address") return true;
    return true;
  }

  function advance() {
    setError(null);
    if (!canAdvance()) {
      setError("Please complete this step before continuing.");
      return;
    }
    const next = STEPS[stepIndex + 1];
    if (next) setStep(next.id);
  }

  function back() {
    const prev = STEPS[stepIndex - 1];
    if (prev) setStep(prev.id);
  }

  async function handleLogoFile(file: File | null) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError("Logo must be under 2MB");
      return;
    }
    setError(null);
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
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? `Upload failed (${res.status})`);
      }
      if (data.url) {
        setLogoBlobUrl(data.url);
        setLogoVersion(Date.now());
      }
    } catch (err) {
      console.error("[onboarding] Logo upload failed:", err);
      setError(err instanceof Error ? err.message : "Logo upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function finish() {
    setError(null);
    if (name.trim().length < 2) {
      setStep("company");
      setError("Company name is required.");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/company/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          websiteUrl: websiteUrl.trim(),
          addressLines: addressLines.trim(),
          phone: phone.trim(),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        nextPath?: string;
      };
      if (!res.ok) {
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      if (playbookId) {
        await fetch("/api/settings/playbooks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ playbookId }),
        }).catch(() => null);
      }
      posthog.capture("onboarding_completed", {
        has_logo: Boolean(logoBlobUrl),
        has_address: Boolean(addressLines.trim()),
        has_phone: Boolean(phone.trim()),
        has_website: Boolean(websiteUrl.trim()),
        playbook_id: playbookId || null,
      });

      const destination = resolvePostOnboardingPath(
        preferredNext,
        body.nextPath,
      );

      if (embedded && onComplete) {
        onComplete(destination);
        return;
      }

      router.push(destination);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save settings.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className={cn(
        "w-full bg-white",
        compact
          ? "p-0"
          : "rounded-2xl border border-zinc-200 p-8 shadow-sm",
      )}
    >
      <div className={cn(compact ? "mb-6" : "mb-8")}>
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Step {stepIndex + 1} of {STEPS.length}
        </p>
        <h1
          className={cn(
            "mt-1 font-semibold tracking-tight",
            compact ? "text-xl" : "text-2xl",
          )}
        >
          Set up your workspace
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          These details appear on letters you send to applicants. You can change
          them any time in Settings.
        </p>
      </div>

      <div className="mb-8 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex flex-1 items-center gap-2">
            <div
              className={`h-1.5 flex-1 rounded-full transition ${
                i <= stepIndex ? "bg-zinc-900" : "bg-zinc-200"
              }`}
            />
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.18 }}
          className="flex flex-col gap-4"
        >
          {step === "company" ? (
            <>
              <Field label="Company name" htmlFor="name" required>
                <input
                  id="name"
                  type="text"
                  required
                  autoComplete="organization"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                  placeholder="Acme Planning Consultants Ltd"
                />
              </Field>
              <Field label="Website" htmlFor="websiteUrl">
                <input
                  id="websiteUrl"
                  type="url"
                  autoComplete="url"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                  placeholder="https://acmeplanning.co.uk"
                />
              </Field>
            </>
          ) : null}

          {step === "address" ? (
            <>
              <Field label="Postal address" htmlFor="addressLines">
                <textarea
                  id="addressLines"
                  rows={4}
                  value={addressLines}
                  onChange={(e) => setAddressLines(e.target.value)}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-mono"
                  placeholder={"12 High Street\nLondon\nSW1A 1AA"}
                />
              </Field>
              <Field label="Phone" htmlFor="phone">
                <input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                  placeholder="020 7123 4567"
                />
              </Field>
            </>
          ) : null}

          {step === "logo" ? (
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-sm font-medium">Company logo</p>
                <p className="mt-1 text-xs text-zinc-500">
                  PNG, JPG, SVG or WebP. Up to 2MB. Optional — you can add it
                  later.
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex h-24 w-24 items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50">
                  {logoBlobUrl ? (
                    <Image
                      src={`/api/company/logo/view?v=${logoVersion}`}
                      alt="Logo"
                      width={96}
                      height={96}
                      unoptimized
                      className="max-h-full max-w-full object-contain p-2"
                    />
                  ) : (
                    <span className="text-xs text-zinc-400">Preview</span>
                  )}
                </div>
                <label className="cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50">
                  {uploading
                    ? "Uploading…"
                    : logoBlobUrl
                      ? "Replace logo"
                      : "Upload logo"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      e.currentTarget.value = "";
                      void handleLogoFile(file);
                    }}
                    disabled={uploading}
                  />
                </label>
              </div>
            </div>
          ) : null}

          {step === "playbook" ? (
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-sm font-medium">What kind of work do you do?</p>
                <p className="mt-1 text-xs text-zinc-500">
                  We&apos;ll set starter ICP filters, a letter template and rate-card
                  defaults so ballpark outreach works sooner. You can change this
                  later in Settings → AI.
                </p>
              </div>
              <div className="grid gap-2">
                {PLAYBOOK_CHOICES.map((choice) => (
                  <label
                    key={choice.id || "skip"}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm ${
                      playbookId === choice.id
                        ? "border-zinc-900 bg-zinc-50"
                        : "border-zinc-200 hover:border-zinc-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="playbook"
                      checked={playbookId === choice.id}
                      onChange={() => setPlaybookId(choice.id)}
                      className="accent-zinc-900"
                    />
                    <span className="font-medium text-zinc-900">{choice.name}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </motion.div>
      </AnimatePresence>

      {error ? (
        <p className="mt-4 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-8 flex items-center justify-between">
        {stepIndex > 0 ? (
          <button
            type="button"
            onClick={back}
            disabled={pending}
            className="text-sm font-medium text-zinc-600 hover:text-zinc-900 disabled:opacity-60"
          >
            Back
          </button>
        ) : (
          <span />
        )}
        {stepIndex < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={advance}
            className="rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void finish()}
            disabled={pending || uploading}
            className="rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Continue to plans"}
          </button>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
        {required ? <span className="ml-0.5 text-red-600">*</span> : null}
      </label>
      {children}
    </div>
  );
}
