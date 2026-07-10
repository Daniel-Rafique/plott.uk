"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  CircleDollarSign,
  Target,
  TrendingUp,
  Crown,
  AlertTriangle,
  Scale,
} from "lucide-react";

type Initial = {
  aiEnabled: boolean;
  aiDailyBudgetGbp: number;
  aiMonthlySpendGbp: number;
  tier: {
    id: "free" | "starter" | "pro" | "agency";
    label: string;
    monthlyBudgetCapGbp: number;
    allowedKinds: string[];
  };
  today: {
    costGbp: number;
    tokens: number;
    runs: number;
    completedWorkTotal: number;
    breakdown: {
      lettersDrafted: number;
      applicantsResearched: number;
      leadsScored: number;
      complianceChecks: number;
      otherCompleted: number;
    };
    runStatus: { succeeded: number; failed: number; running: number };
  };
  icp: {
    description: string;
    keywords: string[];
    preferredStatuses: string[];
    excludedKeywords: string[];
    minProjectValueGbp: number | null;
    targetRefusals: boolean;
    appealServiceType: string | null;
  } | null;
};

function toCsv(values: string[] | undefined): string {
  return (values ?? []).join(", ");
}

function fromCsv(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const PLAYBOOK_OPTIONS = [
  {
    id: "loft_extension_builder",
    name: "Loft & extension builder",
    summary: "Lofts, dormers and residential extensions.",
  },
  {
    id: "general_builder",
    name: "General builder",
    summary: "Mixed residential renovations and extensions.",
  },
  {
    id: "roofing",
    name: "Roofing contractor",
    summary: "Re-roofs and roof-related householder works.",
  },
  {
    id: "planning_consultant",
    name: "Planning consultant (appeals)",
    summary: "Refusal and appeal support.",
  },
] as const;

function TradePlaybookPicker({
  onApplied,
}: {
  onApplied: (icp: {
    description: string;
    keywords: string[];
    excludedKeywords: string[];
    preferredStatuses: string[];
    minProjectValueGbp: number | null;
    targetRefusals: boolean;
    appealServiceType: string | null;
  }) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  async function apply(playbookId: string) {
    setBusyId(playbookId);
    try {
      const res = await fetch("/api/settings/playbooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playbookId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        playbookId?: string;
        icp?: {
          description: string;
          keywords: string[];
          excludedKeywords: string[];
          preferredStatuses: string[];
          minProjectValueGbp: number | null;
          targetRefusals: boolean;
          appealServiceType: string | null;
        };
      };
      if (!res.ok) {
        toast.error(data.error ?? "Could not apply playbook");
        return;
      }
      if (data.icp) onApplied(data.icp);
      toast.success(
        "Playbook applied — ICP, letter template and rate card updated.",
      );
    } catch {
      toast.error("Network error applying playbook");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <ul className="mt-4 grid gap-3 sm:grid-cols-2">
      {PLAYBOOK_OPTIONS.map((p) => (
        <li
          key={p.id}
          className="flex flex-col justify-between rounded-lg border border-zinc-200 p-4"
        >
          <div>
            <p className="text-sm font-semibold text-zinc-950">{p.name}</p>
            <p className="mt-1 text-xs text-zinc-500">{p.summary}</p>
          </div>
          <button
            type="button"
            disabled={busyId != null}
            onClick={() => apply(p.id)}
            className="mt-3 rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
          >
            {busyId === p.id ? "Applying…" : "Apply playbook"}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function AiSettingsClient({ initial }: { initial: Initial }) {
  const [aiEnabled, setAiEnabled] = useState(initial.aiEnabled);
  const [budget, setBudget] = useState(String(initial.aiDailyBudgetGbp));
  const [description, setDescription] = useState(
    initial.icp?.description ?? "",
  );
  const [keywords, setKeywords] = useState(toCsv(initial.icp?.keywords));
  const [excluded, setExcluded] = useState(
    toCsv(initial.icp?.excludedKeywords),
  );
  const [preferredStatuses, setPreferredStatuses] = useState(
    toCsv(initial.icp?.preferredStatuses),
  );
  const [minValue, setMinValue] = useState(
    initial.icp?.minProjectValueGbp ? String(initial.icp.minProjectValueGbp) : "",
  );
  const [targetRefusals, setTargetRefusals] = useState(
    initial.icp?.targetRefusals ?? false,
  );
  const [appealServiceType, setAppealServiceType] = useState(
    initial.icp?.appealServiceType ?? "",
  );
  const [saving, setSaving] = useState(false);

  const spentPct = Math.min(
    100,
    Math.round(
      (initial.today.costGbp /
        Math.max(0.01, initial.aiDailyBudgetGbp)) * 100,
    ),
  );

  const monthlyCap = initial.tier.monthlyBudgetCapGbp;
  const monthlyPct =
    monthlyCap > 0
      ? Math.min(
          100,
          Math.round((initial.aiMonthlySpendGbp / monthlyCap) * 100),
        )
      : 0;
  const monthlyExhausted = monthlyCap > 0 && initial.aiMonthlySpendGbp >= monthlyCap;

  const {
    lettersDrafted,
    applicantsResearched,
    leadsScored,
    complianceChecks,
    otherCompleted,
  } = initial.today.breakdown;
  const breakdownLines = [
    { label: "Letters drafted", count: lettersDrafted },
    { label: "Applicants researched", count: applicantsResearched },
    { label: "Leads scored", count: leadsScored },
    { label: "Compliance checks", count: complianceChecks },
    { label: "Other AI tasks", count: otherCompleted },
  ].filter((line) => line.count > 0);

  const { failed: runsFailed, running: runsRunning } = initial.today.runStatus;

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/ai/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aiEnabled,
          aiDailyBudgetGbp: Number(budget) || 0,
          icp: description.trim()
            ? {
                description: description.trim(),
                keywords: fromCsv(keywords),
                preferredStatuses: fromCsv(preferredStatuses),
                excludedKeywords: fromCsv(excluded),
                minProjectValueGbp: minValue ? Number(minValue) : null,
                targetRefusals,
                appealServiceType: appealServiceType.trim() || null,
              }
            : undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Could not save settings");
      }
      toast.success("AI settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <section
        className={`flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4 ${
          monthlyExhausted
            ? "border-red-200 bg-red-50/60"
            : initial.tier.id === "free"
              ? "border-amber-200 bg-amber-50/60"
              : "border-indigo-200 bg-indigo-50/40"
        }`}
      >
        <div className="flex items-center gap-3">
          <Crown className="h-5 w-5 text-indigo-700" aria-hidden />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700">
              Plan · {initial.tier.label}
            </p>
            <p className="text-sm text-zinc-800">
              {monthlyCap === 0
                ? "Upgrade to unlock AI features."
                : `£${initial.aiMonthlySpendGbp.toFixed(2)} of £${monthlyCap.toFixed(
                    2,
                  )} monthly AI budget used (${monthlyPct}%).`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {monthlyExhausted ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700">
              <AlertTriangle className="h-3 w-3" />
              Cap reached
            </span>
          ) : null}
          <Link
            href="/app/settings/billing"
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            {initial.tier.id === "free" || initial.tier.id === "starter"
              ? "Upgrade plan"
              : "Manage plan"}
          </Link>
        </div>
      </section>

      {monthlyCap > 0 ? (
        <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
          <div
            className={`h-full rounded-full ${
              monthlyPct >= 90
                ? "bg-red-500"
                : monthlyPct >= 75
                  ? "bg-amber-500"
                  : "bg-indigo-500"
            }`}
            style={{ width: `${monthlyPct}%` }}
          />
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-500">
            <TrendingUp className="h-3.5 w-3.5" aria-hidden />
            AI work completed today
          </div>
          <p className="mt-2 text-2xl font-semibold tracking-tight">
            {initial.today.completedWorkTotal.toLocaleString()}
          </p>
          {breakdownLines.length > 0 ? (
            <ul className="mt-3 space-y-1 text-xs text-zinc-600">
              {breakdownLines.map((line) => (
                <li key={line.label} className="flex justify-between gap-4">
                  <span>{line.label}</span>
                  <span className="tabular-nums font-medium text-zinc-900">
                    {line.count.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-zinc-500">
              No completed AI work in the last 24 hours.
            </p>
          )}
          <p className="mt-3 border-t border-zinc-100 pt-3 text-xs text-zinc-500">
            {initial.today.runs.toLocaleString()} total AI runs (including support
            tasks).{" "}
            {runsFailed > 0 ? (
              <>
                <Link
                  href="/app/settings/ai/runs?status=failed"
                  className="font-medium text-brand-dark underline underline-offset-2 hover:text-zinc-900"
                >
                  View {runsFailed.toLocaleString()} failed run
                  {runsFailed === 1 ? "" : "s"} →
                </Link>
                {runsRunning > 0 ? ` · ${runsRunning} still running` : ""}.
              </>
            ) : runsRunning > 0 ? (
              `${runsRunning} still running.`
            ) : null}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-500">
            <CircleDollarSign className="h-3.5 w-3.5" aria-hidden />
            Cost today
          </div>
          <p className="mt-2 text-2xl font-semibold tracking-tight">
            £{initial.today.costGbp.toFixed(2)}
          </p>
          <div className="mt-2 h-1.5 rounded-full bg-zinc-100">
            <div
              className={`h-full rounded-full ${spentPct > 80 ? "bg-red-500" : "bg-emerald-500"}`}
              style={{ width: `${spentPct}%` }}
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Spend controls</h2>
        <div className="mt-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Use AI assistant</p>
            <p className="text-xs text-zinc-500">
              Turn off to stop all automatic research and letter drafting.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAiEnabled((v) => !v)}
            aria-pressed={aiEnabled}
            aria-label="Toggle AI features"
            className={`relative h-6 w-11 rounded-full transition-colors ${
              aiEnabled ? "bg-emerald-600" : "bg-zinc-300"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                aiEnabled ? "left-5" : "left-0.5"
              }`}
            />
          </button>
        </div>
        <div className="mt-6">
          <label className="block text-sm font-medium text-zinc-800">
            Daily spending limit (£)
          </label>
          <p className="text-xs text-zinc-500">
            AI pauses when this limit is reached. You&apos;ll get an email at 80%.
          </p>
          <input
            type="number"
            step="0.5"
            min={0}
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            className="mt-2 w-40 rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-emerald-600" aria-hidden />
          <h2 className="text-lg font-semibold">Trade playbooks</h2>
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          One click sets your ideal-project profile, a starter letter template
          (with ballpark tokens), and rate-card defaults for AI estimates.
        </p>
        <TradePlaybookPicker
          onApplied={(icp) => {
            setDescription(icp.description);
            setKeywords(toCsv(icp.keywords));
            setExcluded(toCsv(icp.excludedKeywords));
            setPreferredStatuses(toCsv(icp.preferredStatuses));
            setMinValue(
              icp.minProjectValueGbp != null
                ? String(icp.minProjectValueGbp)
                : "",
            );
            setTargetRefusals(icp.targetRefusals);
            setAppealServiceType(icp.appealServiceType ?? "");
          }}
        />
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-emerald-600" aria-hidden />
          <h2 className="text-lg font-semibold">Projects you want</h2>
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          Tell us about your ideal jobs. We&apos;ll use this to filter leads and only
          show you projects that match your business.
        </p>
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-800">
              Describe your business
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="e.g. We do loft conversions and rear extensions for detached homes in West London, typically £80–150k projects."
              className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-zinc-800">
                Work you want
              </label>
              <input
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="extension, loft, dormer"
                className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-zinc-500">
                Keywords to look for, separated by commas.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-800">
                Work you don&apos;t want
              </label>
              <input
                value={excluded}
                onChange={(e) => setExcluded(e.target.value)}
                placeholder="commercial, industrial, hoarding"
                className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-zinc-500">
                Keywords to skip, separated by commas.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-800">
                Application status
              </label>
              <input
                value={preferredStatuses}
                onChange={(e) => setPreferredStatuses(e.target.value)}
                placeholder="approved, granted, pending"
                className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-zinc-500">
                e.g. approved, pending, granted.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-800">
                Minimum job value (£)
              </label>
              <input
                type="number"
                min={0}
                value={minValue}
                onChange={(e) => setMinValue(e.target.value)}
                placeholder="50000"
                className="mt-2 w-40 rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-zinc-500">
                Skip smaller projects.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <div className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-amber-600" aria-hidden />
          <h2 className="text-lg font-semibold">Refusal appeals</h2>
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          Legal professionals and planning consultants can pitch their
          services to applicants whose planning permission was refused.
          Plott will detect refusals, weigh up whether an appeal is viable,
          and draft a pitch letter.
        </p>
        <div className="mt-4 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Target refused applications</p>
              <p className="text-xs text-zinc-500">
                Runs the appeals pipeline on refusals found in your saved
                searches. Ignores non-viable refusals.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setTargetRefusals((v) => !v)}
              aria-pressed={targetRefusals}
              aria-label="Toggle refusal appeals"
              className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${
                targetRefusals ? "bg-amber-600" : "bg-zinc-300"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                  targetRefusals ? "left-5" : "left-0.5"
                }`}
              />
            </button>
          </div>
          {targetRefusals ? (
            <div>
              <label className="block text-sm font-medium text-zinc-800">
                Appeal service you provide
              </label>
              <input
                value={appealServiceType}
                onChange={(e) => setAppealServiceType(e.target.value)}
                placeholder="e.g. planning solicitor, appeal consultant, barrister"
                className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                maxLength={200}
              />
              <p className="mt-1 text-xs text-zinc-500">
                Used in pitch letters to describe the service you&apos;re
                offering the refused applicant.
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
      </div>
    </div>
  );
}
