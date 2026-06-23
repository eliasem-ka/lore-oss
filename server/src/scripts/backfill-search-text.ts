// One-shot backfill: recompute `search_text` for every knowledge unit from the
// live kind policy. Migration 0006 backfilled architecture rows from title+overview
// only; the live `architecturePolicy.searchText` also folds in techStack + patterns.
//
// Idempotent — safe to re-run. Results are identical to a fresh write because it
// delegates to the same `searchTextFor` used by ingestUnit.
//
//   npm run backfill:search-text   (uses DATABASE_URL or localhost:5432)
//
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { knowledgeUnits } from "../db/schema.js";
import type { ArchitectureContent, BusinessRuleContent } from "../db/schema.js";
import { searchTextFor } from "../services/ingestUnit.js";

export async function recomputeSearchText(): Promise<number> {
  const rows = await db.select().from(knowledgeUnits);
  let n = 0;
  for (const r of rows) {
    const content = r.content as (ArchitectureContent & BusinessRuleContent) | null;
    const searchText = searchTextFor(r.kind, {
      title: r.title,
      productDescription: (content as BusinessRuleContent | null)?.productDescription ?? null,
      technicalDescription: (content as BusinessRuleContent | null)?.technicalDescription ?? null,
      content: r.content as ArchitectureContent | BusinessRuleContent | null,
    });
    await db
      .update(knowledgeUnits)
      .set({ searchText })
      .where(eq(knowledgeUnits.id, r.id));
    n++;
  }
  return n;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  recomputeSearchText()
    .then((n) => {
      console.log(`[backfill-search-text] updated ${n} units`);
      process.exit(0);
    })
    .catch((e) => {
      console.error("[backfill-search-text] fatal:", e);
      process.exit(1);
    });
}
