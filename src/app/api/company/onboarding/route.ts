/**
 * Onboarding wizard target. Updates the auto-created Company row with the
 * details the user typed in, then stamps `onboardingCompletedAt` so the
 * `resolveStage()` gate stops routing them back to `/onboarding`.
 *
 * Logo is uploaded separately through `/api/company/logo-upload` (server-side
 * FormData → @vercel/blob put with `access: "private"`), which writes
 * `logoBlobUrl`/`logoBlobPathname` directly on the Company row — the wizard
 * just triggers that flow and then POSTs here to finalise.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getTenantContext, hasActiveSubscription } from "@/lib/tenant";

export const runtime = "nodejs";

const Body = z.object({
  name: z.string().trim().min(2).max(120),
  websiteUrl: z
    .string()
    .trim()
    .url()
    .max(200)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  addressLines: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  phone: z
    .string()
    .trim()
    .max(40)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export async function POST(req: Request) {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid fields", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { name, websiteUrl, addressLines, phone } = parsed.data;

  const company = await prisma.company.update({
    where: { id: ctx.company.id },
    data: {
      name,
      websiteUrl: websiteUrl ?? null,
      addressLines: addressLines ?? null,
      phone: phone ?? null,
      onboardingCompletedAt: new Date(),
    },
  });

  return NextResponse.json({
    ok: true,
    nextPath: hasActiveSubscription(company) ? "/app/dashboard" : "/subscribe",
  });
}
