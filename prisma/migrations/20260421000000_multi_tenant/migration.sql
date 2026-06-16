-- Multi-tenant foundation: Company, Membership, Invite, LetterTemplate, Letter,
-- SavedSearch, Reminder, StripeEvent, ApplicationEnrichment. Migrates Stripe
-- fields from users -> companies and backfills one personal Company per user.

-- 1. Extend users with profile + active company pointer.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "name" TEXT,
  ADD COLUMN IF NOT EXISTS "signature_svg" TEXT,
  ADD COLUMN IF NOT EXISTS "signature_blob_url" TEXT,
  ADD COLUMN IF NOT EXISTS "signatory_title" TEXT,
  ADD COLUMN IF NOT EXISTS "active_company_id" TEXT;

-- Keep users.email unique so we can look up by email (Neon Auth guarantees it).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_email_key'
  ) THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_email_key" UNIQUE ("email");
  END IF;
END $$;

-- 2. Create Company (tenant) table.
CREATE TABLE "companies" (
  "id"                              TEXT PRIMARY KEY,
  "name"                            TEXT NOT NULL,
  "slug"                            TEXT NOT NULL UNIQUE,
  "address_lines"                   TEXT,
  "phone"                           TEXT,
  "email"                           TEXT,
  "website_url"                     TEXT,
  "logo_blob_url"                   TEXT,
  "logo_blob_pathname"              TEXT,
  "letter_footer"                   TEXT,
  "stripe_customer_id"              TEXT UNIQUE,
  "subscription_status"             TEXT NOT NULL DEFAULT 'none',
  "subscription_price_id"           TEXT,
  "subscription_current_period_end" TIMESTAMP(3),
  "trial_ends_at"                   TIMESTAMP(3),
  "created_at"                      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"                      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Memberships: join users <-> companies with a role.
CREATE TABLE "memberships" (
  "id"         TEXT PRIMARY KEY,
  "user_id"    TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "company_id" TEXT NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "role"       TEXT NOT NULL DEFAULT 'owner',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "memberships_user_company_key" UNIQUE ("user_id", "company_id")
);
CREATE INDEX "memberships_company_id_idx" ON "memberships"("company_id");

-- 4. Invites.
CREATE TABLE "invites" (
  "id"            TEXT PRIMARY KEY,
  "company_id"    TEXT NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "email"         TEXT NOT NULL,
  "role"          TEXT NOT NULL DEFAULT 'member',
  "token"         TEXT NOT NULL UNIQUE,
  "created_by_id" TEXT NOT NULL REFERENCES "users"("id"),
  "accepted_at"   TIMESTAMP(3),
  "expires_at"    TIMESTAMP(3) NOT NULL,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "invites_company_id_idx" ON "invites"("company_id");
CREATE INDEX "invites_email_idx" ON "invites"("email");

-- 5. Letter templates.
CREATE TABLE "letter_templates" (
  "id"         TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "name"       TEXT NOT NULL,
  "subject"    TEXT NOT NULL,
  "body_html"  TEXT NOT NULL,
  "is_default" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "letter_templates_company_id_idx" ON "letter_templates"("company_id");

-- 6. Letters (persisted history).
CREATE TABLE "letters" (
  "id"               TEXT PRIMARY KEY,
  "company_id"       TEXT NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "user_id"          TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "application_ref"  TEXT,
  "planning_entity"  INTEGER,
  "site_address"     TEXT,
  "recipient_name"   TEXT NOT NULL,
  "address_lines"    TEXT NOT NULL,
  "subject"          TEXT NOT NULL,
  "body_html"        TEXT NOT NULL,
  "pdf_blob_url"     TEXT,
  "pdf_blob_pathname" TEXT,
  "status"           TEXT NOT NULL DEFAULT 'draft',
  "sent_at"          TIMESTAMP(3),
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "letters_company_id_idx" ON "letters"("company_id");
CREATE INDEX "letters_user_id_idx" ON "letters"("user_id");
CREATE INDEX "letters_planning_entity_idx" ON "letters"("planning_entity");

-- 7. Saved searches.
CREATE TABLE "saved_searches" (
  "id"             TEXT PRIMARY KEY,
  "company_id"     TEXT NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "name"           TEXT NOT NULL,
  "bbox"           JSONB NOT NULL,
  "filters"        JSONB NOT NULL,
  "frequency"      TEXT NOT NULL DEFAULT 'weekly',
  "last_run_at"    TIMESTAMP(3),
  "last_run_count" INTEGER NOT NULL DEFAULT 0,
  "last_seen_ids"  INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "notify_emails"  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "saved_searches_company_id_idx" ON "saved_searches"("company_id");

-- 8. Reminders.
CREATE TABLE "reminders" (
  "id"          TEXT PRIMARY KEY,
  "company_id"  TEXT NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "user_id"     TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "letter_id"   TEXT REFERENCES "letters"("id") ON DELETE SET NULL,
  "due_at"      TIMESTAMP(3) NOT NULL,
  "note"        TEXT,
  "done"        BOOLEAN NOT NULL DEFAULT FALSE,
  "notified_at" TIMESTAMP(3),
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "reminders_company_id_idx" ON "reminders"("company_id");
CREATE INDEX "reminders_user_id_idx" ON "reminders"("user_id");
CREATE INDEX "reminders_due_at_idx" ON "reminders"("due_at");

-- 9. Stripe event idempotency.
CREATE TABLE "stripe_events" (
  "id"         TEXT PRIMARY KEY,
  "type"       TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 10. Application enrichment cache.
CREATE TABLE "application_enrichment" (
  "planning_entity"     INTEGER PRIMARY KEY,
  "application_ref"     TEXT,
  "organisation_entity" TEXT,
  "applicant_name"      TEXT,
  "applicant_address"   TEXT,
  "agent_name"          TEXT,
  "agent_address"       TEXT,
  "agent_phone"         TEXT,
  "agent_email"         TEXT,
  "case_officer"        TEXT,
  "ward"                TEXT,
  "received_date"       TIMESTAMP(3),
  "validated_date"      TIMESTAMP(3),
  "target_date"         TIMESTAMP(3),
  "source"              TEXT NOT NULL,
  "confidence"          TEXT NOT NULL DEFAULT 'low',
  "fetched_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at"          TIMESTAMP(3) NOT NULL
);
CREATE INDEX "application_enrichment_application_ref_idx" ON "application_enrichment"("application_ref");
CREATE INDEX "application_enrichment_organisation_entity_idx" ON "application_enrichment"("organisation_entity");

-- 11. Backfill: create one personal Company per existing user, migrate Stripe
--     fields, create owner Membership, set active_company_id. Slug generated
--     from a timestamp suffix to avoid collisions on equal email prefixes.
WITH new_companies AS (
  INSERT INTO "companies" (
    "id", "name", "slug", "email", "stripe_customer_id",
    "subscription_status", "subscription_current_period_end",
    "created_at", "updated_at"
  )
  SELECT
    'co_' || substr(md5(u."id" || clock_timestamp()::text), 1, 20),
    COALESCE(split_part(u."email", '@', 1), 'Workspace'),
    'w-' || substr(md5(u."id" || clock_timestamp()::text), 1, 10),
    u."email",
    u."stripe_customer_id",
    COALESCE(u."subscription_status", 'none'),
    u."subscription_current_period_end",
    COALESCE(u."created_at", CURRENT_TIMESTAMP),
    COALESCE(u."updated_at", CURRENT_TIMESTAMP)
  FROM "users" u
  WHERE NOT EXISTS (
    SELECT 1 FROM "memberships" m WHERE m."user_id" = u."id"
  )
  RETURNING "id", "email"
)
INSERT INTO "memberships" ("id", "user_id", "company_id", "role")
SELECT
  'm_' || substr(md5(u."id" || nc."id"), 1, 20),
  u."id",
  nc."id",
  'owner'
FROM "users" u
JOIN new_companies nc ON nc."email" IS NOT DISTINCT FROM u."email";

UPDATE "users" u
SET "active_company_id" = m."company_id"
FROM "memberships" m
WHERE m."user_id" = u."id" AND u."active_company_id" IS NULL;

ALTER TABLE "users"
  ADD CONSTRAINT "users_active_company_id_fkey"
  FOREIGN KEY ("active_company_id") REFERENCES "companies"("id") ON DELETE SET NULL;

-- 12. Drop obsolete Stripe columns from users now that data lives on companies.
ALTER TABLE "users"
  DROP COLUMN IF EXISTS "stripe_customer_id",
  DROP COLUMN IF EXISTS "subscription_status",
  DROP COLUMN IF EXISTS "subscription_current_period_end";
