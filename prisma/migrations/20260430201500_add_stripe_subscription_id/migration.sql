ALTER TABLE "companies" ADD COLUMN "stripe_subscription_id" TEXT;

CREATE UNIQUE INDEX "companies_stripe_subscription_id_key" ON "companies"("stripe_subscription_id");
