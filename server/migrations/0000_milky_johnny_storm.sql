CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid NOT NULL,
	"rule_version" integer NOT NULL,
	"verdict" text NOT NULL,
	"comment" text,
	"reviewer_name" text NOT NULL,
	"reviewer_role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_label" text NOT NULL,
	"source_kind" text NOT NULL,
	"tools_detected" jsonb DEFAULT '[]'::jsonb,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "rule_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"change_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_key" text,
	"title" text NOT NULL,
	"flow" text NOT NULL,
	"subflow" text,
	"status" text DEFAULT 'in_review' NOT NULL,
	"confidence" text NOT NULL,
	"product_description" text NOT NULL,
	"technical_description" text NOT NULL,
	"decision_logic" jsonb,
	"sources" jsonb DEFAULT '[]'::jsonb,
	"open_questions" jsonb DEFAULT '[]'::jsonb,
	"current_version" integer DEFAULT 1 NOT NULL,
	"round_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rules_rule_key_unique" UNIQUE("rule_key")
);
--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_rule_id_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_versions" ADD CONSTRAINT "rule_versions_rule_id_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rules_status_idx" ON "rules" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rules_flow_idx" ON "rules" USING btree ("flow");