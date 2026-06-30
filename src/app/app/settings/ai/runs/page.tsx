import { redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant";
import {
  fetchAgentRunsDashboard,
  parseAgentRunsSearchParams,
} from "@/lib/agent-runs-query";
import { AgentRunsDashboard } from "@/components/ai/agent-runs-dashboard";

export const dynamic = "force-dynamic";

const BASE_PATH = "/app/settings/ai/runs";

export default async function AiRunsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/auth/sign-in");

  const raw = await searchParams;
  const filters = parseAgentRunsSearchParams(raw, {
    companyId: ctx.company.id,
  });
  const data = await fetchAgentRunsDashboard(filters);

  return (
    <AgentRunsDashboard
      scope="company"
      basePath={BASE_PATH}
      filters={filters}
      runs={data.runs}
      stats24h={data.stats24h}
      byKind7d={data.byKind7d}
    />
  );
}
