import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { runComplianceGuardrail } from "@/lib/ai/agents/compliance";
import { logger } from "@/lib/logger";
import { planningEntityToNumber } from "@/lib/planning-entity-bigint";
import { scheduleLetterPdfEmailDelivery } from "@/lib/letter-delivery";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };
const VALID = new Set(["draft", "printed", "sent", "failed"]);
// Compliance gates letter GENERATION (printed), not bookkeeping status updates.
// By the time the user marks a letter as "sent", it's already been physically
// mailed — blocking the status update serves no purpose.
const SENDING_STATUSES = new Set(["printed"]);

export async function PATCH(req: Request, context: Ctx) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const body = (await req.json().catch(() => ({}))) as {
    status?: string;
    /** Skip compliance — allowed only when the user has seen + dismissed warnings. */
    force?: boolean;
  };
  if (!body.status || !VALID.has(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const letter = await prisma.letter.findUnique({ where: { id } });
  if (!letter || letter.companyId !== ctx.company.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Guardrail: block terminal transitions on compliance errors, warn on warnings.
  if (SENDING_STATUSES.has(body.status) && !body.force) {
    try {
      const result = await runComplianceGuardrail({
        ctx: { companyId: ctx.company.id, userId: ctx.user.id },
        subject: letter.subject,
        bodyHtml: letter.bodyHtml,
        recipientKind: "applicant",
        channel: "print",
      });
      const hasErrors = result.issues.some((i) => i.severity === "error");
      const hasWarnings = result.issues.some((i) => i.severity === "warn");
      if (!result.passed || hasErrors) {
        return NextResponse.json(
          {
            error: "Compliance check failed",
            issues: result.issues,
            riskScore: result.riskScore,
            blocking: true,
          },
          { status: 422 },
        );
      }
      if (hasWarnings) {
        // Soft block — client must resubmit with `force: true` after showing the warnings.
        return NextResponse.json(
          {
            warning: "Compliance warnings detected",
            issues: result.issues,
            riskScore: result.riskScore,
            blocking: false,
          },
          { status: 409 },
        );
      }
    } catch (err) {
      // Compliance service failures shouldn't block legitimate sends — log and continue.
      logger.warn({ err, letterId: id }, "compliance guardrail errored; allowing send");
    }
  }

  const shouldDeliverPdfAttachment =
    (body.status === "printed" && letter.status !== "printed") ||
    (body.status === "sent" && letter.status !== "sent");

  const updated = await prisma.letter.update({
    where: { id },
    data: {
      status: body.status,
      sentAt: body.status === "sent" ? new Date() : letter.sentAt,
    },
  });

  if (shouldDeliverPdfAttachment) {
    scheduleLetterPdfEmailDelivery({
      letterId: updated.id,
      autoPrint:
        body.status === "printed" && letter.status !== "printed",
    });
  }

  return NextResponse.json({
    letter: {
      ...updated,
      planningEntity: planningEntityToNumber(updated.planningEntity),
    },
  });
}
