"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

const WORK_TYPES = [
  "loft_conversion",
  "rear_extension",
  "side_extension",
  "re_roof",
  "new_build",
  "general_works",
] as const;

export type RateCardForm = {
  dayRateGbp: number | null;
  crewSizeDefault: number | null;
  unitRates: Record<string, number>;
  typicalWeeks: Record<string, number>;
  contingencyPercent: number;
  vatInclusive: boolean;
};

const EMPTY: RateCardForm = {
  dayRateGbp: null,
  crewSizeDefault: 2,
  unitRates: {},
  typicalWeeks: {},
  contingencyPercent: 10,
  vatInclusive: false,
};

export function RateCardSettings({
  initial,
}: {
  initial: RateCardForm | null;
}) {
  const [form, setForm] = useState<RateCardForm>(initial ?? EMPTY);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function setUnitRate(key: string, value: string) {
    const n = value.trim() === "" ? undefined : Number(value);
    setForm((prev) => {
      const next = { ...prev.unitRates };
      if (n == null || !Number.isFinite(n)) delete next[key];
      else next[key] = n;
      return { ...prev, unitRates: next };
    });
  }

  function setTypicalWeeks(key: string, value: string) {
    const n = value.trim() === "" ? undefined : Number(value);
    setForm((prev) => {
      const next = { ...prev.typicalWeeks };
      if (n == null || !Number.isFinite(n)) delete next[key];
      else next[key] = n;
      return { ...prev, typicalWeeks: next };
    });
  }

  function save() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/settings/rate-card", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not save rate card");
        return;
      }
      setMessage("Rate card saved. New estimates will use these rates.");
    });
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Rate card</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600">
          Ground the AI job estimator with your day rates and typical £/m² (or
          unit) prices. Ballparks in outreach stay indicative and always include
          a disclaimer.{" "}
          <Link
            href="/app/pipeline"
            className="underline underline-offset-2 hover:text-zinc-950"
          >
            Open pipeline
          </Link>
        </p>
      </header>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {message}
        </p>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-zinc-800">Day rate (£)</span>
          <input
            type="number"
            min={0}
            step={1}
            value={form.dayRateGbp ?? ""}
            onChange={(e) =>
              setForm((p) => ({
                ...p,
                dayRateGbp:
                  e.target.value === "" ? null : Number(e.target.value),
              }))
            }
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-zinc-800">Default crew size</span>
          <input
            type="number"
            min={1}
            max={50}
            value={form.crewSizeDefault ?? ""}
            onChange={(e) =>
              setForm((p) => ({
                ...p,
                crewSizeDefault:
                  e.target.value === "" ? null : Number(e.target.value),
              }))
            }
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-zinc-800">Contingency (%)</span>
          <input
            type="number"
            min={0}
            max={50}
            value={form.contingencyPercent}
            onChange={(e) =>
              setForm((p) => ({
                ...p,
                contingencyPercent: Number(e.target.value) || 0,
              }))
            }
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
          />
        </label>
        <label className="flex items-center gap-2 pt-6 text-sm text-zinc-800">
          <input
            type="checkbox"
            checked={form.vatInclusive}
            onChange={(e) =>
              setForm((p) => ({ ...p, vatInclusive: e.target.checked }))
            }
          />
          Rates are VAT-inclusive
        </label>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
          Unit rates (£)
        </h2>
        <p className="mt-1 text-sm text-zinc-600">
          Typically £ per m² for the work type. Leave blank if not applicable.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {WORK_TYPES.map((key) => (
            <label key={key} className="block text-sm">
              <span className="font-medium text-zinc-800">
                {key.replaceAll("_", " ")}
              </span>
              <input
                type="number"
                min={0}
                value={form.unitRates[key] ?? ""}
                onChange={(e) => setUnitRate(key, e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
              />
            </label>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
          Typical weeks
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {WORK_TYPES.map((key) => (
            <label key={key} className="block text-sm">
              <span className="font-medium text-zinc-800">
                {key.replaceAll("_", " ")}
              </span>
              <input
                type="number"
                min={0}
                step={0.5}
                value={form.typicalWeeks[key] ?? ""}
                onChange={(e) => setTypicalWeeks(key, e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
              />
            </label>
          ))}
        </div>
      </section>

      <button
        type="button"
        disabled={isPending}
        onClick={save}
        className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {isPending ? "Saving…" : "Save rate card"}
      </button>
    </div>
  );
}
