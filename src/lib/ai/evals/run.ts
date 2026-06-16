/**
 * Eval runner. Designed to be called from a Node script (see
 * `scripts/run-evals.ts`) rather than from the app — it bypasses `getTenantContext`
 * and writes nothing to Prisma for the evals themselves; the underlying
 * runtime still records `AgentRun` rows so per-eval costs are visible in the
 * admin dashboard.
 *
 * Callers must use a real `companyId` that exists in the DB. The eval CLI can
 * pick the oldest `Company` when none is passed. Every run uses deterministic
 * prompts so the only variability is the model.
 */

import { z } from "zod";
import { parseNlSearch } from "@/lib/ai/nl-search-parse";
import { runObject } from "@/lib/ai/runtime";
import {
  COMPLIANCE_DATASET,
  ICP_DATASET,
  NL_SEARCH_DATASET,
  type ComplianceCase,
  type IcpCase,
  type NlSearchCase,
} from "./datasets";

export type EvalResult = {
  suite: "compliance" | "icp_classifier" | "nl_search";
  caseId: string;
  passed: boolean;
  expected: unknown;
  actual: unknown;
  note?: string;
  errorMessage?: string;
  costGbp: number;
  durationMs: number;
};

export type EvalSummary = {
  suite: string;
  total: number;
  passed: number;
  failed: number;
  errored: number;
  passRate: number;
  costGbp: number;
};

function summarise(suite: string, results: EvalResult[]): EvalSummary {
  const passed = results.filter((r) => r.passed).length;
  const errored = results.filter((r) => r.errorMessage).length;
  return {
    suite,
    total: results.length,
    passed,
    failed: results.length - passed - errored,
    errored,
    passRate: results.length ? passed / results.length : 0,
    costGbp: results.reduce((acc, r) => acc + r.costGbp, 0),
  };
}

/* ---------- compliance ---------- */

const complianceSchema = z.object({
  passed: z.boolean(),
  riskScore: z.number().min(0).max(1),
  issues: z
    .array(
      z.object({
        code: z.string(),
        severity: z.enum(["info", "warn", "error"]),
        message: z.string(),
      }),
    )
    .max(20),
});

async function runComplianceCase(
  ctx: { companyId: string; userId?: string },
  item: ComplianceCase,
): Promise<EvalResult> {
  const started = Date.now();
  try {
    const res = await runObject({
      kind: "compliance_guardrail",
      ctx,
      system: `You audit UK B2B outreach emails from contractors to planning applicants. Return strict JSON only.

**passed: true** for ordinary cold outreach: mentioning the recipient’s **public** planning application is normal market research — it is NOT “an existing relationship” under PECR. Reserve relationship-fraud flags for text that clearly implies a **prior private conversation, meeting, contract, or ongoing engagement** (e.g. “following up from our call”).

**passed: false** for: guarantees of approval; false prior relationship; **no** clear opt-out or way to decline further contact (set **passed: false** with at least one **error**-severity issue — do not “pass with warnings” when opt-out is missing); sensitive PII beyond normal business contact (e.g. NI numbers, bank details); clearly misleading CAP-style claims.

Do **not** fail for: generic salutations (“Dear applicant”, “Sir/Madam”); short professional intros; “reply STOP” (or similar) when the opt-out is obvious; a named company in the sign-off as sender identification.

Only flag **real** problems. Prefer **warn** (or **info**) over **error** when the issue is borderline **except** missing opt-out, which must be **error** if there is no way to stop contact.`,
      prompt: `Channel: email
Subject: ${item.subject}
Body (HTML):
${item.bodyHtml}`,
      schema: complianceSchema,
      traceName: `eval.compliance.${item.id}`,
    });
    return {
      suite: "compliance",
      caseId: item.id,
      passed: res.data.passed === item.expectedPassed,
      expected: { passed: item.expectedPassed },
      actual: res.data,
      note: item.note,
      costGbp: res.costGbp,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    return {
      suite: "compliance",
      caseId: item.id,
      passed: false,
      expected: { passed: item.expectedPassed },
      actual: null,
      note: item.note,
      errorMessage: err instanceof Error ? err.message : String(err),
      costGbp: 0,
      durationMs: Date.now() - started,
    };
  }
}

/* ---------- icp classifier ---------- */

const icpSchema = z.object({
  fit: z.boolean(),
  score: z.number().min(0).max(1),
  reason: z.string().min(2).max(400),
});

async function runIcpCase(
  ctx: { companyId: string; userId?: string },
  item: IcpCase,
): Promise<EvalResult> {
  const started = Date.now();
  try {
    const res = await runObject({
      kind: "icp_classifier",
      ctx,
      system: `You classify UK planning applications for outreach fit. Return strict JSON only. Be conservative — "fit: false" for borderline cases.`,
      prompt: `ICP description:
${item.icp.description}
Keywords: ${item.icp.keywords.join(", ") || "(none)"}
Preferred statuses: ${item.icp.statuses.join(", ") || "(any)"}
Min project value: ${item.icp.minProjectValueGbp ? `£${item.icp.minProjectValueGbp}` : "(any)"}

Candidate:
- Reference: ${item.candidate.reference}
- Site: ${item.candidate.siteAddress ?? "unknown"}
- Description: ${item.candidate.description ?? "unknown"}
- Status: ${item.candidate.status ?? "unknown"}
- Type: ${item.candidate.applicationType ?? "unknown"}`,
      schema: icpSchema,
      traceName: `eval.icp.${item.id}`,
    });
    return {
      suite: "icp_classifier",
      caseId: item.id,
      passed: res.data.fit === item.expectedFit,
      expected: { fit: item.expectedFit },
      actual: res.data,
      note: item.note,
      costGbp: res.costGbp,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    return {
      suite: "icp_classifier",
      caseId: item.id,
      passed: false,
      expected: { fit: item.expectedFit },
      actual: null,
      note: item.note,
      errorMessage: err instanceof Error ? err.message : String(err),
      costGbp: 0,
      durationMs: Date.now() - started,
    };
  }
}

/* ---------- nl search (shared module `nl-search-parse`, also used by API route) ---------- */

async function runNlCase(
  ctx: { companyId: string; userId?: string },
  item: NlSearchCase,
): Promise<EvalResult> {
  const started = Date.now();
  try {
    const res = await parseNlSearch({
      prompt: item.prompt,
      companyId: ctx.companyId,
      userId: ctx.userId,
      traceName: `eval.nl.${item.id}`,
    });
    const actual = res.data as Record<string, unknown>;
    const missing = item.expectKeys.filter((k) => {
      const v = actual[k];
      if (v == null) return true;
      if (Array.isArray(v)) return v.length === 0;
      if (typeof v === "string") return v.length === 0;
      return false;
    });
    return {
      suite: "nl_search",
      caseId: item.id,
      passed: missing.length === 0,
      expected: { expectKeys: item.expectKeys },
      actual: { ...actual, _missing: missing },
      note: item.note,
      costGbp: res.costGbp,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    return {
      suite: "nl_search",
      caseId: item.id,
      passed: false,
      expected: { expectKeys: item.expectKeys },
      actual: null,
      note: item.note,
      errorMessage: err instanceof Error ? err.message : String(err),
      costGbp: 0,
      durationMs: Date.now() - started,
    };
  }
}

export async function runAllEvals(
  companyId: string,
  opts: { suites?: Array<"compliance" | "icp_classifier" | "nl_search"> } = {},
): Promise<{ results: EvalResult[]; summaries: EvalSummary[] }> {
  const suites = new Set(
    opts.suites ?? (["compliance", "icp_classifier", "nl_search"] as const),
  );
  const ctx = { companyId };
  const results: EvalResult[] = [];

  if (suites.has("compliance")) {
    for (const item of COMPLIANCE_DATASET) {
      results.push(await runComplianceCase(ctx, item));
    }
  }
  if (suites.has("icp_classifier")) {
    for (const item of ICP_DATASET) {
      results.push(await runIcpCase(ctx, item));
    }
  }
  if (suites.has("nl_search")) {
    for (const item of NL_SEARCH_DATASET) {
      results.push(await runNlCase(ctx, item));
    }
  }

  const summaries: EvalSummary[] = [];
  for (const suite of ["compliance", "icp_classifier", "nl_search"]) {
    const scoped = results.filter((r) => r.suite === suite);
    if (scoped.length > 0) summaries.push(summarise(suite, scoped));
  }

  return { results, summaries };
}
