#!/usr/bin/env tsx
/**
 * Delete a single email's app user + owned companies + Neon Auth rows so
 * onboarding can be retested after a Stripe customer wipe / new Neon Auth id.
 *
 * Usage:
 *   npx tsx scripts/wipe-user-by-email.ts ukplott@gmail.com
 *   npx tsx scripts/wipe-user-by-email.ts ukplott@gmail.com --yes
 *
 * Refuses production-looking DBs unless WIPE_CONFIRM_PROD=1.
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), ".env.local"), override: true });

import { prisma } from "@/lib/prisma";

function looksLikeProd(): boolean {
  const url = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return url.includes("plott.uk");
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--yes");
  const dryRun = !process.argv.includes("--yes");
  const email = (args[0] ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    console.error("Usage: npx tsx scripts/wipe-user-by-email.ts <email> [--yes]");
    process.exit(1);
  }

  if (looksLikeProd() && process.env.WIPE_CONFIRM_PROD !== "1") {
    console.error(
      "Refusing: NEXT_PUBLIC_APP_URL looks production-like. Set WIPE_CONFIRM_PROD=1 to override.",
    );
    process.exit(1);
  }

  console.log(dryRun ? "--- DRY RUN ---" : "--- WIPING ---");
  console.log("email:", email);

  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      memberships: { include: { company: true } },
    },
  });

  if (!user) {
    console.log("No app user row for this email.");
  } else {
    console.log("user.id:", user.id);
    console.log(
      "memberships:",
      user.memberships.map((m) => ({
        role: m.role,
        companyId: m.companyId,
        company: m.company.name,
        onboardingCompletedAt: m.company.onboardingCompletedAt,
        stripeCustomerId: m.company.stripeCustomerId,
      })),
    );
  }

  let authUserIds: string[] = [];
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM neon_auth."user" WHERE lower(email) = lower($1)`,
      email,
    );
    authUserIds = rows.map((r) => r.id);
    console.log("neon_auth.user ids:", authUserIds);
  } catch (err) {
    console.warn(
      "neon_auth.user lookup failed:",
      err instanceof Error ? err.message : err,
    );
  }

  if (dryRun) {
    console.log("\nRe-run with --yes to delete.");
    return;
  }

  // Owned companies: delete company (cascades memberships / invites / etc. where FK allows)
  const ownedCompanyIds =
    user?.memberships
      .filter((m) => m.role === "owner")
      .map((m) => m.companyId) ?? [];

  for (const companyId of ownedCompanyIds) {
    // Clear dependent rows that may block company delete
    await prisma.invite.deleteMany({ where: { companyId } });
    await prisma.membership.deleteMany({ where: { companyId } });
    await prisma.letter.deleteMany({ where: { companyId } }).catch(() => {});
    await prisma.savedSearch.deleteMany({ where: { companyId } }).catch(() => {});
    await prisma.company.delete({ where: { id: companyId } }).catch(async (err) => {
      console.warn("company delete soft-fallback:", err instanceof Error ? err.message : err);
      // If company has other FKs, try memberships already cleared — leave company orphaned only as last resort
    });
    console.log("deleted company:", companyId);
  }

  if (user) {
    await prisma.membership.deleteMany({ where: { userId: user.id } });
    await prisma.invite.deleteMany({ where: { createdById: user.id } }).catch(() => {});
    await prisma.letter.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: user.id } });
    console.log("deleted app user:", user.id);
  }

  for (const authId of authUserIds) {
    try {
      await prisma.$executeRawUnsafe(
        `DELETE FROM neon_auth."session" WHERE "userId" = $1::uuid`,
        authId,
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM neon_auth."account" WHERE "userId" = $1::uuid`,
        authId,
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM neon_auth."user" WHERE id = $1::uuid`,
        authId,
      );
      console.log("deleted neon_auth.user:", authId);
    } catch (err) {
      console.warn(
        "neon_auth delete failed for",
        authId,
        err instanceof Error ? err.message : err,
      );
    }
  }

  try {
    await prisma.$executeRawUnsafe(
      `DELETE FROM neon_auth."verification" WHERE lower(identifier) = lower($1)`,
      email,
    );
  } catch {
    // optional table
  }

  console.log("\nDone. Sign up again with", email);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
