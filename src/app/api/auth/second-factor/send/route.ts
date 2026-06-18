import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import {
  CODE_TTL_MINUTES,
  createSecondFactorChallenge,
  generateSecondFactorCode,
} from "@/lib/auth/second-factor";
import { upsertUserFromSession } from "@/lib/tenant";
import { sendSecondFactorCodeEmail } from "@/lib/email";

export const runtime = "nodejs";

export async function POST() {
  const sessionUser = await getSessionUser();
  if (!sessionUser?.email || !sessionUser.emailVerified) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await upsertUserFromSession(sessionUser);
  if (!user.twoFactorEmailEnabled) {
    return NextResponse.json({ ok: true, required: false });
  }

  const code = generateSecondFactorCode();
  await createSecondFactorChallenge({ userId: user.id, code });
  await sendSecondFactorCodeEmail({
    to: sessionUser.email,
    code,
    expiresInMinutes: CODE_TTL_MINUTES,
  });

  return NextResponse.json({ ok: true, required: true });
}
