ALTER TABLE "application_enrichment"
  ADD COLUMN "applicant_email" TEXT,
  ADD COLUMN "applicant_email_source" TEXT,
  ADD COLUMN "applicant_email_confidence" INTEGER,
  ADD COLUMN "applicant_email_status" TEXT;
