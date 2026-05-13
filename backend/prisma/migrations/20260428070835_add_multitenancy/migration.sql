/*
  Warnings:

  - A unique constraint covering the columns `[cacheKey,tenantId]` on the table `ai_insights_cache` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[code,tenantId]` on the table `chart_of_accounts` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[creditNoteNumber,tenantId]` on the table `credit_notes` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[expenseNumber,tenantId]` on the table `expenses` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[code,tenantId]` on the table `fee_categories` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[invoiceNumber,tenantId]` on the table `invoices` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[entryNumber,tenantId]` on the table `journal_entries` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[reference,tenantId]` on the table `mobile_money_collections` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[transactionId,tenantId]` on the table `payments` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[runNumber,tenantId]` on the table `payroll_runs` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[payslipNumber,tenantId]` on the table `payslips` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[refundNumber,tenantId]` on the table `refunds` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[admissionNumber,tenantId]` on the table `students` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[code,tenantId]` on the table `subjects` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[roomName,tenantId]` on the table `virtual_classrooms` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- DropIndex
DROP INDEX "ai_insights_cache_cacheKey_key";

-- DropIndex
DROP INDEX "chart_of_accounts_code_key";

-- DropIndex
DROP INDEX "credit_notes_creditNoteNumber_key";

-- DropIndex
DROP INDEX "expenses_expenseNumber_key";

-- DropIndex
DROP INDEX "fee_categories_code_key";

-- DropIndex
DROP INDEX "invoices_invoiceNumber_key";

-- DropIndex
DROP INDEX "journal_entries_entryNumber_key";

-- DropIndex
DROP INDEX "mobile_money_collections_reference_key";

-- DropIndex
DROP INDEX "payments_transactionId_key";

-- DropIndex
DROP INDEX "payroll_runs_runNumber_key";

-- DropIndex
DROP INDEX "payslips_payslipNumber_key";

-- DropIndex
DROP INDEX "refunds_refundNumber_key";

-- DropIndex
DROP INDEX "students_admissionNumber_key";

-- DropIndex
DROP INDEX "subjects_code_key";

-- DropIndex
DROP INDEX "virtual_classrooms_roomName_key";

-- AlterTable
ALTER TABLE "academic_events" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "academic_terms" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "adapted_lessons" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "ai_artifacts" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "ai_conversations" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "ai_favorite_prompts" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "ai_insights_cache" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "ai_messages" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "ai_proactive_alerts" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "ai_tutor_sessions" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "ai_usage_logs" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "announcement_acknowledgments" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "announcements" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "assessment_results" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "assessment_submissions" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "assessments" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "attendance" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "attendance_alerts" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "branch_transfers" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "budget_items" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "budgets" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "campaign_messages" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "chart_of_accounts" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "class_fee_assignments" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "class_movement_logs" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "class_recordings" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "classes" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "classroom_chats" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "classroom_participants" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "communication_logs" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "communication_preferences" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "conversation_participants" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "credit_notes" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "debt_collection_campaigns" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "fee_categories" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "fee_templates" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "financial_audit_logs" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "financial_reports" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "grading_scales" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "homework_submissions" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "intervention_records" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "invoice_items" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "journal_entries" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "journal_entry_lines" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "learning_objective_mastery" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "lesson_plans" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "message_templates" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "misconception_patterns" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "mobile_money_collections" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "payment_allocations" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "payment_plan_schedules" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "payment_plans" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "payroll_runs" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "payslips" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "pending_teacher_actions" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "petty_cash_accounts" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "petty_cash_transactions" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "push_subscriptions" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "question_options" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "receipt_sequences" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "refunds" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "scholarships" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "school_settings" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "staff_payrolls" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "student_branches" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "student_fee_structures" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "student_responses" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "student_risk_assessments" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "student_term_reports" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "sub_topics" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "subjects" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "teacher_subjects" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "teaching_content" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "term_results" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "timetable_period_classes" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "timetable_periods" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "topic_progress" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "topics" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "user_branches" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "virtual_classrooms" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'SYSTEM';

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "academic_events_tenantId_idx" ON "academic_events"("tenantId");

-- CreateIndex
CREATE INDEX "academic_terms_tenantId_idx" ON "academic_terms"("tenantId");

-- CreateIndex
CREATE INDEX "adapted_lessons_tenantId_idx" ON "adapted_lessons"("tenantId");

-- CreateIndex
CREATE INDEX "ai_artifacts_tenantId_idx" ON "ai_artifacts"("tenantId");

-- CreateIndex
CREATE INDEX "ai_conversations_tenantId_idx" ON "ai_conversations"("tenantId");

-- CreateIndex
CREATE INDEX "ai_favorite_prompts_tenantId_idx" ON "ai_favorite_prompts"("tenantId");

-- CreateIndex
CREATE INDEX "ai_insights_cache_tenantId_idx" ON "ai_insights_cache"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ai_insights_cache_cacheKey_tenantId_key" ON "ai_insights_cache"("cacheKey", "tenantId");

-- CreateIndex
CREATE INDEX "ai_messages_tenantId_idx" ON "ai_messages"("tenantId");

-- CreateIndex
CREATE INDEX "ai_proactive_alerts_tenantId_idx" ON "ai_proactive_alerts"("tenantId");

-- CreateIndex
CREATE INDEX "ai_tutor_sessions_tenantId_idx" ON "ai_tutor_sessions"("tenantId");

-- CreateIndex
CREATE INDEX "ai_usage_logs_tenantId_idx" ON "ai_usage_logs"("tenantId");

-- CreateIndex
CREATE INDEX "announcement_acknowledgments_tenantId_idx" ON "announcement_acknowledgments"("tenantId");

-- CreateIndex
CREATE INDEX "announcements_tenantId_idx" ON "announcements"("tenantId");

-- CreateIndex
CREATE INDEX "assessment_results_tenantId_idx" ON "assessment_results"("tenantId");

-- CreateIndex
CREATE INDEX "assessment_submissions_tenantId_idx" ON "assessment_submissions"("tenantId");

-- CreateIndex
CREATE INDEX "assessments_tenantId_idx" ON "assessments"("tenantId");

-- CreateIndex
CREATE INDEX "attendance_tenantId_idx" ON "attendance"("tenantId");

-- CreateIndex
CREATE INDEX "attendance_alerts_tenantId_idx" ON "attendance_alerts"("tenantId");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_idx" ON "audit_logs"("tenantId");

-- CreateIndex
CREATE INDEX "branch_transfers_tenantId_idx" ON "branch_transfers"("tenantId");

-- CreateIndex
CREATE INDEX "branches_tenantId_idx" ON "branches"("tenantId");

-- CreateIndex
CREATE INDEX "budget_items_tenantId_idx" ON "budget_items"("tenantId");

-- CreateIndex
CREATE INDEX "budgets_tenantId_idx" ON "budgets"("tenantId");

-- CreateIndex
CREATE INDEX "campaign_messages_tenantId_idx" ON "campaign_messages"("tenantId");

-- CreateIndex
CREATE INDEX "chart_of_accounts_tenantId_idx" ON "chart_of_accounts"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "chart_of_accounts_code_tenantId_key" ON "chart_of_accounts"("code", "tenantId");

-- CreateIndex
CREATE INDEX "class_fee_assignments_tenantId_idx" ON "class_fee_assignments"("tenantId");

-- CreateIndex
CREATE INDEX "class_movement_logs_tenantId_idx" ON "class_movement_logs"("tenantId");

-- CreateIndex
CREATE INDEX "class_recordings_tenantId_idx" ON "class_recordings"("tenantId");

-- CreateIndex
CREATE INDEX "classes_tenantId_idx" ON "classes"("tenantId");

-- CreateIndex
CREATE INDEX "classroom_chats_tenantId_idx" ON "classroom_chats"("tenantId");

-- CreateIndex
CREATE INDEX "classroom_participants_tenantId_idx" ON "classroom_participants"("tenantId");

-- CreateIndex
CREATE INDEX "communication_logs_tenantId_idx" ON "communication_logs"("tenantId");

-- CreateIndex
CREATE INDEX "communication_preferences_tenantId_idx" ON "communication_preferences"("tenantId");

-- CreateIndex
CREATE INDEX "conversation_participants_tenantId_idx" ON "conversation_participants"("tenantId");

-- CreateIndex
CREATE INDEX "conversations_tenantId_idx" ON "conversations"("tenantId");

-- CreateIndex
CREATE INDEX "credit_notes_tenantId_idx" ON "credit_notes"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_creditNoteNumber_tenantId_key" ON "credit_notes"("creditNoteNumber", "tenantId");

-- CreateIndex
CREATE INDEX "debt_collection_campaigns_tenantId_idx" ON "debt_collection_campaigns"("tenantId");

-- CreateIndex
CREATE INDEX "expenses_tenantId_idx" ON "expenses"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_expenseNumber_tenantId_key" ON "expenses"("expenseNumber", "tenantId");

-- CreateIndex
CREATE INDEX "fee_categories_tenantId_idx" ON "fee_categories"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "fee_categories_code_tenantId_key" ON "fee_categories"("code", "tenantId");

-- CreateIndex
CREATE INDEX "fee_templates_tenantId_idx" ON "fee_templates"("tenantId");

-- CreateIndex
CREATE INDEX "financial_audit_logs_tenantId_idx" ON "financial_audit_logs"("tenantId");

-- CreateIndex
CREATE INDEX "financial_reports_tenantId_idx" ON "financial_reports"("tenantId");

-- CreateIndex
CREATE INDEX "grading_scales_tenantId_idx" ON "grading_scales"("tenantId");

-- CreateIndex
CREATE INDEX "homework_submissions_tenantId_idx" ON "homework_submissions"("tenantId");

-- CreateIndex
CREATE INDEX "intervention_records_tenantId_idx" ON "intervention_records"("tenantId");

-- CreateIndex
CREATE INDEX "invoice_items_tenantId_idx" ON "invoice_items"("tenantId");

-- CreateIndex
CREATE INDEX "invoices_tenantId_idx" ON "invoices"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoiceNumber_tenantId_key" ON "invoices"("invoiceNumber", "tenantId");

-- CreateIndex
CREATE INDEX "journal_entries_tenantId_idx" ON "journal_entries"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_entryNumber_tenantId_key" ON "journal_entries"("entryNumber", "tenantId");

-- CreateIndex
CREATE INDEX "journal_entry_lines_tenantId_idx" ON "journal_entry_lines"("tenantId");

-- CreateIndex
CREATE INDEX "learning_objective_mastery_tenantId_idx" ON "learning_objective_mastery"("tenantId");

-- CreateIndex
CREATE INDEX "lesson_plans_tenantId_idx" ON "lesson_plans"("tenantId");

-- CreateIndex
CREATE INDEX "message_templates_tenantId_idx" ON "message_templates"("tenantId");

-- CreateIndex
CREATE INDEX "messages_tenantId_idx" ON "messages"("tenantId");

-- CreateIndex
CREATE INDEX "misconception_patterns_tenantId_idx" ON "misconception_patterns"("tenantId");

-- CreateIndex
CREATE INDEX "mobile_money_collections_tenantId_idx" ON "mobile_money_collections"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "mobile_money_collections_reference_tenantId_key" ON "mobile_money_collections"("reference", "tenantId");

-- CreateIndex
CREATE INDEX "notifications_tenantId_idx" ON "notifications"("tenantId");

-- CreateIndex
CREATE INDEX "payment_allocations_tenantId_idx" ON "payment_allocations"("tenantId");

-- CreateIndex
CREATE INDEX "payment_plan_schedules_tenantId_idx" ON "payment_plan_schedules"("tenantId");

-- CreateIndex
CREATE INDEX "payment_plans_tenantId_idx" ON "payment_plans"("tenantId");

-- CreateIndex
CREATE INDEX "payments_tenantId_idx" ON "payments"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_transactionId_tenantId_key" ON "payments"("transactionId", "tenantId");

-- CreateIndex
CREATE INDEX "payroll_runs_tenantId_idx" ON "payroll_runs"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_runNumber_tenantId_key" ON "payroll_runs"("runNumber", "tenantId");

-- CreateIndex
CREATE INDEX "payslips_tenantId_idx" ON "payslips"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "payslips_payslipNumber_tenantId_key" ON "payslips"("payslipNumber", "tenantId");

-- CreateIndex
CREATE INDEX "pending_teacher_actions_tenantId_idx" ON "pending_teacher_actions"("tenantId");

-- CreateIndex
CREATE INDEX "petty_cash_accounts_tenantId_idx" ON "petty_cash_accounts"("tenantId");

-- CreateIndex
CREATE INDEX "petty_cash_transactions_tenantId_idx" ON "petty_cash_transactions"("tenantId");

-- CreateIndex
CREATE INDEX "push_subscriptions_tenantId_idx" ON "push_subscriptions"("tenantId");

-- CreateIndex
CREATE INDEX "question_options_tenantId_idx" ON "question_options"("tenantId");

-- CreateIndex
CREATE INDEX "questions_tenantId_idx" ON "questions"("tenantId");

-- CreateIndex
CREATE INDEX "receipt_sequences_tenantId_idx" ON "receipt_sequences"("tenantId");

-- CreateIndex
CREATE INDEX "refunds_tenantId_idx" ON "refunds"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_refundNumber_tenantId_key" ON "refunds"("refundNumber", "tenantId");

-- CreateIndex
CREATE INDEX "scholarships_tenantId_idx" ON "scholarships"("tenantId");

-- CreateIndex
CREATE INDEX "school_settings_tenantId_idx" ON "school_settings"("tenantId");

-- CreateIndex
CREATE INDEX "staff_payrolls_tenantId_idx" ON "staff_payrolls"("tenantId");

-- CreateIndex
CREATE INDEX "student_branches_tenantId_idx" ON "student_branches"("tenantId");

-- CreateIndex
CREATE INDEX "student_fee_structures_tenantId_idx" ON "student_fee_structures"("tenantId");

-- CreateIndex
CREATE INDEX "student_responses_tenantId_idx" ON "student_responses"("tenantId");

-- CreateIndex
CREATE INDEX "student_risk_assessments_tenantId_idx" ON "student_risk_assessments"("tenantId");

-- CreateIndex
CREATE INDEX "student_term_reports_tenantId_idx" ON "student_term_reports"("tenantId");

-- CreateIndex
CREATE INDEX "students_tenantId_idx" ON "students"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "students_admissionNumber_tenantId_key" ON "students"("admissionNumber", "tenantId");

-- CreateIndex
CREATE INDEX "sub_topics_tenantId_idx" ON "sub_topics"("tenantId");

-- CreateIndex
CREATE INDEX "subjects_tenantId_idx" ON "subjects"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_code_tenantId_key" ON "subjects"("code", "tenantId");

-- CreateIndex
CREATE INDEX "teacher_subjects_tenantId_idx" ON "teacher_subjects"("tenantId");

-- CreateIndex
CREATE INDEX "teaching_content_tenantId_idx" ON "teaching_content"("tenantId");

-- CreateIndex
CREATE INDEX "term_results_tenantId_idx" ON "term_results"("tenantId");

-- CreateIndex
CREATE INDEX "timetable_period_classes_tenantId_idx" ON "timetable_period_classes"("tenantId");

-- CreateIndex
CREATE INDEX "timetable_periods_tenantId_idx" ON "timetable_periods"("tenantId");

-- CreateIndex
CREATE INDEX "topic_progress_tenantId_idx" ON "topic_progress"("tenantId");

-- CreateIndex
CREATE INDEX "topics_tenantId_idx" ON "topics"("tenantId");

-- CreateIndex
CREATE INDEX "user_branches_tenantId_idx" ON "user_branches"("tenantId");

-- CreateIndex
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");

-- CreateIndex
CREATE INDEX "vendors_tenantId_idx" ON "vendors"("tenantId");

-- CreateIndex
CREATE INDEX "virtual_classrooms_tenantId_idx" ON "virtual_classrooms"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "virtual_classrooms_roomName_tenantId_key" ON "virtual_classrooms"("roomName", "tenantId");
