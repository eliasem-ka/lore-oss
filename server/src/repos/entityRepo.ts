import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { entities, unitEntities, knowledgeUnits } from "../db/schema.js";
import type { DB } from "../db/index.js";
import type { EntityRole } from "../db/schema.js";
import type { DefineEntityInput } from "../schemas/entity.js";

export type Entity = typeof entities.$inferSelect;
export type EntityLink = { key: string; name: string; category: string; role: EntityRole };

export async function upsertEntity(input: DefineEntityInput, db: DB): Promise<Entity> {
  const [entity] = await db
    .insert(entities)
    .values({
      key: input.key, category: input.category, name: input.name,
      description: input.description, attributes: input.attributes,
      source: input.source ?? "manual",
    })
    .onConflictDoUpdate({
      target: entities.key,
      set: {
        name: input.name, category: input.category,
        description: input.description ?? sql`excluded.description`,
        attributes: input.attributes !== undefined ? input.attributes : sql`excluded.attributes`,
        source: input.source ?? sql`excluded.source`,
        updatedAt: sql`now()`, deletedAt: null,
      },
    })
    .returning();
  return entity;
}

export async function patchEntity(
  key: string, patch: Partial<typeof entities.$inferInsert>, db: DB
): Promise<Entity | undefined> {
  const [entity] = await db
    .update(entities).set({ ...patch, updatedAt: new Date() })
    .where(and(eq(entities.key, key), isNull(entities.deletedAt)))
    .returning();
  return entity;
}

export async function findEntities(
  opts: { includeDeleted: boolean; category?: string }, db: DB
): Promise<Entity[]> {
  const conds = [
    ...(!opts.includeDeleted ? [isNull(entities.deletedAt)] : []),
    ...(opts.category ? [eq(entities.category, opts.category)] : []),
  ];
  return db.select().from(entities)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(entities.category, entities.name);
}

export async function findEntityByKey(key: string, db: DB): Promise<Entity | undefined> {
  const [entity] = await db.select().from(entities)
    .where(and(eq(entities.key, key), isNull(entities.deletedAt)));
  return entity;
}

export async function softDeleteEntity(key: string, db: DB): Promise<Entity | undefined> {
  const [entity] = await db.update(entities).set({ deletedAt: new Date() })
    .where(and(eq(entities.key, key), isNull(entities.deletedAt))).returning();
  return entity;
}

export async function findExistingEntityKeys(keys: string[], db: DB): Promise<Set<string>> {
  if (!keys.length) return new Set();
  const rows = await db.select({ key: entities.key }).from(entities)
    .where(and(inArray(entities.key, keys), isNull(entities.deletedAt)));
  return new Set(rows.map((e) => e.key));
}

export async function upsertRuleEntityLinks(
  unitId: string, links: Array<{ key: string; role: EntityRole }>, db: DB
): Promise<void> {
  if (!links.length) return;
  await db.insert(unitEntities)
    .values(links.map((l) => ({ unitId, entityKey: l.key, role: l.role })))
    .onConflictDoUpdate({
      target: [unitEntities.unitId, unitEntities.entityKey],
      set: { role: sql`excluded.role` },
    });
}

export async function upsertRuleEntityLink(
  unitId: string, entityKey: string, role: EntityRole, db: DB
): Promise<void> {
  await db.insert(unitEntities).values({ unitId, entityKey, role })
    .onConflictDoUpdate({
      target: [unitEntities.unitId, unitEntities.entityKey], set: { role },
    });
}

export async function deleteRuleEntityLink(unitId: string, entityKey: string, db: DB): Promise<void> {
  await db.delete(unitEntities)
    .where(and(eq(unitEntities.unitId, unitId), eq(unitEntities.entityKey, entityKey)));
}

export async function findEntityLinksForRule(unitId: string, db: DB): Promise<EntityLink[]> {
  return db.select({
    key: entities.key, name: entities.name, category: entities.category, role: unitEntities.role,
  }).from(unitEntities)
    .innerJoin(entities, eq(unitEntities.entityKey, entities.key))
    .where(and(eq(unitEntities.unitId, unitId), isNull(entities.deletedAt)));
}

export async function findEntityLinksForRules(
  unitIds: string[], db: DB
): Promise<Map<string, EntityLink[]>> {
  const byUnit = new Map<string, EntityLink[]>();
  if (!unitIds.length) return byUnit;
  const links = await db.select({
    unitId: unitEntities.unitId, key: entities.key, name: entities.name,
    category: entities.category, role: unitEntities.role,
  }).from(unitEntities)
    .innerJoin(entities, eq(unitEntities.entityKey, entities.key))
    .where(and(inArray(unitEntities.unitId, unitIds), isNull(entities.deletedAt)));
  for (const l of links) {
    const arr = byUnit.get(l.unitId) ?? [];
    arr.push({ key: l.key, name: l.name, category: l.category, role: l.role });
    byUnit.set(l.unitId, arr);
  }
  return byUnit;
}

export async function findRulesForEntity(key: string, workspaceId: string, db: DB) {
  return db.select({
    id: knowledgeUnits.id, title: knowledgeUnits.title, flow: knowledgeUnits.flow, status: knowledgeUnits.status, role: unitEntities.role,
  }).from(unitEntities)
    .innerJoin(knowledgeUnits, eq(unitEntities.unitId, knowledgeUnits.id))
    .where(and(eq(unitEntities.entityKey, key), eq(knowledgeUnits.workspaceId, workspaceId)));
}
