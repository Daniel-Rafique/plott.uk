#!/usr/bin/env tsx
/**
 * Delete a single email's app user + companies + Neon Auth + marketing lead
 * so onboarding can be retested cleanly.
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

async function deleteCompanyHard(companyId: string): Promise<void> {
  await prisma.invite.deleteMany({ where: { companyId } });
  await prisma.membership.deleteMany({ where: { companyId } });
  await prisma.letter.deleteMany({ where: { companyId } }).catch(() => {});
  await prisma.savedSearch.deleteMany({ where: { companyId } }).catch(() => {});
  await prisma.letterTemplate.deleteMany({ where: { companyId } }).catch(() => {});
  await prisma.pinnedApplication.deleteMany({ where: { companyId } }).catch(() => {});
  await prisma.agentRun.deleteMany({ where: { companyId } }).catch(() => {});
  await prisma.pipelineLead.deleteMany({ where: { companyId } }).catch(() => {});
  await prisma.icpProfile.deleteMany({ where: { companyId } }).catch(() => {});
  await prisma.companyRateCard.deleteMany({ where: { companyId } }).catch(() => {});

  await prisma.user.updateMany({
    where: { activeCompanyId: companyId },
    data: { activeCompanyId: null },
  });

  await prisma.company.delete({ where: { id: companyId } });
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

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    include: {
      memberships: { include: { company: true } },
    },
  });

  const companiesByEmail = await prisma.company.findMany({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, name: true, email: true },
  });

  const invites = await prisma.invite.findMany({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, companyId: true },
  });

  const marketingLeads = await prisma.marketingLead.findMany({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, source: true },
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
  console.log("companies.email:", companiesByEmail);
  console.log("invites:", invites.length);
  console.log("marketing_leads:", marketingLeads);

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

  const companyIds = new Set<string>([
    ...(user?.memberships.map((m) => m.companyId) ?? []),
    ...companiesByEmail.map((c) => c.id),
  ]);

  for (const companyId of companyIds) {
    try {
      await deleteCompanyHard(companyId);
      console.log("deleted company:", companyId);
    } catch (err) {
      console.warn(
        "company delete failed:",
        companyId,
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (invites.length) {
    await prisma.invite.deleteMany({
      where: { email: { equals: email, mode: "insensitive" } },
    });
    console.log("deleted invites:", invites.length);
  }

  if (marketingLeads.length) {
    await prisma.marketingLead.deleteMany({
      where: { email: { equals: email, mode: "insensitive" } },
    });
    console.log("deleted marketing_leads:", marketingLeads.length);
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

  // Verify clean
  const leftUser = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });
  const leftCompanies = await prisma.company.findMany({
    where: { email: { equals: email, mode: "insensitive" } },
  });
  const leftLeads = await prisma.marketingLead.findMany({
    where: { email: { equals: email, mode: "insensitive" } },
  });
  console.log("\nVerify — users:", leftUser ? 1 : 0);
  console.log("Verify — companies:", leftCompanies.length);
  console.log("Verify — marketing_leads:", leftLeads.length);
  console.log("\nDone. Clear cookies / sign out, then sign up again with", email);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
