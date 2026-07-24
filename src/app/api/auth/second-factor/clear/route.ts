import { NextResponse } from "next/server";
import { clearSecondFactorVerification } from "@/lib/auth/second-factor";
import { getSessionUser } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await clearSecondFactorVerification();
  return NextResponse.json({ ok: true });
}
