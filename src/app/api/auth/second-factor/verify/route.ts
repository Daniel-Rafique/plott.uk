import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { verifySecondFactorChallenge } from "@/lib/auth/second-factor";
import { upsertUserFromSession } from "@/lib/tenant";

export const runtime = "nodejs";

type Body = {
  code?: string;
};

export async function POST(req: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser?.emailVerified) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await upsertUserFromSession(sessionUser);
  if (!user.twoFactorEmailEnabled) {
    return NextResponse.json({ ok: true, required: false });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const code = typeof body.code === "string" ? body.code.replace(/\D/g, "") : "";
  if (code.length !== 6) {
    return NextResponse.json(
      { error: "Enter the 6-digit code." },
      { status: 400 },
    );
  }

  const result = await verifySecondFactorChallenge({ userId: user.id, code });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, required: true });
}
