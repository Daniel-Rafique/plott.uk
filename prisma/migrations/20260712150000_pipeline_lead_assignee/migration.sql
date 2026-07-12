-- AlterTable
ALTER TABLE "pipeline_leads" ADD COLUMN "assigned_user_id" TEXT,
ADD COLUMN "assigned_at" TIMESTAMP(3),
ADD COLUMN "assigned_by_id" TEXT;

-- CreateIndex
CREATE INDEX "pipeline_leads_assigned_user_id_idx" ON "pipeline_leads"("assigned_user_id");

-- AddForeignKey
ALTER TABLE "pipeline_leads" ADD CONSTRAINT "pipeline_leads_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_leads" ADD CONSTRAINT "pipeline_leads_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
