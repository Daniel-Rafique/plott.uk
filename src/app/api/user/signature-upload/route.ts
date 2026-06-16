/**
 * Server-side signature image upload (private Vercel Blob store).
 */
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";
import { deleteBlob } from "@/lib/blob";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

const MAX_SIZE = 512 * 1024; // 512 KB
const ALLOWED_TYPES = ["image/png", "image/svg+xml"];

export async function POST(req: Request): Promise<Response> {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit("blobUpload", ctx.user.id);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_SIZE / 1024}KB)` },
      { status: 400 },
    );
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: `Unsupported type: ${file.type}` },
      { status: 400 },
    );
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120);
  const pathname = `signature/co_${ctx.company.id}/u_${ctx.user.id}/${Date.now()}-${safeName}`;

  try {
    const existing = await prisma.user.findUnique({
      where: { id: ctx.user.id },
      select: { signatureBlobUrl: true },
    });
    if (existing?.signatureBlobUrl) {
      await deleteBlob(existing.signatureBlobUrl);
    }

    const blob = await put(pathname, file, {
      access: "private",
      contentType: file.type,
      addRandomSuffix: false,
    });

    await prisma.user.update({
      where: { id: ctx.user.id },
      data: { signatureBlobUrl: blob.url, signatureSvg: null },
    });

    return NextResponse.json({ url: blob.url, pathname: blob.pathname });
  } catch (err) {
    logger.error({ err, userId: ctx.user.id }, "signature_upload_failed");
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
