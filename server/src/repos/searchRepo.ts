import { and, eq, isNotNull, sql, type SQL } from "drizzle-orm";
import { knowledgeUnits, projects } from "../db/schema.js";
import type { DB } from "../db/index.js";

export type Unit = typeof knowledgeUnits.$inferSelect;

export async function findProjectIdByKey(key: string, workspaceId: string, db: DB): Promise<string | undefined> {
  const [p] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.key, key), eq(projects.workspaceId, workspaceId)));
  return p?.id;
}

export async function findFilteredUnits(filters: SQL[], db: DB): Promise<Unit[]> {
  return db.select().from(knowledgeUnits).where(and(...filters))
    .orderBy(knowledgeUnits.flow, knowledgeUnits.subflow, sql`${knowledgeUnits.updatedAt} desc`);
}

const ftsDoc = sql`to_tsvector('simple',
  coalesce(${knowledgeUnits.title}, '') || ' ' || coalesce(${knowledgeUnits.searchText}, ''))`;

export async function sparseCandidates(filters: SQL[], query: string, limit: number, db: DB) {
  const ftsQuery = sql`plainto_tsquery('simple', ${query})`;
  return db.select({ id: knowledgeUnits.id }).from(knowledgeUnits)
    .where(and(...filters, sql`${ftsDoc} @@ ${ftsQuery}`))
    .orderBy(sql`ts_rank(${ftsDoc}, ${ftsQuery}) desc`).limit(limit);
}

export async function denseCandidates(filters: SQL[], queryVec: number[], limit: number, db: DB) {
  const vecLiteral = `[${queryVec.join(",")}]`;
  return db.select({ id: knowledgeUnits.id }).from(knowledgeUnits)
    .where(and(...filters, isNotNull(knowledgeUnits.embedding)))
    .orderBy(sql`${knowledgeUnits.embedding} <=> ${vecLiteral}::vector`).limit(limit);
}
