#!/usr/bin/env tsx
/**
 * Nuke all tenant + user data so you can retest onboarding or recover from a
 * Stripe account migration (old `stripeCustomerId` / subscription rows are
 * invalid when you switch `STRIPE_SECRET_KEY` to a new account).
 *
 * Usage:
 *   npx tsx scripts/wipe-tenancy.ts           # dry run (prints counts)
 *   npx tsx scripts/wipe-tenancy.ts --yes     # actually wipe
 *   npx tsx scripts/wipe-tenancy.ts --yes --stripe
 *       # also delete Stripe customers in the *current* API key’s account
 *       # that have `metadata.companyId` (Plott-created only)
 *
 * Connects via DATABASE_URL (.env then .env.local, same as Next). Will refuse
 * to run if it looks like a production DB (NEXT_PUBLIC_APP_URL contains
 * "plott.uk" and WIPE_CONFIRM_PROD=1 is not set).
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), ".env.local"), override: true });

import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

const APP_TABLES = [
  "applicant_research",
  "icp_profiles",
  "agent_approvals",
  "agent_runs",
  "application_enrichment",
  "reminders",
  "saved_searches",
  "letters",
  "letter_templates",
  "invites",
  "memberships",
  "companies",
  "users",
  "stripe_events",
] as const;

const NEON_AUTH_TABLES = ["user", "session", "account", "verification"] as const;

function looksLikeProd(): boolean {
  const url = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return url.includes("plott.uk");
}

async function countAll(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const t of APP_TABLES) {
    const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count FROM "${t}"`,
    );
    counts[t] = Number(rows[0]?.count ?? BigInt(0));
  }
  for (const t of NEON_AUTH_TABLES) {
    try {
      const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*)::bigint AS count FROM neon_auth."${t}"`,
      );
      counts[`neon_auth.${t}`] = Number(rows[0]?.count ?? BigInt(0));
    } catch {
      counts[`neon_auth.${t}`] = -1;
    }
  }
  return counts;
}

async function truncateAll(): Promise<void> {
  const quoted = APP_TABLES.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`,
  );
  for (const t of NEON_AUTH_TABLES) {
    try {
      await prisma.$executeRawUnsafe(`DELETE FROM neon_auth."${t}"`);
    } catch (err) {
      console.warn(
        `neon_auth.${t} skipped: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}

async function deleteStripeCustomers(): Promise<number> {
  const stripe = getStripe();
  let deleted = 0;
  let startingAfter: string | undefined;
  while (true) {
    const page = await stripe.customers.list({
      limit: 100,
      starting_after: startingAfter,
    });
    for (const cust of page.data) {
      if (cust.metadata?.companyId) {
        try {
          await stripe.customers.del(cust.id);
          deleted += 1;
        } catch (err) {
          console.warn(
            `Stripe customer ${cust.id} delete failed: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
    }
    if (!page.has_more) break;
    startingAfter = page.data[page.data.length - 1]?.id;
    if (!startingAfter) break;
  }
  return deleted;
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const dryRun = !args.has("--yes");
  const wipeStripe = args.has("--stripe");

  if (looksLikeProd() && process.env.WIPE_CONFIRM_PROD !== "1") {
    console.error(
      "Refusing to run: NEXT_PUBLIC_APP_URL looks production-like. Set WIPE_CONFIRM_PROD=1 to override.",
    );
    process.exit(1);
  }

  console.log(dryRun ? "--- DRY RUN ---" : "--- WIPING ---");
  console.log("DATABASE_URL:", process.env.DATABASE_URL?.replace(/:[^:@]*@/, ":***@"));
  const before = await countAll();
  console.table(before);

  if (dryRun) {
    console.log("\nRun again with --yes to actually wipe.");
    if (wipeStripe) console.log("(+ --stripe would delete Stripe customers metadata.companyId=*)");
    return;
  }

  console.log("\nTruncating app tables + neon_auth.* ...");
  await truncateAll();

  if (wipeStripe) {
    console.log("\nDeleting Stripe customers with metadata.companyId=* ...");
    const deleted = await deleteStripeCustomers();
    console.log(`Stripe customers deleted: ${deleted}`);
  }

  const after = await countAll();
  console.log("\nAfter:");
  console.table(after);
  console.log("\nDone.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
