-- DropForeignKey
ALTER TABLE "agent_approvals" DROP CONSTRAINT "agent_approvals_company_fk";

-- DropForeignKey
ALTER TABLE "agent_approvals" DROP CONSTRAINT "agent_approvals_run_fk";

-- DropForeignKey
ALTER TABLE "agent_approvals" DROP CONSTRAINT "agent_approvals_user_fk";

-- DropForeignKey
ALTER TABLE "agent_runs" DROP CONSTRAINT "agent_runs_company_fk";

-- DropForeignKey
ALTER TABLE "agent_runs" DROP CONSTRAINT "agent_runs_user_fk";

-- DropForeignKey
ALTER TABLE "applicant_research" DROP CONSTRAINT "applicant_research_company_fk";

-- DropForeignKey
ALTER TABLE "icp_profiles" DROP CONSTRAINT "icp_profiles_company_fk";

-- DropForeignKey
ALTER TABLE "invites" DROP CONSTRAINT "invites_company_id_fkey";

-- DropForeignKey
ALTER TABLE "invites" DROP CONSTRAINT "invites_created_by_id_fkey";

-- DropForeignKey
ALTER TABLE "letter_templates" DROP CONSTRAINT "letter_templates_company_id_fkey";

-- DropForeignKey
ALTER TABLE "letters" DROP CONSTRAINT "letters_company_id_fkey";

-- DropForeignKey
ALTER TABLE "letters" DROP CONSTRAINT "letters_user_id_fkey";

-- DropForeignKey
ALTER TABLE "memberships" DROP CONSTRAINT "memberships_company_id_fkey";

-- DropForeignKey
ALTER TABLE "memberships" DROP CONSTRAINT "memberships_user_id_fkey";

-- DropForeignKey
ALTER TABLE "reminders" DROP CONSTRAINT "reminders_company_id_fkey";

-- DropForeignKey
ALTER TABLE "reminders" DROP CONSTRAINT "reminders_letter_id_fkey";

-- DropForeignKey
ALTER TABLE "reminders" DROP CONSTRAINT "reminders_user_id_fkey";

-- DropForeignKey
ALTER TABLE "saved_searches" DROP CONSTRAINT "saved_searches_company_id_fkey";

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_active_company_id_fkey";

-- AlterTable
ALTER TABLE "agent_approvals" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "companies" ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "onboarding_completed_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "icp_profiles" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "letter_templates" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "letters" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "saved_searches" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_active_company_id_fkey" FOREIGN KEY ("active_company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_templates" ADD CONSTRAINT "letter_templates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letters" ADD CONSTRAINT "letters_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letters" ADD CONSTRAINT "letters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_letter_id_fkey" FOREIGN KEY ("letter_id") REFERENCES "letters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_approvals" ADD CONSTRAINT "agent_approvals_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_approvals" ADD CONSTRAINT "agent_approvals_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_approvals" ADD CONSTRAINT "agent_approvals_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icp_profiles" ADD CONSTRAINT "icp_profiles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applicant_research" ADD CONSTRAINT "applicant_research_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "agent_approvals_company_idx" RENAME TO "agent_approvals_company_id_idx";

-- RenameIndex
ALTER INDEX "agent_runs_company_idx" RENAME TO "agent_runs_company_id_idx";

-- RenameIndex
ALTER INDEX "agent_runs_user_idx" RENAME TO "agent_runs_user_id_idx";

-- RenameIndex
ALTER INDEX "applicant_research_company_idx" RENAME TO "applicant_research_company_id_idx";

-- RenameIndex
ALTER INDEX "applicant_research_company_name_uniq" RENAME TO "applicant_research_company_id_normalised_name_key";

-- RenameIndex
ALTER INDEX "memberships_user_company_key" RENAME TO "memberships_user_id_company_id_key";
