CREATE TABLE IF NOT EXISTS "entities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" text UNIQUE NOT NULL,
  "category" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "attributes" jsonb,
  "source" text NOT NULL DEFAULT 'manual',
  "deleted_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rule_entities" (
  "rule_id" uuid NOT NULL REFERENCES "rules"("id") ON DELETE CASCADE,
  "entity_key" text NOT NULL REFERENCES "entities"("key") ON DELETE CASCADE,
  "role" text NOT NULL DEFAULT 'applies_to',
  PRIMARY KEY ("rule_id", "entity_key")
);
