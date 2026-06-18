import { NextResponse } from "next/server";
import { getTenantContext, hasActiveSubscription } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { fetchBlobBuffer } from "@/lib/blob";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, context: Ctx) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasActiveSubscription(ctx.company)) {
    return NextResponse.json(
      { error: "Active subscription required" },
      { status: 403 },
    );
  }

  const { id } = await context.params;
  const letter = await prisma.letter.findUnique({ where: { id } });
  if (!letter || letter.companyId !== ctx.company.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!letter.pdfBlobUrl) {
    return NextResponse.json(
      { error: "No stored PDF is available for this letter." },
      { status: 404 },
    );
  }

  const result = await fetchBlobBuffer(letter.pdfBlobUrl);
  if (!result) {
    return NextResponse.json(
      { error: "Stored PDF could not be fetched." },
      { status: 502 },
    );
  }

  const disposition =
    new URL(req.url).searchParams.get("download") === "1"
      ? "attachment"
      : "inline";

  return new NextResponse(result.buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="letter-${letter.id}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
