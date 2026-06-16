ALTER TABLE "letters"
  ALTER COLUMN "planning_entity" TYPE BIGINT;

ALTER TABLE "agent_approvals"
  ALTER COLUMN "planning_entity" TYPE BIGINT;

ALTER TABLE "saved_searches"
  ALTER COLUMN "last_seen_ids" TYPE BIGINT[] USING "last_seen_ids"::BIGINT[];
