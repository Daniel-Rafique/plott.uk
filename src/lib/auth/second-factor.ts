import { cookies } from "next/headers";
import { createHmac, randomInt, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

const COOKIE_NAME = "plott_second_factor";
const PURPOSE = "email_2fa";
const CODE_TTL_MINUTES = 10;
const VERIFICATION_TTL_SECONDS = 12 * 60 * 60;
const MAX_ATTEMPTS = 5;

function secret(): string {
  return (
    process.env.SECOND_FACTOR_COOKIE_SECRET ??
    process.env.NEON_AUTH_COOKIE_SECRET ??
    process.env.MARKETING_LEAD_HASH_SALT ??
    "plott-dev-second-factor-secret"
  );
}

function hmac(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

function codeHash(userId: string, code: string): string {
  return hmac(`${userId}:${code}`);
}

function verificationSignature(userId: string, issuedAt: number): string {
  return hmac(`${userId}:${issuedAt}`);
}

export function generateSecondFactorCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function createSecondFactorChallenge(args: {
  userId: string;
  code: string;
}): Promise<Date> {
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);
  await prisma.$transaction([
    prisma.accountSecurityChallenge.updateMany({
      where: {
        userId: args.userId,
        purpose: PURPOSE,
        consumedAt: null,
      },
      data: { consumedAt: new Date() },
    }),
    prisma.accountSecurityChallenge.create({
      data: {
        userId: args.userId,
        purpose: PURPOSE,
        codeHash: codeHash(args.userId, args.code),
        expiresAt,
      },
    }),
  ]);
  return expiresAt;
}

export async function verifySecondFactorChallenge(args: {
  userId: string;
  code: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const challenge = await prisma.accountSecurityChallenge.findFirst({
    where: {
      userId: args.userId,
      purpose: PURPOSE,
      consumedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!challenge || challenge.expiresAt < new Date()) {
    return { ok: false, error: "Code expired. Request a new one." };
  }
  if (challenge.attempts >= MAX_ATTEMPTS) {
    return { ok: false, error: "Too many attempts. Request a new code." };
  }

  const expected = Buffer.from(challenge.codeHash, "hex");
  const actual = Buffer.from(codeHash(args.userId, args.code), "hex");
  const matches =
    expected.length === actual.length && timingSafeEqual(expected, actual);

  if (!matches) {
    await prisma.accountSecurityChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, error: "That code did not match. Try again." };
  }

  await prisma.accountSecurityChallenge.update({
    where: { id: challenge.id },
    data: { consumedAt: new Date() },
  });
  await markSecondFactorVerified(args.userId);
  return { ok: true };
}

export async function markSecondFactorVerified(userId: string): Promise<void> {
  const issuedAt = Date.now();
  const value = `${userId}.${issuedAt}.${verificationSignature(userId, issuedAt)}`;
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: VERIFICATION_TTL_SECONDS,
    path: "/",
  });
}

export async function clearSecondFactorVerification(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function hasValidSecondFactorVerification(
  userId: string,
): Promise<boolean> {
  const cookieStore = await cookies();
  const value = cookieStore.get(COOKIE_NAME)?.value;
  if (!value) return false;
  const [cookieUserId, issuedAtRaw, signature] = value.split(".");
  const issuedAt = Number(issuedAtRaw);
  if (cookieUserId !== userId || !Number.isFinite(issuedAt) || !signature) {
    return false;
  }
  if (Date.now() - issuedAt > VERIFICATION_TTL_SECONDS * 1000) {
    return false;
  }
  return signature === verificationSignature(userId, issuedAt);
}

export async function userNeedsSecondFactor(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorEmailEnabled: true },
  });
  if (!user?.twoFactorEmailEnabled) return false;
  return !(await hasValidSecondFactorVerification(userId));
}

export { CODE_TTL_MINUTES };
