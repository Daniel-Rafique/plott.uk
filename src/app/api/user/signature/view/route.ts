/**
 * Authenticated proxy for the current user's signature image.
 * See /api/company/logo/view for the same pattern.
 */
import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { fetchBlobBuffer } from "@/lib/blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: ctx.user.id },
    select: { signatureBlobUrl: true },
  });
  if (!user?.signatureBlobUrl) {
    return NextResponse.json({ error: "No signature" }, { status: 404 });
  }

  const result = await fetchBlobBuffer(user.signatureBlobUrl);
  if (!result) {
    return NextResponse.json({ error: "Failed to fetch signature" }, { status: 502 });
  }

  return new Response(new Uint8Array(result.buffer), {
    status: 200,
    headers: {
      "Content-Type": result.contentType,
      "Cache-Control": "private, max-age=300",
      "Content-Length": String(result.buffer.byteLength),
    },
  });
}
