-- Architecture Knowledge (spec 001): projects dimension + knowledge-unit generalization.
-- NOTE: migrations 0001–0003 were hand-written without drizzle snapshots, so `db:generate`
-- diffed against the 0000 snapshot and emitted DDL that recreates already-existing objects.
-- This file is the corrected delta over the real DB state (0000–0003 applied). The full,
-- correct end-state snapshot is kept in meta/0004_snapshot.json for future generates.

CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"platform" text NOT NULL,
	"repo_url" text,
	"gitnexus_repo_id" text,
	"default_ref" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "projects_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "rules" ALTER COLUMN "flow" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "rules" ALTER COLUMN "product_description" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "rules" ALTER COLUMN "technical_description" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "rules" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "rules" ADD COLUMN "kind" text DEFAULT 'business_rule' NOT NULL;--> statement-breakpoint
ALTER TABLE "rules" ADD COLUMN "unit_type" text;--> statement-breakpoint
ALTER TABLE "rules" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "rules" ADD COLUMN "content" jsonb;--> statement-breakpoint
-- Backfill: assign all pre-existing rounds/rules to a default project (preserves data — SC-006).
INSERT INTO "projects" ("key", "name", "platform") VALUES ('default', 'Default', 'other') ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
UPDATE "rounds" SET "project_id" = (SELECT "id" FROM "projects" WHERE "key" = 'default') WHERE "project_id" IS NULL;--> statement-breakpoint
UPDATE "rules" SET "project_id" = (SELECT "id" FROM "projects" WHERE "key" = 'default') WHERE "project_id" IS NULL;--> statement-breakpoint
ALTER TABLE "rounds" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "rules" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_parent_id_rules_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rules_project_idx" ON "rules" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "rules_kind_idx" ON "rules" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "rules_parent_idx" ON "rules" USING btree ("parent_id");
