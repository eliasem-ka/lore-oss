ALTER TABLE "rules" RENAME TO "knowledge_units";--> statement-breakpoint
ALTER TABLE "knowledge_units" RENAME COLUMN "rule_key" TO "unit_key";--> statement-breakpoint
ALTER TABLE "rule_versions" RENAME TO "unit_versions";--> statement-breakpoint
ALTER TABLE "unit_versions" RENAME COLUMN "rule_id" TO "unit_id";--> statement-breakpoint
ALTER TABLE "rule_entities" RENAME TO "unit_entities";--> statement-breakpoint
ALTER TABLE "unit_entities" RENAME COLUMN "rule_id" TO "unit_id";--> statement-breakpoint
ALTER TABLE "feedback" RENAME COLUMN "rule_id" TO "unit_id";--> statement-breakpoint
ALTER TABLE "feedback" RENAME COLUMN "rule_version" TO "unit_version";--> statement-breakpoint
ALTER INDEX "rules_status_idx" RENAME TO "knowledge_units_status_idx";--> statement-breakpoint
ALTER INDEX "rules_flow_idx" RENAME TO "knowledge_units_flow_idx";--> statement-breakpoint
ALTER INDEX "rules_project_idx" RENAME TO "knowledge_units_project_idx";--> statement-breakpoint
ALTER INDEX "rules_kind_idx" RENAME TO "knowledge_units_kind_idx";--> statement-breakpoint
ALTER INDEX "rules_parent_idx" RENAME TO "knowledge_units_parent_idx";
