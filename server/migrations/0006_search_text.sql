ALTER TABLE "rules" ADD COLUMN "search_text" text;
--> statement-breakpoint
UPDATE "rules" SET "search_text" =
  concat_ws(' ', title, product_description, technical_description, content->>'overview')
  WHERE "search_text" IS NULL;
