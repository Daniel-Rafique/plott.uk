-- Hunter Person Enrichment payloads for applicant/agent emails.
ALTER TABLE "application_enrichment"
  ADD COLUMN "applicant_person_json" JSONB,
  ADD COLUMN "agent_person_json" JSONB;
