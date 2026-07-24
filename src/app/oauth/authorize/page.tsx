import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { upsertUserFromSession } from "@/lib/tenant";
import { userNeedsSecondFactor } from "@/lib/auth/second-factor";
import { prisma } from "@/lib/prisma";
import {
  OAUTH_SCOPES,
  type OAuthScope,
} from "@/lib/mcp/oauth/config";
import { validateAuthorizationRequest } from "@/lib/mcp/oauth/authorization-request";

export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function OAuthAuthorizePage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const params = await searchParams;
  const request = await validateAuthorizationRequest(params);
  const session = await getSessionUser();
  const returnPath = `/oauth/authorize?${new URLSearchParams(
    Object.entries(params).flatMap(([key, value]) =>
      typeof value === "string" ? [[key, value]] : [],
    ),
  ).toString()}`;
  if (!session) {
    redirect(`/auth/sign-in?next=${encodeURIComponent(returnPath)}`);
  }
  if (!session.emailVerified) {
    redirect(`/auth/verify-email?next=${encodeURIComponent(returnPath)}`);
  }
  const user = await upsertUserFromSession(session);
  if (await userNeedsSecondFactor(user.id)) {
    redirect(`/auth/two-factor?next=${encodeURIComponent(returnPath)}`);
  }
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    include: { company: true },
    orderBy: { createdAt: "asc" },
  });
  if (!memberships.length) redirect("/onboarding");

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12">
      <section className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium text-blue-700">Plott integration</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
          Authorize {request.clientName}
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Choose the workspace this MCP client may use. You can revoke access
          from Plott settings at any time.
        </p>

        <form action="/api/oauth/authorize" method="post" className="mt-6">
          {[
            ["client_id", request.clientId],
            ["redirect_uri", request.redirectUri],
            ["scope", request.scopes.join(" ")],
            ["state", request.state],
            ["resource", request.resource],
            ["code_challenge", request.codeChallenge],
            ["code_challenge_method", "S256"],
          ].map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}

          <label className="block text-sm font-medium text-zinc-800">
            Workspace
            <select
              name="company_id"
              defaultValue={user.activeCompanyId ?? memberships[0]?.companyId}
              className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2"
            >
              {memberships.map((membership) => (
                <option key={membership.companyId} value={membership.companyId}>
                  {membership.company.name} ({membership.role})
                </option>
              ))}
            </select>
          </label>

          <div className="mt-6 rounded-xl border border-zinc-200 p-4">
            <h2 className="text-sm font-semibold text-zinc-900">
              Requested access
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-zinc-600">
              {request.scopes.map((scope) => (
                <li key={scope}>
                  {OAUTH_SCOPES[scope as OAuthScope] ?? scope}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              type="submit"
              name="decision"
              value="approve"
              className="flex-1 rounded-full bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white"
            >
              Authorize
            </button>
            <button
              type="submit"
              name="decision"
              value="deny"
              className="rounded-full border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-700"
            >
              Deny
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
