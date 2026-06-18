CREATE TABLE "marketing_leads" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "company" TEXT,
  "source" TEXT NOT NULL,
  "path" TEXT,
  "lead_magnet" TEXT,
  "utm_source" TEXT,
  "utm_medium" TEXT,
  "utm_campaign" TEXT,
  "utm_term" TEXT,
  "utm_content" TEXT,
  "consent_text" TEXT NOT NULL,
  "consented_at" TIMESTAMP(3) NOT NULL,
  "ip_hash" TEXT,
  "user_agent_hash" TEXT,
  "unsubscribed_at" TIMESTAMP(3),
  "suppressed_at" TIMESTAMP(3),
  "resend_audience_id" TEXT,
  "resend_contact_id" TEXT,
  "resend_synced_at" TIMESTAMP(3),
  "resend_sync_error" TEXT,
  "last_submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submission_count" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "marketing_leads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "marketing_leads_email_key" ON "marketing_leads"("email");
CREATE INDEX "marketing_leads_source_idx" ON "marketing_leads"("source");
CREATE INDEX "marketing_leads_path_idx" ON "marketing_leads"("path");
CREATE INDEX "marketing_leads_resend_synced_at_idx" ON "marketing_leads"("resend_synced_at");
