-- Feature 1: Auto-print & PDF email delivery
ALTER TABLE "users"
  ADD COLUMN "email_pdf_on_print" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "companies"
  ADD COLUMN "auto_email_pdf" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "pdf_email_recipients" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Feature 2: Refusal-appeals pipeline
ALTER TABLE "letters"
  ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'outreach';

ALTER TABLE "icp_profiles"
  ADD COLUMN "target_refusals" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "appeal_service_type" TEXT;

ALTER TABLE "letter_templates"
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'outreach';
