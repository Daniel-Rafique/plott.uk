-- Planning Data entity IDs can exceed 32-bit signed int (e.g. 10000021762).
ALTER TABLE "application_enrichment"
  ALTER COLUMN "planning_entity" TYPE BIGINT;
