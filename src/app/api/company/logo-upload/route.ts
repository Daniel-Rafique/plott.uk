/**
 * Server-side logo upload for onboarding + settings flows.
 *
 * Uses `put()` from @vercel/blob directly so we don't depend on the client
 * upload token exchange. Accepts FormData with a single "file" field.
 */
import { NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

const MAX_SIZE = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/svg+xml",
  "image/webp",
];

export async function POST(req: Request): Promise<Response> {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit("blobUpload", ctx.company.id);
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
      { error: `File too large (max ${MAX_SIZE / 1024 / 1024}MB)` },
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
  const pathname = `logo/co_${ctx.company.id}/${Date.now()}-${safeName}`;

  try {
    // Remove old logo if present (best-effort - don't block on failure)
    if (ctx.company.logoBlobUrl) {
      await del(ctx.company.logoBlobUrl).catch(() => {
        // ignore
      });
    }

    const blob = await put(pathname, file, {
      access: "private",
      contentType: file.type,
      addRandomSuffix: false,
    });

    await prisma.company.update({
      where: { id: ctx.company.id },
      data: {
        logoBlobUrl: blob.url,
        logoBlobPathname: blob.pathname,
      },
    });

    return NextResponse.json({ url: blob.url, pathname: blob.pathname });
  } catch (err) {
    logger.error({ err, companyId: ctx.company.id }, "logo_upload_failed");
    const message =
      err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
