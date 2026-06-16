/**
 * Authenticated proxy for the current tenant's company logo.
 *
 * The Vercel Blob store is configured as PRIVATE, so the raw blob URL is not
 * publicly fetchable. This endpoint streams the logo back to the authenticated
 * user using the BLOB_READ_WRITE_TOKEN, so `<img src="/api/company/logo/view">`
 * works inside the app without exposing the private URL.
 */
import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { fetchBlobBuffer } from "@/lib/blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = ctx.company.logoBlobUrl;
  if (!url) {
    return NextResponse.json({ error: "No logo" }, { status: 404 });
  }

  const result = await fetchBlobBuffer(url);
  if (!result) {
    return NextResponse.json({ error: "Failed to fetch logo" }, { status: 502 });
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
