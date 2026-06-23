import { eq, sql } from "drizzle-orm";
import { flowPolicies } from "../db/schema.js";
import type { DB } from "../db/index.js";

export type FlowPolicy = typeof flowPolicies.$inferSelect;

export async function findPolicy(flow: string, db: DB): Promise<FlowPolicy | undefined> {
  const [p] = await db.select().from(flowPolicies).where(eq(flowPolicies.flow, flow));
  return p;
}

export async function upsertPolicy(values: { flow: string; minApproveRole: string }, db: DB): Promise<FlowPolicy> {
  const [p] = await db.insert(flowPolicies).values(values)
    .onConflictDoUpdate({ target: flowPolicies.flow, set: { minApproveRole: values.minApproveRole, updatedAt: sql`now()` } })
    .returning();
  return p;
}

export async function listPolicies(db: DB): Promise<FlowPolicy[]> {
  return db.select().from(flowPolicies).orderBy(flowPolicies.flow);
}
