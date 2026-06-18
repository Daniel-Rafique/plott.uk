ALTER TABLE "users"
  ADD COLUMN "two_factor_email_enabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "account_security_challenges" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "code_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "consumed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "account_security_challenges_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "account_security_challenges_user_id_purpose_expires_at_idx"
  ON "account_security_challenges"("user_id", "purpose", "expires_at");

ALTER TABLE "account_security_challenges"
  ADD CONSTRAINT "account_security_challenges_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
