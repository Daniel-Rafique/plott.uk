import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { captureError, trackEvent } from "@/lib/observability";

export async function recordOAuthAudit(input: {
  event: string;
  outcome: "success" | "denied" | "error";
  clientId?: string;
  userId?: string;
  companyId?: string;
  jti?: string;
  toolName?: string;
  metadata?: Prisma.InputJsonValue;
}) {
  try {
    await prisma.oAuthAuditEvent.create({
      data: {
        event: input.event,
        outcome: input.outcome,
        clientId: input.clientId,
        userId: input.userId,
        companyId: input.companyId,
        jti: input.jti,
        toolName: input.toolName,
        metadata: input.metadata,
      },
    });
    await trackEvent(`mcp_${input.event}`, {
      outcome: input.outcome,
      clientId: input.clientId,
      userId: input.userId,
      companyId: input.companyId,
      toolName: input.toolName,
    });
  } catch (error) {
    captureError(error, {
      userId: input.userId,
      companyId: input.companyId,
      extra: { surface: "mcp_oauth", event: input.event },
    });
  }
}
