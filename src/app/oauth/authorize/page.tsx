import Link from "next/link";
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
import {
  resolveMcpOAuthSetupPath,
  resolveStage,
} from "@/lib/auth/onboarding-gate";
import { hasSubscriptionAccess } from "@/lib/subscription-entitlement";
import { AuthorizationForm } from "./authorize-actions";

export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

function companyHasMcpAccess(company: {
  subscriptionStatus: string;
  subscriptionCurrentPeriodEnd?: Date | null;
  trialEndsAt?: Date | null;
}): boolean {
  if (process.env.SKIP_SUBSCRIPTION_CHECK === "true") return true;
  return hasSubscriptionAccess(company);
}

function SetupCard({
  title,
  body,
  ctaHref,
  ctaLabel,
  clientName,
}: {
  title: string;
  body: string;
  ctaHref: string;
  ctaLabel: string;
  clientName: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12">
      <section className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium text-blue-700">Plott integration</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-950">{title}</h1>
        <p className="mt-2 text-sm text-zinc-600">{body}</p>
        <p className="mt-4 text-sm text-zinc-500">
          After setup you&apos;ll return here to authorize {clientName}.
        </p>
        <Link
          href={ctaHref}
          className="mt-6 flex w-full items-center justify-center rounded-full bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
        >
          {ctaLabel}
        </Link>
        <p className="mt-4 text-center text-sm text-zinc-500">
          <Link href="/pricing" className="underline underline-offset-2">
            View pricing
          </Link>
        </p>
      </section>
    </main>
  );
}

export default async function OAuthAuthorizePage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const params = await searchParams;
  let request: Awaited<ReturnType<typeof validateAuthorizationRequest>>;
  try {
    request = await validateAuthorizationRequest(params);
  } catch {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12">
        <section className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-semibold text-zinc-950">
            Invalid authorization request
          </h1>
          <p className="mt-3 text-sm text-zinc-600">
            This MCP connection request is invalid or has expired. Return to
            your MCP client and start the connection again.
          </p>
        </section>
      </main>
    );
  }
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

  const stage = await resolveStage();
  const setupPath = resolveMcpOAuthSetupPath(stage, returnPath);
  if (setupPath) {
    redirect(setupPath);
  }

  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    include: { company: true },
    orderBy: { createdAt: "asc" },
  });
  const activeMemberships = memberships.filter((membership) =>
    companyHasMcpAccess(membership.company),
  );

  if (!activeMemberships.length) {
    return (
      <SetupCard
        title="Subscribe to use Plott MCP"
        body="MCP access requires an active Plott workspace subscription. Choose a plan, then return to finish authorizing this client."
        ctaHref={`/subscribe?next=${encodeURIComponent(returnPath)}`}
        ctaLabel="Choose a plan"
        clientName={request.clientName}
      />
    );
  }

  const defaultCompanyId =
    activeMemberships.find((m) => m.companyId === user.activeCompanyId)
      ?.companyId ?? activeMemberships[0]?.companyId;

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

        <AuthorizationForm>
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
              defaultValue={defaultCompanyId}
              className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2"
            >
              {activeMemberships.map((membership) => (
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
        </AuthorizationForm>
      </section>
    </main>
  );
}
