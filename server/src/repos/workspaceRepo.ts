import { and, eq, sql } from "drizzle-orm";
import { workspaces, workspaceMembers } from "../db/schema.js";
import type { DB } from "../db/index.js";

export type Workspace = typeof workspaces.$inferSelect;

export async function findByKey(key: string, db: DB): Promise<Workspace | undefined> {
  const [w] = await db.select().from(workspaces).where(eq(workspaces.key, key));
  return w;
}

export async function findById(id: string, db: DB): Promise<Workspace | undefined> {
  const [w] = await db.select().from(workspaces).where(eq(workspaces.id, id));
  return w;
}

export async function upsertWorkspace(values: { key: string; name: string }, db: DB): Promise<Workspace> {
  const [w] = await db.insert(workspaces).values(values)
    .onConflictDoUpdate({ target: workspaces.key, set: { name: values.name, updatedAt: sql`now()` } })
    .returning();
  return w;
}

export async function isMember(workspaceId: string, userId: string, db: DB): Promise<boolean> {
  const [m] = await db.select({ u: workspaceMembers.userId }).from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)));
  return !!m;
}

export async function addMember(workspaceId: string, userId: string, db: DB): Promise<void> {
  await db.insert(workspaceMembers).values({ workspaceId, userId }).onConflictDoNothing();
}

export async function listForUser(userId: string, db: DB): Promise<Workspace[]> {
  return db.select({
    id: workspaces.id,
    key: workspaces.key,
    name: workspaces.name,
    createdAt: workspaces.createdAt,
    updatedAt: workspaces.updatedAt,
  })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(workspaces.key);
}
