import type { Company, Membership, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasSubscriptionAccess } from "@/lib/subscription-entitlement";
import { oauthConfig, type OAuthScope } from "@/lib/mcp/oauth/config";
import { verifyAccessToken } from "@/lib/mcp/oauth/tokens";

export class McpAuthError extends Error {
  constructor(
    message: string,
    public readonly status = 401,
    public readonly code = "invalid_token",
  ) {
    super(message);
    this.name = "McpAuthError";
  }
}

export type McpAuthContext = {
  user: User;
  company: Company;
  membership: Membership;
  clientId: string;
  scopes: Set<string>;
  jti: string;
  tokenExpiresAt: Date;
};

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7).trim() || null;
}

export async function requireMcpContext(
  request: Request,
): Promise<McpAuthContext> {
  const token = bearerToken(request);
  if (!token) throw new McpAuthError("Bearer token required");
  let claims;
  try {
    claims = await verifyAccessToken(token, oauthConfig().resource);
  } catch {
    throw new McpAuthError("Invalid or expired bearer token");
  }
  const [revoked, grant, membership, user, company] = await Promise.all([
    prisma.oAuthRevokedAccessToken.findUnique({ where: { jti: claims.jti } }),
    prisma.oAuthGrant.findUnique({
      where: {
        clientId_userId_companyId: {
          clientId: claims.client_id,
          userId: claims.sub,
          companyId: claims.company_id,
        },
      },
    }),
    prisma.membership.findUnique({
      where: {
        userId_companyId: {
          userId: claims.sub,
          companyId: claims.company_id,
        },
      },
    }),
    prisma.user.findUnique({ where: { id: claims.sub } }),
    prisma.company.findUnique({ where: { id: claims.company_id } }),
  ]);
  if (revoked || !grant || grant.revokedAt || !membership || !user || !company) {
    throw new McpAuthError("OAuth grant is no longer active");
  }
  if (!hasSubscriptionAccess(company)) {
    throw new McpAuthError(
      "An active subscription is required",
      403,
      "subscription_required",
    );
  }
  const granted = new Set(grant.scopes);
  const scopes = new Set(
    claims.scope.split(/\s+/).filter((scope) => granted.has(scope)),
  );
  if (!scopes.has("mcp")) {
    throw new McpAuthError("MCP scope is required", 403, "insufficient_scope");
  }
  return {
    user,
    company,
    membership,
    clientId: claims.client_id,
    scopes,
    jti: claims.jti,
    tokenExpiresAt: new Date((claims.exp ?? 0) * 1000),
  };
}

export function requireScope(
  context: McpAuthContext,
  scope: OAuthScope,
): void {
  if (!context.scopes.has(scope)) {
    throw new McpAuthError(
      `Scope ${scope} is required`,
      403,
      "insufficient_scope",
    );
  }
}

export function requireRole(
  context: McpAuthContext,
  roles: Array<"owner" | "admin" | "member">,
): void {
  if (!roles.includes(context.membership.role as "owner" | "admin" | "member")) {
    throw new McpAuthError("Workspace role is not permitted", 403, "forbidden");
  }
}

export function mcpChallenge(scope?: string): string {
  const config = oauthConfig();
  const suffix = scope ? `, scope="${scope}"` : "";
  return `Bearer resource_metadata="${config.protectedResourceMetadata}"${suffix}`;
}
