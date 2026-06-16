/**
 * One-off maintenance: clear stale Stripe customer IDs from Company rows.
 *
 * Use when switching Stripe accounts / test modes — old customer IDs in DB
 * will reference customers that don't exist in the new account, blocking
 * checkout. Running this lets the next `/subscribe` flow create a fresh
 * customer against the new account.
 *
 * Usage:
 *   npx tsx scripts/reset-stripe-customer.ts                    # reset all
 *   npx tsx scripts/reset-stripe-customer.ts <companyId>        # reset one
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const targetId = process.argv[2];

  const where = targetId ? { id: targetId } : {};
  const companies = await prisma.company.findMany({
    where,
    select: {
      id: true,
      name: true,
      stripeCustomerId: true,
      subscriptionStatus: true,
      subscriptionPriceId: true,
    },
  });

  console.log(`Found ${companies.length} company row(s) to reset.\n`);

  for (const c of companies) {
    console.log(`- ${c.id} (${c.name})`);
    console.log(`    customer: ${c.stripeCustomerId}`);
    console.log(`    status:   ${c.subscriptionStatus}`);
    console.log(`    priceId:  ${c.subscriptionPriceId}`);
  }

  const result = await prisma.company.updateMany({
    where,
    data: {
      stripeCustomerId: null,
      subscriptionStatus: "none",
      subscriptionPriceId: null,
      subscriptionCurrentPeriodEnd: null,
      trialEndsAt: null,
    },
  });

  console.log(`\nReset ${result.count} company row(s).`);
  console.log(
    "Next /subscribe flow will create a new Stripe customer against the currently-configured account."
  );
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
