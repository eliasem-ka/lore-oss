CREATE TABLE "flow_policies" (
  "flow" text PRIMARY KEY NOT NULL,
  "min_approve_role" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
