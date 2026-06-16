ALTER TABLE "pinned_applications"
ADD COLUMN "target_decision_date" TIMESTAMP(3),
ADD COLUMN "next_check_at" TIMESTAMP(3);

CREATE INDEX "pinned_applications_next_check_at_idx" ON "pinned_applications"("next_check_at");
