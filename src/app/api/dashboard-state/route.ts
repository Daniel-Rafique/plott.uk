/**
 * Per-user dashboard search-state persistence.
 *
 * The dashboard is a full-screen map + filter app whose entire state lives
 * in React `useState`. To survive refresh / logout / login we persist a
 * snapshot (bounds + filters + cached results) on the signed-in user and
 * restore it on mount.
 *
 * - GET  — returns the stored JSON blob or `null`.
 * - PUT  — validates the body is a plausible state object and writes it.
 * - POST — identical to PUT; accepted so `navigator.sendBeacon` can flush
 *          state on `pagehide` (beacons are POST-only).
 *
 * The blob is capped at 500KB to keep DB writes cheap; the client also
 * debounces writes so rapid filter toggles don't spam this endpoint.
 */

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

const MAX_BYTES = 500_000;

export async function GET() {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: ctx.user.id },
    select: { dashboardState: true },
  });

  return NextResponse.json({ state: user?.dashboardState ?? null });
}

export async function PUT(req: Request) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Body must be an object" },
      { status: 400 },
    );
  }

  // Size guard — Prisma/Postgres can handle more, but a sane cap avoids
  // accidentally persisting huge enriched result sets forever.
  const serialised = JSON.stringify(body);
  if (serialised.length > MAX_BYTES) {
    return NextResponse.json(
      { error: `Payload too large (>${MAX_BYTES} bytes)` },
      { status: 413 },
    );
  }

  // Loose shape check: at minimum we need `bounds` (or null) and `filters`.
  // The client owns the detailed contract; the API only guards against
  // obvious junk so a malformed write can't corrupt the column.
  const b = body as Record<string, unknown>;
  const hasBounds =
    b.bounds === null ||
    (typeof b.bounds === "object" &&
      b.bounds !== null &&
      ["west", "south", "east", "north"].every(
        (k) => typeof (b.bounds as Record<string, unknown>)[k] === "number",
      ));
  if (!hasBounds) {
    return NextResponse.json(
      { error: "`bounds` must be null or {west,south,east,north:number}" },
      { status: 400 },
    );
  }
  if (typeof b.filters !== "object" || b.filters === null) {
    return NextResponse.json(
      { error: "`filters` must be an object" },
      { status: 400 },
    );
  }

  await prisma.user.update({
    where: { id: ctx.user.id },
    data: { dashboardState: body as object },
  });

  return NextResponse.json({ ok: true });
}

// `navigator.sendBeacon` only sends POST, so alias POST to PUT. This lets
// the client flush state reliably during tab close / hard refresh where
// `fetch({ keepalive: true })` is not always honoured.
export const POST = PUT;

export async function DELETE() {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.user.update({
    where: { id: ctx.user.id },
    data: { dashboardState: Prisma.JsonNull },
  });

  return NextResponse.json({ ok: true });
}
