CREATE TABLE "unit_external_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "unit_id" uuid NOT NULL,
  "system" text NOT NULL,
  "external_key" text NOT NULL,
  "url" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "unit_external_links_unit_system_unique" UNIQUE("unit_id","system")
);--> statement-breakpoint
ALTER TABLE "unit_external_links" ADD CONSTRAINT "unit_external_links_unit_id_knowledge_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."knowledge_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "unit_external_links_unit_idx" ON "unit_external_links" USING btree ("unit_id");
