CREATE TABLE "workspaces" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key" text NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "workspaces_key_unique" UNIQUE("key")
);--> statement-breakpoint
CREATE TABLE "workspace_members" (
  "workspace_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "workspace_members_pk" PRIMARY KEY("workspace_id","user_id")
);--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_ws_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;--> statement-breakpoint
-- seed the default workspace + make every existing user a member
INSERT INTO "workspaces" ("key","name") VALUES ('default','Default Workspace') ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
INSERT INTO "workspace_members" ("workspace_id","user_id")
  SELECT (SELECT id FROM workspaces WHERE key='default'), u.id FROM users u
  ON CONFLICT DO NOTHING;--> statement-breakpoint
-- add workspace_id to the three tenant tables, backfill to default, then NOT NULL + FK + index
ALTER TABLE "projects" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "knowledge_units" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
UPDATE "projects" SET "workspace_id" = (SELECT id FROM workspaces WHERE key='default') WHERE "workspace_id" IS NULL;--> statement-breakpoint
UPDATE "knowledge_units" SET "workspace_id" = (SELECT id FROM workspaces WHERE key='default') WHERE "workspace_id" IS NULL;--> statement-breakpoint
UPDATE "rounds" SET "workspace_id" = (SELECT id FROM workspaces WHERE key='default') WHERE "workspace_id" IS NULL;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_units" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "rounds" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
-- helper function so we can use it as a column DEFAULT (subqueries not allowed in DEFAULT)
CREATE OR REPLACE FUNCTION get_default_workspace_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT id FROM workspaces WHERE key = 'default' LIMIT 1;
$$;--> statement-breakpoint
-- temporary DB default so existing service inserts (pre-Task-3) don't violate NOT NULL
ALTER TABLE "projects" ALTER COLUMN "workspace_id" SET DEFAULT get_default_workspace_id();--> statement-breakpoint
ALTER TABLE "knowledge_units" ALTER COLUMN "workspace_id" SET DEFAULT get_default_workspace_id();--> statement-breakpoint
ALTER TABLE "rounds" ALTER COLUMN "workspace_id" SET DEFAULT get_default_workspace_id();--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_ws_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id");--> statement-breakpoint
ALTER TABLE "knowledge_units" ADD CONSTRAINT "knowledge_units_ws_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id");--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_ws_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id");--> statement-breakpoint
CREATE INDEX "projects_ws_idx" ON "projects" ("workspace_id");--> statement-breakpoint
CREATE INDEX "knowledge_units_ws_idx" ON "knowledge_units" ("workspace_id");--> statement-breakpoint
CREATE INDEX "rounds_ws_idx" ON "rounds" ("workspace_id");--> statement-breakpoint
-- unit_key: global-unique → per-workspace-unique
-- NOTE: actual constraint name in DB is rules_rule_key_unique (carried from 0007 rename)
ALTER TABLE "knowledge_units" DROP CONSTRAINT IF EXISTS "rules_rule_key_unique";--> statement-breakpoint
ALTER TABLE "knowledge_units" DROP CONSTRAINT IF EXISTS "knowledge_units_unit_key_unique";--> statement-breakpoint
ALTER TABLE "knowledge_units" ADD CONSTRAINT "knowledge_units_ws_unit_key_unique" UNIQUE("workspace_id","unit_key");
