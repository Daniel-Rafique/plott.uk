/**
 * AI eval CLI. Runs the datasets in `src/lib/ai/evals/datasets.ts` against the
 * real models configured in `src/lib/ai/router.ts`, then prints a Markdown
 * report and exits 1 if any suite's pass rate falls below the `--threshold`
 * argument (default 0.8).
 *
 * Usage (local):
 *   tsx scripts/run-evals.ts --companyId <uuid> --threshold 0.8
 *
 * If `--companyId` and `EVAL_COMPANY_ID` are both unset (or empty), the script
 * uses the oldest `Company` row in `DATABASE_URL` so CI works with only
 * `EVAL_DATABASE_URL` + model keys. Prefer an explicit id when you need a
 * dedicated evals tenant.
 *
 * In CI we capture stdout to a GitHub step summary. See
 * `.github/workflows/ai-evals.yml` and `docs/ai-evals.md`.
 */

import { config as loadEnv } from "dotenv";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), ".env.local"), override: false });

import { prisma } from "@/lib/prisma";
import { runAllEvals } from "../src/lib/ai/evals/run";
import type { EvalResult, EvalSummary } from "../src/lib/ai/evals/run";

type Args = {
  companyId: string;
  threshold: number;
  report?: string;
  suites?: Array<"compliance" | "icp_classifier" | "nl_search">;
};

function readExplicitCompanyId(argv: string[]): string | undefined {
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--companyId") {
      const v = argv[++i]?.trim();
      if (v) return v;
    }
  }
  const env = process.env.EVAL_COMPANY_ID?.trim();
  return env || undefined;
}

function parseArgs(argv: string[], companyId: string): Args {
  const out: Partial<Omit<Args, "companyId">> = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--companyId") {
      i++;
      continue;
    }
    if (a === "--threshold") out.threshold = parseFloat(argv[++i]);
    else if (a === "--report") out.report = argv[++i];
    else if (a === "--suite") {
      out.suites = [
        ...(out.suites ?? []),
        argv[++i] as "compliance" | "icp_classifier" | "nl_search",
      ];
    }
  }
  return {
    companyId,
    threshold: out.threshold ?? 0.8,
    report: out.report,
    suites: out.suites,
  };
}

async function resolveCompanyId(argv: string[]): Promise<string> {
  const explicit = readExplicitCompanyId(argv);
  if (explicit) return explicit;

  const row = await prisma.company.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!row) {
    throw new Error(
      "No companies in DATABASE_URL. Seed a company or pass --companyId / set EVAL_COMPANY_ID.",
    );
  }
  console.log(
    `[evals] no --companyId or EVAL_COMPANY_ID; using oldest Company.id: ${row.id}`,
  );
  return row.id;
}

function renderMarkdown(
  args: Args,
  summaries: EvalSummary[],
  results: EvalResult[],
): string {
  const lines: string[] = [];
  lines.push("# AI eval report");
  lines.push("");
  lines.push(`- Company: \`${args.companyId}\``);
  lines.push(`- Threshold: ${args.threshold}`);
  lines.push(`- When: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| Suite | Passed | Failed | Errored | Pass rate | Cost (GBP) |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: |");
  for (const s of summaries) {
    lines.push(
      `| \`${s.suite}\` | ${s.passed} | ${s.failed} | ${s.errored} | ${(
        s.passRate * 100
      ).toFixed(1)}% | £${s.costGbp.toFixed(4)} |`,
    );
  }
  lines.push("");
  lines.push("## Failures");
  const failures = results.filter((r) => !r.passed);
  if (failures.length === 0) {
    lines.push("None.");
  } else {
    for (const f of failures) {
      lines.push(`### \`${f.suite}\` — \`${f.caseId}\``);
      lines.push(`- Expected: \`${JSON.stringify(f.expected)}\``);
      lines.push(`- Actual: \`${JSON.stringify(f.actual)}\``);
      if (f.errorMessage) lines.push(`- Error: \`${f.errorMessage}\``);
      if (f.note) lines.push(`- Note: ${f.note}`);
      lines.push("");
    }
  }
  return lines.join("\n");
}

async function main() {
  const companyId = await resolveCompanyId(process.argv);
  const args = parseArgs(process.argv, companyId);
  console.log(
    `[evals] companyId=${args.companyId} threshold=${args.threshold}${args.suites ? ` suites=${args.suites.join(",")}` : ""}`,
  );
  const { results, summaries } = await runAllEvals(args.companyId, {
    suites: args.suites,
  });

  const markdown = renderMarkdown(args, summaries, results);
  console.log("\n" + markdown);
  if (args.report) {
    writeFileSync(args.report, markdown, "utf8");
    console.log(`\n[evals] wrote report to ${args.report}`);
  }

  const failing = summaries.filter((s) => s.passRate < args.threshold);
  if (failing.length > 0) {
    console.error(
      `[evals] ❌ ${failing.map((s) => `${s.suite} (${(s.passRate * 100).toFixed(1)}%)`).join(", ")} below threshold ${args.threshold}`,
    );
    process.exit(1);
  }
  console.log(`[evals] ✅ all suites met threshold ${args.threshold}`);
}

void (async () => {
  try {
    await main();
  } catch (err) {
    console.error("[evals] fatal:", err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
