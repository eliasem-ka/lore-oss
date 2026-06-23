import { and, eq, inArray, ne } from "drizzle-orm";
import { knowledgeUnits, unitVersions, feedback } from "../db/schema.js";
import type { DB } from "../db/index.js";

export type Unit = typeof knowledgeUnits.$inferSelect;

export type UnitWithFeedback = Unit & {
  feedback: (typeof feedback.$inferSelect)[];
};

export type UnitWithHistory = Unit & {
  unitVersions: (typeof unitVersions.$inferSelect)[];
  feedback: (typeof feedback.$inferSelect)[];
};

export async function insertUnit(values: typeof knowledgeUnits.$inferInsert, db: DB): Promise<Unit> {
  const [unit] = await db.insert(knowledgeUnits).values(values).returning();
  return unit;
}

export async function updateUnit(
  id: string,
  patch: Partial<typeof knowledgeUnits.$inferInsert>,
  db: DB
): Promise<Unit | undefined> {
  const [unit] = await db.update(knowledgeUnits).set(patch).where(eq(knowledgeUnits.id, id)).returning();
  return unit;
}

export async function findUnitById(id: string, workspaceId: string, db: DB): Promise<Unit | undefined> {
  return db.query.knowledgeUnits.findFirst({
    where: and(eq(knowledgeUnits.id, id), eq(knowledgeUnits.workspaceId, workspaceId)),
  });
}

/**
 * Internal-only: fetch a unit by id without workspace scoping.
 * Reserved for infrastructure subscribers (e.g. Jira, webhook) that react to
 * domain events and don't have access to a request-scoped workspaceId.
 * Do NOT use in service or transport layers — those must use findUnitById.
 */
export async function findUnitByIdInternal(id: string, db: DB): Promise<Unit | undefined> {
  return db.query.knowledgeUnits.findFirst({ where: eq(knowledgeUnits.id, id) });
}

export async function findUnitByRuleKey(ruleKey: string, workspaceId: string, db: DB): Promise<Unit | undefined> {
  return db.query.knowledgeUnits.findFirst({
    where: and(eq(knowledgeUnits.unitKey, ruleKey), eq(knowledgeUnits.workspaceId, workspaceId)),
  });
}

export async function insertVersion(values: typeof unitVersions.$inferInsert, db: DB): Promise<void> {
  await db.insert(unitVersions).values(values);
}

export async function findApprovedByFlow(
  flow: string,
  workspaceId: string,
  db: DB
): Promise<Array<Pick<Unit, "id" | "title" | "unitKey">>> {
  return db.query.knowledgeUnits.findMany({
    columns: { id: true, title: true, unitKey: true },
    where: and(
      eq(knowledgeUnits.workspaceId, workspaceId),
      eq(knowledgeUnits.status, "approved"),
      eq(knowledgeUnits.flow, flow),
    ),
  });
}

export async function findApprovedArchByProject(
  projectId: string,
  workspaceId: string,
  db: DB
): Promise<Array<Pick<Unit, "id" | "title" | "unitKey">>> {
  return db.query.knowledgeUnits.findMany({
    columns: { id: true, title: true, unitKey: true },
    where: and(
      eq(knowledgeUnits.workspaceId, workspaceId),
      eq(knowledgeUnits.kind, "architecture"),
      eq(knowledgeUnits.projectId, projectId),
      eq(knowledgeUnits.status, "approved")
    ),
  });
}

export async function findAllForSourceOverlap(
  excludeId: string | null,
  workspaceId: string,
  db: DB
): Promise<Array<Pick<Unit, "id" | "title" | "sources">>> {
  return db.query.knowledgeUnits.findMany({
    columns: { id: true, title: true, sources: true },
    where: and(
      eq(knowledgeUnits.workspaceId, workspaceId),
      excludeId ? ne(knowledgeUnits.id, excludeId) : undefined,
    ),
  });
}

export async function findPendingFeedbackUnits(
  flow: string | undefined,
  workspaceId: string,
  db: DB
): Promise<UnitWithFeedback[]> {
  const where = and(
    eq(knowledgeUnits.workspaceId, workspaceId),
    eq(knowledgeUnits.status, "rejected"),
    ...(flow ? [eq(knowledgeUnits.flow, flow)] : []),
  );
  return db.query.knowledgeUnits.findMany({
    where,
    with: {
      feedback: {
        where: eq(feedback.status, "pending"),
        orderBy: (f, { desc }) => [desc(f.createdAt)],
      },
    },
    orderBy: (r, { desc }) => [desc(r.updatedAt)],
  }) as Promise<UnitWithFeedback[]>;
}

export async function findUnitWithHistory(
  where: { id?: string; ruleKey?: string },
  workspaceId: string,
  db: DB
): Promise<UnitWithHistory | undefined> {
  const cond = and(
    eq(knowledgeUnits.workspaceId, workspaceId),
    where.id ? eq(knowledgeUnits.id, where.id) : eq(knowledgeUnits.unitKey, where.ruleKey!),
  );
  return db.query.knowledgeUnits.findFirst({
    where: cond,
    with: {
      unitVersions: { orderBy: (v, { asc }) => [asc(v.version)] },
      feedback: { orderBy: (f, { desc }) => [desc(f.createdAt)] },
    },
  }) as Promise<UnitWithHistory | undefined>;
}

export async function findChildren(parentId: string, workspaceId: string, db: DB): Promise<Unit[]> {
  return db.select().from(knowledgeUnits)
    .where(and(eq(knowledgeUnits.workspaceId, workspaceId), eq(knowledgeUnits.parentId, parentId)))
    .orderBy(knowledgeUnits.unitType, knowledgeUnits.title);
}

export async function findArchUnitsByProject(projectId: string, workspaceId: string, db: DB): Promise<Unit[]> {
  return db.query.knowledgeUnits.findMany({
    where: and(
      eq(knowledgeUnits.workspaceId, workspaceId),
      eq(knowledgeUnits.kind, "architecture"),
      eq(knowledgeUnits.projectId, projectId),
    ),
  });
}

export async function findStatusFlowRows(
  workspaceId: string,
  db: DB
): Promise<Array<Pick<Unit, "status" | "flow">>> {
  return db.query.knowledgeUnits.findMany({
    columns: { status: true, flow: true },
    where: eq(knowledgeUnits.workspaceId, workspaceId),
  });
}

export async function findManyByIds(ids: string[], workspaceId: string, db: DB): Promise<Unit[]> {
  if (!ids.length) return [];
  return db.select().from(knowledgeUnits)
    .where(and(eq(knowledgeUnits.workspaceId, workspaceId), inArray(knowledgeUnits.id, ids)));
}
