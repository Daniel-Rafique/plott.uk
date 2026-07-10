-- CreateTable
CREATE TABLE "pipeline_leads" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "planning_entity" BIGINT NOT NULL,
    "application_ref" TEXT,
    "site_address" TEXT,
    "description" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'new',
    "stage_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "lost_reason" TEXT,
    "letter_id" TEXT,
    "agent_approval_id" TEXT,
    "estimate_min_gbp" INTEGER,
    "estimate_max_gbp" INTEGER,
    "estimate_weeks" DOUBLE PRECISION,
    "estimate_json" JSONB,
    "estimated_at" TIMESTAMP(3),
    "include_ballpark_in_outreach" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipeline_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_rate_cards" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "day_rate_gbp" DOUBLE PRECISION,
    "crew_size_default" INTEGER,
    "unit_rates_json" JSONB NOT NULL DEFAULT '{}',
    "typical_weeks_json" JSONB NOT NULL DEFAULT '{}',
    "contingency_percent" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "vat_inclusive" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_rate_cards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pipeline_leads_company_id_stage_idx" ON "pipeline_leads"("company_id", "stage");

-- CreateIndex
CREATE INDEX "pipeline_leads_letter_id_idx" ON "pipeline_leads"("letter_id");

-- CreateIndex
CREATE INDEX "pipeline_leads_agent_approval_id_idx" ON "pipeline_leads"("agent_approval_id");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_leads_company_id_planning_entity_key" ON "pipeline_leads"("company_id", "planning_entity");

-- CreateIndex
CREATE UNIQUE INDEX "company_rate_cards_company_id_key" ON "company_rate_cards"("company_id");

-- AddForeignKey
ALTER TABLE "pipeline_leads" ADD CONSTRAINT "pipeline_leads_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_leads" ADD CONSTRAINT "pipeline_leads_letter_id_fkey" FOREIGN KEY ("letter_id") REFERENCES "letters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_leads" ADD CONSTRAINT "pipeline_leads_agent_approval_id_fkey" FOREIGN KEY ("agent_approval_id") REFERENCES "agent_approvals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_rate_cards" ADD CONSTRAINT "company_rate_cards_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
