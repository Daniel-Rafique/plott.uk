import { auth } from "@/lib/auth/server";
import { logger } from "@/lib/logger";

export type SessionUser = {
  id: string;
  email: string | null;
  name: string | null;
  emailVerified: boolean;
};

/**
 * Dev-only escape hatch for environments where the Resend sender domain isn't
 * verified yet (so no OTP emails can actually be delivered). When
 * `DEV_SKIP_EMAIL_VERIFICATION=true` AND we're NOT running in production,
 * every session is treated as verified. Production is double-gated so a
 * leaked env var can't accidentally bypass verification on live traffic.
 */
function shouldSkipVerification(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.VERCEL_ENV === "production") return false;
  return process.env.DEV_SKIP_EMAIL_VERIFICATION === "true";
}

let devSkipWarned = false;
function warnDevSkipOnce(): void {
  if (devSkipWarned) return;
  devSkipWarned = true;
  logger.warn(
    {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_ENV: process.env.VERCEL_ENV,
    },
    "auth_dev_skip_email_verification_active",
  );
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user?.id) return null;
  const realVerified = Boolean(user.emailVerified);
  let emailVerified = realVerified;
  if (!realVerified && shouldSkipVerification()) {
    warnDevSkipOnce();
    emailVerified = true;
  }
  return {
    id: user.id,
    email: user.email ?? null,
    name: user.name ?? null,
    emailVerified,
  };
}
