"use client";

import { useState } from "react";
import { PulseIndicator } from "@/components/ui/loading-indicators";

type Source = "contact" | "support";

type FieldErrors = Record<string, string[]>;

type State =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string; fieldErrors?: FieldErrors };

export function ContactForm({ source }: { source: Source }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const isSubmitting = state.kind === "submitting";
  const fieldErrors = state.kind === "error" ? state.fieldErrors : undefined;

  function getFieldError(field: string): string | undefined {
    return fieldErrors?.[field]?.[0];
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isSubmitting) return;

    const form = e.currentTarget;
    const data = new FormData(form);
    const payload = {
      source,
      name: String(data.get("name") ?? ""),
      email: String(data.get("email") ?? ""),
      company: String(data.get("company") ?? "") || null,
      message: String(data.get("message") ?? ""),
      website: String(data.get("website") ?? ""),
    };

    setState({ kind: "submitting" });
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
          issues?: { fieldErrors?: FieldErrors };
        } | null;
        
        const fieldErrs = body?.issues?.fieldErrors;
        const errorMessage =
          body?.error ??
          (res.status === 429
            ? "Too many messages from this network. Try again later."
            : "Something went wrong. Please try again.");
        
        setState({
          kind: "error",
          message: errorMessage,
          fieldErrors: fieldErrs,
        });
        return;
      }
      form.reset();
      setState({ kind: "success" });
    } catch (err) {
      setState({
        kind: "error",
        message:
          err instanceof Error ? err.message : "Something went wrong.",
      });
    }
  }

  if (state.kind === "success") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-6 text-sm text-emerald-900">
        <p className="font-medium">Thanks — message received.</p>
        <p className="mt-1 text-emerald-800/90">
          We reply from{" "}
          {source === "support"
            ? "support@plott.uk"
            : "hello@plott.uk"}{" "}
          within one working day.
        </p>
        <button
          type="button"
          onClick={() => setState({ kind: "idle" })}
          className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800 underline underline-offset-4 hover:text-emerald-900"
        >
          Send another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden="true"
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Your name" htmlFor="contact-name" error={getFieldError("name")}>
          <input
            id="contact-name"
            name="name"
            type="text"
            required
            autoComplete="name"
            maxLength={120}
            className={inputClass}
            aria-invalid={!!getFieldError("name")}
          />
        </Field>
        <Field label="Work email" htmlFor="contact-email" error={getFieldError("email")}>
          <input
            id="contact-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            maxLength={200}
            className={inputClass}
            aria-invalid={!!getFieldError("email")}
          />
        </Field>
      </div>

      <Field label="Company (optional)" htmlFor="contact-company" error={getFieldError("company")}>
        <input
          id="contact-company"
          name="company"
          type="text"
          autoComplete="organization"
          maxLength={160}
          className={inputClass}
          aria-invalid={!!getFieldError("company")}
        />
      </Field>

      <Field
        label={source === "support" ? "How can we help?" : "Your message"}
        htmlFor="contact-message"
        error={getFieldError("message")}
      >
        <textarea
          id="contact-message"
          name="message"
          required
          rows={6}
          minLength={10}
          maxLength={4000}
          className={`${inputClass} resize-y`}
          placeholder={
            source === "support"
              ? "Describe the issue, include reference numbers if you have them."
              : "Tell us about your team and what you're trying to do."
          }
          aria-invalid={!!getFieldError("message")}
        />
      </Field>

      {state.kind === "error" && !fieldErrors ? (
        <p
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50/70 px-4 py-3 text-sm text-rose-900"
        >
          {state.message}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-4 pt-2">
        <p className="text-xs text-zinc-500">
          By submitting you agree to our{" "}
          <a
            href="/privacy"
            className="underline underline-offset-2 hover:text-zinc-800"
          >
            privacy notice
          </a>
          .
        </p>
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 rounded-full bg-zinc-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
        >
          {isSubmitting ? (
            <>
              <PulseIndicator tone="inverse" label="Sending" /> Sending
            </>
          ) : (
            "Send message"
          )}
        </button>
      </div>
    </form>
  );
}

const inputClass =
  "block w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-sm transition focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10";

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="block">
      <label htmlFor={htmlFor}>
        <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">
          {label}
        </span>
        {children}
      </label>
      {error ? (
        <p className="mt-1.5 text-xs text-rose-600">{error}</p>
      ) : null}
    </div>
  );
}
