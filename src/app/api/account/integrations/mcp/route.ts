import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { recordOAuthAudit } from "@/lib/mcp/oauth/audit";

export const runtime = "nodejs";

export async function GET() {
  const context = await getTenantContext({ requireVerified: true });
  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const grants = await prisma.oAuthGrant.findMany({
    where: { userId: context.user.id, revokedAt: null },
    include: {
      client: {
        select: {
          clientId: true,
          clientName: true,
          clientUri: true,
          createdAt: true,
        },
      },
      company: { select: { id: true, name: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({
    grants: grants.map((grant) => ({
      id: grant.id,
      client: grant.client,
      company: grant.company,
      scopes: grant.scopes,
      createdAt: grant.createdAt,
      updatedAt: grant.updatedAt,
    })),
  });
}

export async function DELETE(request: Request) {
  const context = await getTenantContext({ requireVerified: true });
  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as {
    grantId?: string;
  } | null;
  if (!body?.grantId) {
    return NextResponse.json({ error: "grantId is required" }, { status: 400 });
  }
  const grant = await prisma.oAuthGrant.findFirst({
    where: { id: body.grantId, userId: context.user.id },
  });
  if (!grant) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.$transaction([
    prisma.oAuthGrant.update({
      where: { id: grant.id },
      data: { revokedAt: new Date() },
    }),
    prisma.oAuthRefreshToken.updateMany({
      where: { grantId: grant.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
  await recordOAuthAudit({
    event: "grant_revoked",
    outcome: "success",
    clientId: grant.clientId,
    userId: context.user.id,
    companyId: grant.companyId,
  });
  return NextResponse.json({ ok: true });
}
