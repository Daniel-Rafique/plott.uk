import { prisma } from "@/lib/prisma";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { oauthConfig, type OAuthScope } from "@/lib/mcp/oauth/config";
import {
  hashToken,
  issueAccessToken,
  randomToken,
  verifyPkce,
} from "@/lib/mcp/oauth/tokens";
import { recordOAuthAudit } from "@/lib/mcp/oauth/audit";

export const runtime = "nodejs";

function oauthError(error: string, description: string, status = 400) {
  return Response.json(
    { error, error_description: description },
    { status, headers: { "cache-control": "no-store" } },
  );
}

async function tokenResponse(input: {
  userId: string;
  companyId: string;
  role: string;
  clientId: string;
  grantId: string;
  scopes: string[];
  resource: string;
  familyId?: string;
}) {
  const access = await issueAccessToken({
    userId: input.userId,
    companyId: input.companyId,
    role: input.role,
    clientId: input.clientId,
    scopes: input.scopes as OAuthScope[],
    resource: input.resource,
  });
  let refreshToken: string | undefined;
  if (input.scopes.includes("offline_access")) {
    refreshToken = randomToken(48);
    await prisma.oAuthRefreshToken.create({
      data: {
        tokenHash: hashToken(refreshToken),
        familyId: input.familyId ?? randomToken(18),
        grantId: input.grantId,
        scopes: input.scopes,
        resource: input.resource,
        expiresAt: new Date(
          Date.now() + oauthConfig().refreshTokenTtlSeconds * 1000,
        ),
      },
    });
  }
  await recordOAuthAudit({
    event: "token_issued",
    outcome: "success",
    clientId: input.clientId,
    userId: input.userId,
    companyId: input.companyId,
    jti: access.jti,
  });
  return Response.json(
    {
      access_token: access.token,
      token_type: "Bearer",
      expires_in: access.expiresIn,
      scope: input.scopes.join(" "),
      resource: input.resource,
      ...(refreshToken ? { refresh_token: refreshToken } : {}),
    },
    { headers: { "cache-control": "no-store", pragma: "no-cache" } },
  );
}

export async function POST(request: Request) {
  const form = await request.formData();
  const clientId = String(form.get("client_id") ?? "");
  const limited = await checkRateLimit("oauthToken", clientId || "unknown");
  if (!limited.ok) return rateLimitResponse(limited.retryAfterMs);
  const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
  if (!client || client.tokenEndpointAuthMethod !== "none") {
    return oauthError("invalid_client", "Unknown public client", 401);
  }

  const grantType = String(form.get("grant_type") ?? "");
  if (grantType === "authorization_code") {
    const codeHash = hashToken(String(form.get("code") ?? ""));
    const redirectUri = String(form.get("redirect_uri") ?? "");
    const resource = String(form.get("resource") ?? "") || oauthConfig().resource;
    const verifier = String(form.get("code_verifier") ?? "");
    const code = await prisma.oAuthAuthorizationCode.findUnique({
      where: { codeHash },
    });
    if (
      !code ||
      code.clientId !== clientId ||
      code.redirectUri !== redirectUri ||
      code.resource !== resource ||
      code.expiresAt <= new Date() ||
      code.usedAt ||
      !verifyPkce(verifier, code.codeChallenge)
    ) {
      return oauthError("invalid_grant", "Invalid or expired authorization code");
    }
    const claimed = await prisma.oAuthAuthorizationCode.updateMany({
      where: { id: code.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) {
      return oauthError("invalid_grant", "Authorization code was already used");
    }
    const [grant, membership] = await Promise.all([
      prisma.oAuthGrant.findUnique({
        where: {
          clientId_userId_companyId: {
            clientId,
            userId: code.userId,
            companyId: code.companyId,
          },
        },
      }),
      prisma.membership.findUnique({
        where: {
          userId_companyId: { userId: code.userId, companyId: code.companyId },
        },
      }),
    ]);
    if (!grant || grant.revokedAt || !membership) {
      return oauthError("invalid_grant", "Grant is no longer active");
    }
    return tokenResponse({
      userId: code.userId,
      companyId: code.companyId,
      role: membership.role,
      clientId,
      grantId: grant.id,
      scopes: code.scopes,
      resource,
    });
  }

  if (grantType === "refresh_token") {
    const tokenHash = hashToken(String(form.get("refresh_token") ?? ""));
    const stored = await prisma.oAuthRefreshToken.findUnique({
      where: { tokenHash },
      include: { grant: true },
    });
    if (!stored || stored.grant.clientId !== clientId) {
      return oauthError("invalid_grant", "Unknown refresh token");
    }
    if (stored.consumedAt || stored.revokedAt) {
      await prisma.oAuthRefreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await recordOAuthAudit({
        event: "refresh_reuse",
        outcome: "denied",
        clientId,
        userId: stored.grant.userId,
        companyId: stored.grant.companyId,
      });
      return oauthError("invalid_grant", "Refresh token reuse detected");
    }
    if (
      stored.expiresAt <= new Date() ||
      stored.grant.revokedAt ||
      String(form.get("resource") ?? stored.resource) !== stored.resource
    ) {
      return oauthError("invalid_grant", "Refresh token is expired or revoked");
    }
    const claimed = await prisma.oAuthRefreshToken.updateMany({
      where: { id: stored.id, consumedAt: null, revokedAt: null },
      data: { consumedAt: new Date() },
    });
    if (claimed.count !== 1) {
      return oauthError("invalid_grant", "Refresh token was already used");
    }
    const membership = await prisma.membership.findUnique({
      where: {
        userId_companyId: {
          userId: stored.grant.userId,
          companyId: stored.grant.companyId,
        },
      },
    });
    if (!membership) return oauthError("invalid_grant", "Membership was removed");
    return tokenResponse({
      userId: stored.grant.userId,
      companyId: stored.grant.companyId,
      role: membership.role,
      clientId,
      grantId: stored.grantId,
      scopes: stored.scopes,
      resource: stored.resource,
      familyId: stored.familyId,
    });
  }

  return oauthError("unsupported_grant_type", "Unsupported grant type");
}
