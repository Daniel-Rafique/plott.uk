import { decodeJwt } from "jose";
import { prisma } from "@/lib/prisma";
import { hashToken, verifyAccessToken } from "@/lib/mcp/oauth/tokens";
import { recordOAuthAudit } from "@/lib/mcp/oauth/audit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const form = await request.formData();
  const clientId = String(form.get("client_id") ?? "");
  const token = String(form.get("token") ?? "");
  const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
  if (!client) {
    return Response.json({ error: "invalid_client" }, { status: 401 });
  }

  const refresh = await prisma.oAuthRefreshToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { grant: true },
  });
  if (refresh?.grant.clientId === clientId) {
    await prisma.oAuthRefreshToken.updateMany({
      where: { familyId: refresh.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await recordOAuthAudit({
      event: "token_revoked",
      outcome: "success",
      clientId,
      userId: refresh.grant.userId,
      companyId: refresh.grant.companyId,
    });
    return new Response(null, { status: 200 });
  }

  try {
    const claims = await verifyAccessToken(token);
    if (claims.client_id === clientId && claims.exp) {
      await prisma.oAuthRevokedAccessToken.upsert({
        where: { jti: claims.jti },
        create: { jti: claims.jti, expiresAt: new Date(claims.exp * 1000) },
        update: {},
      });
    }
  } catch {
    // RFC 7009 does not reveal whether a token was valid.
    try {
      decodeJwt(token);
    } catch {
      // Ignore opaque or malformed values.
    }
  }
  return new Response(null, { status: 200 });
}
