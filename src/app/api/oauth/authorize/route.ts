import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { upsertUserFromSession } from "@/lib/tenant";
import { userNeedsSecondFactor } from "@/lib/auth/second-factor";
import { hasSubscriptionAccess } from "@/lib/subscription-entitlement";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { oauthConfig } from "@/lib/mcp/oauth/config";
import { validateAuthorizationRequest } from "@/lib/mcp/oauth/authorization-request";
import { hashToken, randomToken } from "@/lib/mcp/oauth/tokens";
import { recordOAuthAudit } from "@/lib/mcp/oauth/audit";

export const runtime = "nodejs";

function redirectWith(
  redirectUri: string,
  values: Record<string, string>,
): NextResponse {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(values)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin !== oauthConfig().origin) {
    return Response.json({ error: "invalid_request" }, { status: 403 });
  }
  const form = await request.formData();
  const params = Object.fromEntries(
    [...form.entries()].map(([key, value]) => [key, String(value)]),
  );
  const authRequest = await validateAuthorizationRequest({
    ...params,
    response_type: "code",
  });
  if (params.decision === "deny") {
    return redirectWith(authRequest.redirectUri, {
      error: "access_denied",
      state: authRequest.state,
    });
  }

  const session = await getSessionUser();
  if (!session || !session.emailVerified) {
    return Response.json({ error: "login_required" }, { status: 401 });
  }
  const limited = await checkRateLimit("oauthAuthorize", session.id);
  if (!limited.ok) return rateLimitResponse(limited.retryAfterMs);
  const user = await upsertUserFromSession(session);
  if (await userNeedsSecondFactor(user.id)) {
    return Response.json({ error: "second_factor_required" }, { status: 403 });
  }

  const companyId = String(form.get("company_id") ?? "");
  const membership = await prisma.membership.findUnique({
    where: { userId_companyId: { userId: user.id, companyId } },
    include: { company: true },
  });
  if (!membership || !hasSubscriptionAccess(membership.company)) {
    return Response.json(
      { error: "access_denied", error_description: "Active workspace required" },
      { status: 403 },
    );
  }

  const code = randomToken(32);
  await prisma.$transaction(async (tx) => {
    await tx.oAuthGrant.upsert({
      where: {
        clientId_userId_companyId: {
          clientId: authRequest.clientId,
          userId: user.id,
          companyId,
        },
      },
      create: {
        clientId: authRequest.clientId,
        userId: user.id,
        companyId,
        scopes: authRequest.scopes,
      },
      update: { scopes: authRequest.scopes, revokedAt: null },
    });
    await tx.oAuthAuthorizationCode.create({
      data: {
        codeHash: hashToken(code),
        clientId: authRequest.clientId,
        userId: user.id,
        companyId,
        scopes: authRequest.scopes,
        redirectUri: authRequest.redirectUri,
        resource: authRequest.resource,
        codeChallenge: authRequest.codeChallenge,
        expiresAt: new Date(
          Date.now() + oauthConfig().authorizationCodeTtlSeconds * 1000,
        ),
      },
    });
  });
  await recordOAuthAudit({
    event: "grant_authorized",
    outcome: "success",
    clientId: authRequest.clientId,
    userId: user.id,
    companyId,
    metadata: { scopes: authRequest.scopes },
  });
  return redirectWith(authRequest.redirectUri, {
    code,
    state: authRequest.state,
  });
}
