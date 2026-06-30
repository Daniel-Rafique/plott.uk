/**
 * Baseline AI spend from production DB (read-only).
 *   npx tsx scripts/audit-usage-db.ts
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), ".env.local"), override: true });

async function main() {
  const prisma = new PrismaClient();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const companies = await prisma.company.findMany({
    where: { subscriptionStatus: { in: ["active", "trialing"] } },
    select: {
      name: true,
      subscriptionPriceId: true,
      aiMonthlySpendGbp: true,
      subscriptionStatus: true,
    },
  });

  const byKind = await prisma.agentRun.groupBy({
    by: ["kind"],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
    _sum: { costGbp: true },
    _avg: { costGbp: true },
    orderBy: { _sum: { costGbp: "desc" } },
  });

  console.log("# AI usage audit (last 30 days)\n");
  console.log("## Active companies");
  console.table(
    companies.map((c) => ({
      name: c.name,
      status: c.subscriptionStatus,
      priceId: c.subscriptionPriceId,
      aiMonthlySpendGbp: Number(c.aiMonthlySpendGbp),
    })),
  );
  console.log("\n## Agent runs by kind");
  console.table(
    byKind.map((r) => ({
      kind: r.kind,
      runs: r._count._all,
      sumGbp: Number(r._sum.costGbp ?? 0).toFixed(4),
      avgGbp: Number(r._avg.costGbp ?? 0).toFixed(4),
    })),
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
