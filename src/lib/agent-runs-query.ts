import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type AgentRunsFilters = {
  kind?: string;
  status?: string;
  companyId?: string;
};

export type AgentRunRow = {
  id: string;
  kind: string;
  status: string;
  model: string;
  errorMessage: string | null;
  totalTokens: number;
  costGbp: number;
  toolCalls: number;
  durationMs: number;
  createdAt: Date;
  company: { id: string; name: string; slug: string };
  user: { id: string; email: string | null; name: string | null } | null;
};

export type AgentRunsByKindRow = {
  kind: string;
  status: string;
  count: number;
  costGbp: number;
};

export type AgentRunsDashboardData = {
  runs: AgentRunRow[];
  stats24h: {
    runs: number;
    costGbp: number;
    tokens: number;
    toolCalls: number;
    avgMs: number;
  };
  byKind7d: AgentRunsByKindRow[];
};

function buildWhere(filters: AgentRunsFilters): Prisma.AgentRunWhereInput {
  const where: Prisma.AgentRunWhereInput = {};
  if (filters.kind) where.kind = filters.kind;
  if (filters.status) where.status = filters.status;
  if (filters.companyId) where.companyId = filters.companyId;
  return where;
}

export async function fetchAgentRunsDashboard(
  filters: AgentRunsFilters = {},
): Promise<AgentRunsDashboardData> {
  const where = buildWhere(filters);
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const scope24h: Prisma.AgentRunWhereInput = {
    createdAt: { gte: since24h },
    ...(filters.companyId ? { companyId: filters.companyId } : {}),
  };

  const scope7d: Prisma.AgentRunWhereInput = {
    createdAt: { gte: since7d },
    ...(filters.companyId ? { companyId: filters.companyId } : {}),
  };

  const [runs, last24hStats, byKind] = await Promise.all([
    prisma.agentRun.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        company: { select: { id: true, name: true, slug: true } },
        user: { select: { id: true, email: true, name: true } },
      },
    }),
    prisma.agentRun.aggregate({
      where: scope24h,
      _count: { _all: true },
      _sum: { costGbp: true, totalTokens: true, toolCalls: true },
      _avg: { durationMs: true },
    }),
    prisma.agentRun.groupBy({
      by: ["kind", "status"],
      _count: { _all: true },
      _sum: { costGbp: true },
      where: scope7d,
    }),
  ]);

  return {
    runs: runs.map((r) => ({
      ...r,
      costGbp: Number(r.costGbp),
    })),
    stats24h: {
      runs: last24hStats._count._all,
      costGbp: Number(last24hStats._sum.costGbp ?? 0),
      tokens: last24hStats._sum.totalTokens ?? 0,
      toolCalls: last24hStats._sum.toolCalls ?? 0,
      avgMs: Math.round(last24hStats._avg.durationMs ?? 0),
    },
    byKind7d: byKind.map((row) => ({
      kind: row.kind,
      status: row.status,
      count: row._count._all,
      costGbp: Number(row._sum.costGbp ?? 0),
    })),
  };
}

export function parseAgentRunsSearchParams(
  raw: Record<string, string | string[] | undefined>,
  options?: { companyId?: string },
): AgentRunsFilters {
  return {
    kind: typeof raw.kind === "string" ? raw.kind : undefined,
    status: typeof raw.status === "string" ? raw.status : undefined,
    companyId:
      options?.companyId ??
      (typeof raw.companyId === "string" ? raw.companyId : undefined),
  };
}

export function agentRunsQueryString(
  filters: AgentRunsFilters,
  basePath: string,
): string {
  const params = new URLSearchParams();
  if (filters.kind) params.set("kind", filters.kind);
  if (filters.status) params.set("status", filters.status);
  if (filters.companyId && basePath.includes("/admin/")) {
    params.set("companyId", filters.companyId);
  }
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
