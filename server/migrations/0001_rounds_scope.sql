ALTER TABLE "rounds" ADD COLUMN IF NOT EXISTS "scope" jsonb;--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN IF NOT EXISTS "owner_name" text;
