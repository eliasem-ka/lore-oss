// One-shot backfill: embed every unit that has no vector yet.
// Idempotent — targets `embedding IS NULL`, so safe to re-run (e.g. after the
// model was down during some submits, or after a model change that nulled them).
//
//   npm run backfill            (uses DATABASE_URL or localhost:5432)
//
import { isNull, eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { knowledgeUnits } from "../db/schema.js";
import type { BusinessRuleContent } from "../db/schema.js";
import { embedRule, EMBEDDING_MODEL, embeddingsEnabled } from "../services/embeddings.js";

async function main() {
  if (!embeddingsEnabled()) {
    console.log("[backfill] embeddings disabled (EMBEDDING_PROVIDER=none) — nothing to do");
    process.exit(0);
  }

  // Only business_rule units embed from product/technical text here; architecture
  // units get their embedding from `content` at submit time.
  // productDescription/technicalDescription are now stored in `content` (BusinessRuleContent).
  const pending = await db
    .select({
      id: knowledgeUnits.id,
      title: knowledgeUnits.title,
      content: knowledgeUnits.content,
    })
    .from(knowledgeUnits)
    .where(and(isNull(knowledgeUnits.embedding), eq(knowledgeUnits.kind, "business_rule")));

  console.log(`[backfill] ${pending.length} rule(s) without an embedding`);
  if (!pending.length) process.exit(0);

  let done = 0;
  let skipped = 0;
  for (const r of pending) {
    const brContent = r.content as BusinessRuleContent | null | undefined;
    const vec = await embedRule({
      title: r.title,
      productDescription: brContent?.productDescription ?? "",
      technicalDescription: brContent?.technicalDescription ?? "",
    });
    if (!vec) {
      skipped++;
      console.warn(`[backfill] skip ${r.id} — embed returned null`);
      continue;
    }
    await db
      .update(knowledgeUnits)
      .set({ embedding: vec, embeddingModel: EMBEDDING_MODEL })
      .where(eq(knowledgeUnits.id, r.id));
    done++;
    if (done % 10 === 0) console.log(`[backfill] ${done}/${pending.length}`);
  }

  console.log(`[backfill] done — embedded ${done}, skipped ${skipped}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[backfill] fatal:", err);
  process.exit(1);
});
