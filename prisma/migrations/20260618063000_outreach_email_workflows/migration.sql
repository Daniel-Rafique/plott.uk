ALTER TABLE "companies"
  ADD COLUMN "prospect_email_outreach_enabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "agent_approvals"
  ADD COLUMN "sent_at" TIMESTAMP(3),
  ADD COLUMN "sent_channel" TEXT,
  ADD COLUMN "sent_to" TEXT,
  ADD COLUMN "resend_email_id" TEXT;

CREATE TABLE "outreach_email_suppressions" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "outreach_email_suppressions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "outreach_email_suppressions_company_id_email_key"
  ON "outreach_email_suppressions"("company_id", "email");

CREATE INDEX "outreach_email_suppressions_company_id_idx"
  ON "outreach_email_suppressions"("company_id");

ALTER TABLE "outreach_email_suppressions"
  ADD CONSTRAINT "outreach_email_suppressions_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
