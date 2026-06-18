import { NextResponse } from "next/server";
import { clearSecondFactorVerification } from "@/lib/auth/second-factor";

export const runtime = "nodejs";

export async function POST() {
  await clearSecondFactorVerification();
  return NextResponse.json({ ok: true });
}
