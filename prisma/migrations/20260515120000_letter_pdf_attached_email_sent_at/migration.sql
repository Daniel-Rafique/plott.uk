-- Dedupe automated letter PDF emails across approve / printed / sent triggers
ALTER TABLE "letters" ADD COLUMN "pdf_attached_email_sent_at" TIMESTAMP(3);
