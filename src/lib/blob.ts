import { del, put, type PutBlobResult } from "@vercel/blob";

export type StoreKind = "logo" | "signature" | "letter";

/**
 * Our Vercel Blob store is configured with PRIVATE access.
 * - `put()` must pass `access: "private"` (mismatching the store throws).
 * - The returned `url` is NOT publicly fetchable; callers must either:
 *     a) Proxy via an authenticated server route (see /api/company/logo/view)
 *     b) Fetch bytes server-side using `fetchBlobBuffer()` for inlining into
 *        PDFs / emails that cannot authenticate.
 */

export async function storeBlob(args: {
  companyId: string;
  kind: StoreKind;
  filename: string;
  contentType: string;
  data: Buffer | Blob | ArrayBuffer;
}): Promise<PutBlobResult> {
  const safe = args.filename.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120);
  const pathname = `${args.kind}/co_${args.companyId}/${Date.now()}-${safe}`;
  return put(pathname, args.data as Blob | Buffer, {
    access: "private",
    contentType: args.contentType,
    addRandomSuffix: false,
  });
}

export async function deleteBlob(pathnameOrUrl: string): Promise<void> {
  await del(pathnameOrUrl).catch((err) => {
    console.warn("Blob delete failed", err);
  });
}

/**
 * Server-side fetch of a private blob's raw bytes using BLOB_READ_WRITE_TOKEN.
 * Used by PDF/email renderers that can't make authenticated requests.
 */
export async function fetchBlobBuffer(
  url: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.warn("[blob] BLOB_READ_WRITE_TOKEN not set; cannot fetch private blob");
    return null;
  }
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn("[blob] fetchBlobBuffer failed", res.status, url);
      return null;
    }
    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    const buffer = Buffer.from(await res.arrayBuffer());
    return { buffer, contentType };
  } catch (err) {
    console.warn("[blob] fetchBlobBuffer error", err);
    return null;
  }
}

/**
 * Fetch a private blob and return it as a data URI (for inlining into
 * react-pdf <Image> or HTML emails as <img src="data:...">).
 */
export async function fetchBlobAsDataUri(url: string): Promise<string | null> {
  const result = await fetchBlobBuffer(url);
  if (!result) return null;
  return `data:${result.contentType};base64,${result.buffer.toString("base64")}`;
}
