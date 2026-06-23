ALTER TABLE "projects" ALTER COLUMN "workspace_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "knowledge_units" ALTER COLUMN "workspace_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "rounds" ALTER COLUMN "workspace_id" DROP DEFAULT;--> statement-breakpoint
DROP FUNCTION IF EXISTS get_default_workspace_id();
