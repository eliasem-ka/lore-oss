import { and, eq, inArray } from "drizzle-orm";
import { feedback } from "../db/schema.js";
import type { DB } from "../db/index.js";

export type Feedback = typeof feedback.$inferSelect;

export async function insertFeedback(values: typeof feedback.$inferInsert, db: DB): Promise<void> {
  await db.insert(feedback).values(values);
}

export async function findFirstFeedbackForRule(unitId: string, db: DB): Promise<Feedback | undefined> {
  return db.query.feedback.findFirst({ where: eq(feedback.unitId, unitId) });
}

export async function resolveFeedback(unitId: string, feedbackIds: string[], db: DB): Promise<void> {
  if (!feedbackIds.length) return;
  await db
    .update(feedback)
    .set({ status: "resolved", resolvedAt: new Date() })
    .where(and(eq(feedback.unitId, unitId), inArray(feedback.id, feedbackIds)));
}
