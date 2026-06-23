-- Fold flat business-rule columns into typed `content` jsonb, then drop them.
-- The UPDATE runs before the DROPs so no data is lost.
UPDATE "knowledge_units" SET "content" = jsonb_strip_nulls(jsonb_build_object(
  'productDescription', "product_description",
  'technicalDescription', "technical_description",
  'decisionLogic', "decision_logic",
  'openQuestions', "open_questions"
)) WHERE "kind" = 'business_rule';--> statement-breakpoint
ALTER TABLE "knowledge_units" DROP COLUMN "product_description";--> statement-breakpoint
ALTER TABLE "knowledge_units" DROP COLUMN "technical_description";--> statement-breakpoint
ALTER TABLE "knowledge_units" DROP COLUMN "decision_logic";--> statement-breakpoint
ALTER TABLE "knowledge_units" DROP COLUMN "open_questions";
