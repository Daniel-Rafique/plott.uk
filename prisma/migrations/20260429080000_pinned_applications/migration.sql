-- CreateTable
CREATE TABLE "pinned_applications" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "council_id" TEXT,
    "planning_entity" BIGINT,
    "site_address" TEXT,
    "description" TEXT,
    "status" TEXT,
    "decision" TEXT,
    "decision_date" TEXT,
    "source_url" TEXT,
    "notify_emails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "frequency" TEXT NOT NULL DEFAULT 'daily',
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "last_checked_at" TIMESTAMP(3),
    "last_notified_at" TIMESTAMP(3),
    "last_snapshot_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pinned_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pinned_application_events" (
    "id" TEXT NOT NULL,
    "pinned_application_id" TEXT NOT NULL,
    "change_type" TEXT NOT NULL,
    "before_json" JSONB,
    "after_json" JSONB NOT NULL,
    "notified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pinned_application_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pinned_applications_company_id_reference_council_id_key" ON "pinned_applications"("company_id", "reference", "council_id");

-- CreateIndex
CREATE INDEX "pinned_applications_company_id_idx" ON "pinned_applications"("company_id");

-- CreateIndex
CREATE INDEX "pinned_applications_user_id_idx" ON "pinned_applications"("user_id");

-- CreateIndex
CREATE INDEX "pinned_applications_last_checked_at_idx" ON "pinned_applications"("last_checked_at");

-- CreateIndex
CREATE INDEX "pinned_application_events_pinned_application_id_idx" ON "pinned_application_events"("pinned_application_id");

-- CreateIndex
CREATE INDEX "pinned_application_events_created_at_idx" ON "pinned_application_events"("created_at");

-- AddForeignKey
ALTER TABLE "pinned_applications" ADD CONSTRAINT "pinned_applications_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinned_applications" ADD CONSTRAINT "pinned_applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinned_application_events" ADD CONSTRAINT "pinned_application_events_pinned_application_id_fkey" FOREIGN KEY ("pinned_application_id") REFERENCES "pinned_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
