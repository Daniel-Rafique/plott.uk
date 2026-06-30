/**
 * Admin agent trace viewer — all tenants. Non-admins redirect to company runs.
 */

import { redirect } from "next/navigation";
import { isCurrentUserAdmin } from "@/lib/admin";
import { getSessionUser } from "@/lib/auth/session";
import {
  fetchAgentRunsDashboard,
  parseAgentRunsSearchParams,
} from "@/lib/agent-runs-query";
import { AgentRunsDashboard } from "@/components/ai/agent-runs-dashboard";

export const dynamic = "force-dynamic";

const ADMIN_BASE = "/app/admin/agents";
const COMPANY_BASE = "/app/settings/ai/runs";

export default async function AdminAgentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/auth/sign-in");

  const raw = await searchParams;

  const ok = await isCurrentUserAdmin();
  if (!ok) {
    const params = new URLSearchParams();
    if (typeof raw.kind === "string") params.set("kind", raw.kind);
    if (typeof raw.status === "string") params.set("status", raw.status);
    const qs = params.toString();
    redirect(qs ? `${COMPANY_BASE}?${qs}` : COMPANY_BASE);
  }

  const filters = parseAgentRunsSearchParams(raw);
  const data = await fetchAgentRunsDashboard(filters);

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <AgentRunsDashboard
        scope="platform"
        basePath={ADMIN_BASE}
        filters={filters}
        runs={data.runs}
        stats24h={data.stats24h}
        byKind7d={data.byKind7d}
      />
    </div>
  );
}
