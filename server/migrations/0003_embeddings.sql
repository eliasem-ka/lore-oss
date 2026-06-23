CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
ALTER TABLE "rules" ADD COLUMN IF NOT EXISTS "embedding" vector(384);--> statement-breakpoint
ALTER TABLE "rules" ADD COLUMN IF NOT EXISTS "embedding_model" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rules_embedding_idx" ON "rules" USING hnsw ("embedding" vector_cosine_ops);
