-- Mirror Neon Auth's emailVerified state into the local users table so
-- background jobs and analytics don't have to round-trip to Neon Auth.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "email_verified_at" TIMESTAMP(3);
