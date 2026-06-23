ALTER TABLE "projects" DROP CONSTRAINT "projects_key_unique";--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_ws_key_unique" UNIQUE("workspace_id","key");