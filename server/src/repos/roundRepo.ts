import { and, eq } from "drizzle-orm";
import { rounds } from "../db/schema.js";
import type { DB } from "../db/index.js";

export type Round = typeof rounds.$inferSelect;

export async function insertRound(values: typeof rounds.$inferInsert, db: DB): Promise<Round> {
  const [round] = await db.insert(rounds).values(values).returning();
  return round;
}

export async function findOpenRoundsByProject(projectId: string, workspaceId: string, db: DB): Promise<Round[]> {
  return db.query.rounds.findMany({
    where: and(eq(rounds.workspaceId, workspaceId), eq(rounds.status, "open"), eq(rounds.projectId, projectId)),
  });
}

export async function markRoundCompleted(roundId: string, workspaceId: string, db: DB): Promise<Round | undefined> {
  const [round] = await db
    .update(rounds)
    .set({ status: "completed", completedAt: new Date() })
    .where(and(eq(rounds.id, roundId), eq(rounds.workspaceId, workspaceId)))
    .returning();
  return round;
}

export async function findAllRounds(workspaceId: string, db: DB): Promise<Round[]> {
  return db.query.rounds.findMany({
    where: eq(rounds.workspaceId, workspaceId),
    orderBy: (r, { desc }) => [desc(r.createdAt)],
  });
}

export async function findOpenRounds(workspaceId: string, db: DB): Promise<Round[]> {
  return db.query.rounds.findMany({
    where: and(eq(rounds.workspaceId, workspaceId), eq(rounds.status, "open")),
    orderBy: (r, { desc }) => [desc(r.createdAt)],
  });
}
