/**
 * Guardrails applied to every agent run.
 *
 * - PII redaction for trace payloads (hash personal identifiers so we can
 *   still group traces by entity without leaking names/addresses to Langfuse).
 * - Daily budget check per company.
 * - Prompt hashing for auditability.
 */

import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Company } from "@prisma/client";

const PII_FIELDS = new Set([
  "email",
  "phone",
  "address",
  "addressLines",
  "applicantName",
  "agentName",
  "applicantAddress",
  "agentAddress",
  "agentEmail",
  "agentPhone",
  "recipientName",
  "name",
  "fullName",
]);

export function hashIdentifier(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 12);
}

export function promptHash(prompt: unknown): string {
  const s = typeof prompt === "string" ? prompt : JSON.stringify(prompt);
  return createHash("sha256").update(s).digest("hex").slice(0, 16);
}

/**
 * Deep-clone `value` with PII fields hashed. Leaves structure intact so
 * traces remain useful for debugging without exposing personal data.
 */
export function redactForTrace<T>(value: T): T {
  return redact(value) as T;
}

function redact(v: unknown): unknown {
  if (v == null) return v;
  if (Array.isArray(v)) return v.map(redact);
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (PII_FIELDS.has(k) && typeof val === "string" && val) {
        out[k] = `hash:${hashIdentifier(val)}`;
      } else {
        out[k] = redact(val);
      }
    }
    return out;
  }
  return v;
}

export type BudgetCheck =
  | { ok: true }
  | { ok: false; reason: "over_budget" | "disabled"; budgetGbp: number; spentGbp: number };

/**
 * Check whether the company can start another agent run today. Resets the
 * monthly counter if the last reset is more than ~31 days old. `disabled`
 * takes precedence so users can turn AI off completely.
 */
export async function checkBudget(
  company: Pick<
    Company,
    | "id"
    | "aiEnabled"
    | "aiDailyBudgetGbp"
    | "aiMonthlySpendGbp"
    | "aiSpendResetAt"
  >,
): Promise<BudgetCheck> {
  if (!company.aiEnabled) {
    return {
      ok: false,
      reason: "disabled",
      budgetGbp: Number(company.aiDailyBudgetGbp),
      spentGbp: Number(company.aiMonthlySpendGbp),
    };
  }
  const now = new Date();
  const resetAt = company.aiSpendResetAt ?? null;
  const needsReset =
    !resetAt || now.getTime() - resetAt.getTime() > 31 * 24 * 60 * 60 * 1000;
  if (needsReset) {
    await prisma.company.update({
      where: { id: company.id },
      data: { aiMonthlySpendGbp: 0, aiSpendResetAt: now },
    });
    return { ok: true };
  }

  // "Daily" budget is applied as a rolling 24-hour sum on AgentRun rows.
  const sinceYesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const agg = await prisma.agentRun.aggregate({
    where: { companyId: company.id, createdAt: { gte: sinceYesterday } },
    _sum: { costGbp: true },
  });
  const spent = Number(agg._sum.costGbp ?? 0);
  const budget = Number(company.aiDailyBudgetGbp);
  if (spent >= budget) {
    return { ok: false, reason: "over_budget", budgetGbp: budget, spentGbp: spent };
  }
  return { ok: true };
}

export function budgetWarningThreshold(budgetGbp: number): number {
  return Number((budgetGbp * 0.8).toFixed(2));
}
