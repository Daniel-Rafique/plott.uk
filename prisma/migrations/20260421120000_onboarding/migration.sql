-- Company.onboardingCompletedAt — stamped by /api/company/onboarding once the
-- tenant has filled in company name / address / logo. Used by
-- src/lib/auth/onboarding-gate.ts to decide whether to route new signups to
-- /onboarding vs /subscribe vs /app.

ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "onboarding_completed_at" TIMESTAMPTZ;

-- Companies that existed before this migration are assumed already "set up"
-- so they don't bounce existing customers back through the wizard on their
-- next login.
UPDATE "companies"
  SET "onboarding_completed_at" = COALESCE("onboarding_completed_at", "created_at")
  WHERE "onboarding_completed_at" IS NULL;
