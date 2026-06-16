-- Agentic AI platform: AgentRun (audit trail + cost tracking), AgentApproval
-- (human-in-the-loop queue), IcpProfile (per-tenant ICP for outreach),
-- ApplicantResearch (cached briefings), and Company AI controls + SavedSearch
-- auto-outreach toggles.

-- 1. Company AI settings.
ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "ai_enabled"           BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "ai_daily_budget_gbp"  NUMERIC(10, 2) NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS "ai_monthly_spend_gbp" NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "ai_spend_reset_at"    TIMESTAMP(3);

-- 2. SavedSearch auto-outreach toggles.
ALTER TABLE "saved_searches"
  ADD COLUMN IF NOT EXISTS "auto_outreach"                  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "auto_approve_below_confidence"  DOUBLE PRECISION;

-- 3. AgentRun — one row per agent invocation.
CREATE TABLE IF NOT EXISTS "agent_runs" (
  "id"                TEXT        PRIMARY KEY,
  "company_id"        TEXT        NOT NULL,
  "user_id"           TEXT,
  "kind"              TEXT        NOT NULL,
  "status"            TEXT        NOT NULL DEFAULT 'running',
  "model"             TEXT        NOT NULL,
  "input_json"        JSONB       NOT NULL,
  "output_json"       JSONB,
  "error_message"     TEXT,
  "trace_id"          TEXT,
  "prompt_tokens"     INTEGER     NOT NULL DEFAULT 0,
  "completion_tokens" INTEGER     NOT NULL DEFAULT 0,
  "total_tokens"      INTEGER     NOT NULL DEFAULT 0,
  "cost_gbp"          NUMERIC(10, 4) NOT NULL DEFAULT 0,
  "tool_calls"        INTEGER     NOT NULL DEFAULT 0,
  "duration_ms"       INTEGER     NOT NULL DEFAULT 0,
  "prompt_hash"       TEXT,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at"      TIMESTAMP(3),
  CONSTRAINT "agent_runs_company_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE,
  CONSTRAINT "agent_runs_user_fk"    FOREIGN KEY ("user_id")    REFERENCES "users"("id")     ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "agent_runs_company_idx"    ON "agent_runs" ("company_id");
CREATE INDEX IF NOT EXISTS "agent_runs_user_idx"       ON "agent_runs" ("user_id");
CREATE INDEX IF NOT EXISTS "agent_runs_kind_idx"       ON "agent_runs" ("kind");
CREATE INDEX IF NOT EXISTS "agent_runs_created_at_idx" ON "agent_runs" ("created_at");

-- 4. AgentApproval — pending/approved/rejected/executed outputs awaiting human.
CREATE TABLE IF NOT EXISTS "agent_approvals" (
  "id"              TEXT        PRIMARY KEY,
  "company_id"      TEXT        NOT NULL,
  "agent_run_id"    TEXT        NOT NULL,
  "kind"            TEXT        NOT NULL,
  "status"          TEXT        NOT NULL DEFAULT 'pending',
  "subject_ref"     TEXT,
  "planning_entity" INTEGER,
  "draft_json"      JSONB       NOT NULL,
  "issues_json"     JSONB,
  "confidence"      DOUBLE PRECISION,
  "approved_by_id"  TEXT,
  "approved_at"     TIMESTAMP(3),
  "executed_at"     TIMESTAMP(3),
  "rejected_at"     TIMESTAMP(3),
  "rejection_note"  TEXT,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_approvals_company_fk" FOREIGN KEY ("company_id")   REFERENCES "companies"("id")  ON DELETE CASCADE,
  CONSTRAINT "agent_approvals_run_fk"     FOREIGN KEY ("agent_run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE,
  CONSTRAINT "agent_approvals_user_fk"    FOREIGN KEY ("approved_by_id") REFERENCES "users"("id")   ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "agent_approvals_company_idx" ON "agent_approvals" ("company_id");
CREATE INDEX IF NOT EXISTS "agent_approvals_status_idx"  ON "agent_approvals" ("status");
CREATE INDEX IF NOT EXISTS "agent_approvals_kind_idx"    ON "agent_approvals" ("kind");

-- 5. IcpProfile — per-tenant ICP description used by outreach pipeline.
CREATE TABLE IF NOT EXISTS "icp_profiles" (
  "id"                   TEXT        PRIMARY KEY,
  "company_id"           TEXT        NOT NULL UNIQUE,
  "description"          TEXT        NOT NULL,
  "keywords"             TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
  "preferred_statuses"   TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
  "excluded_keywords"    TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
  "min_project_value_gbp" INTEGER,
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "icp_profiles_company_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE
);

-- 6. ApplicantResearch — cached researcher output (per tenant + normalised name).
CREATE TABLE IF NOT EXISTS "applicant_research" (
  "id"              TEXT        PRIMARY KEY,
  "company_id"      TEXT        NOT NULL,
  "normalised_name" TEXT        NOT NULL,
  "display_name"    TEXT        NOT NULL,
  "briefing_json"   JSONB       NOT NULL,
  "confidence"      TEXT        NOT NULL DEFAULT 'low',
  "fetched_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "applicant_research_company_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "applicant_research_company_name_uniq" ON "applicant_research" ("company_id", "normalised_name");
CREATE INDEX        IF NOT EXISTS "applicant_research_company_idx"      ON "applicant_research" ("company_id");
