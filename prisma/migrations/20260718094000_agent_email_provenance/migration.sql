ALTER TABLE "application_enrichment"
  ADD COLUMN "agent_email_source" TEXT,
  ADD COLUMN "agent_email_confidence" INTEGER,
  ADD COLUMN "agent_email_status" TEXT;
