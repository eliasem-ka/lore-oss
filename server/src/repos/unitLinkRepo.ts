import { and, eq } from "drizzle-orm";
import { unitExternalLinks } from "../db/schema.js";
import type { DB } from "../db/index.js";

export type ExternalLink = typeof unitExternalLinks.$inferSelect;

export async function findLink(unitId: string, system: string, db: DB): Promise<ExternalLink | undefined> {
  const [row] = await db.select().from(unitExternalLinks)
    .where(and(eq(unitExternalLinks.unitId, unitId), eq(unitExternalLinks.system, system)));
  return row;
}

export async function insertLink(
  values: { unitId: string; system: string; externalKey: string; url: string },
  db: DB
): Promise<void> {
  await db.insert(unitExternalLinks).values(values)
    .onConflictDoNothing({ target: [unitExternalLinks.unitId, unitExternalLinks.system] });
}

export async function findLinksForUnit(unitId: string, db: DB): Promise<ExternalLink[]> {
  return db.select().from(unitExternalLinks)
    .where(eq(unitExternalLinks.unitId, unitId))
    .orderBy(unitExternalLinks.system);
}
