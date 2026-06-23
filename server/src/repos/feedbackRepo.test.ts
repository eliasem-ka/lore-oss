import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../db/schema.js";
import * as relations from "../db/relations.js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { insertFeedback, findFirstFeedbackForRule, resolveFeedback } from "./feedbackRepo.js";
import * as workspaceRepo from "./workspaceRepo.js";

const TEST_DB_URL = process.env.DATABASE_URL ?? "postgres://lore:lore@localhost:5432/lore";
const RUN = Date.now().toString(36);

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;
let workspaceId: string;

beforeAll(async () => {
  client = postgres(TEST_DB_URL);
  db = drizzle(client, { schema: { ...schema, ...relations } }) as never;
  await migrate(db as never, { migrationsFolder: "./migrations" });
  const ws = await workspaceRepo.findByKey("default", db as never);
  if (!ws) throw new Error("Default workspace not found");
  workspaceId = ws.id;
});
afterAll(async () => { await client.end(); });

describe("feedbackRepo", () => {
  it("inserts feedback, finds the first, and resolves by id", async () => {
    const [proj] = await db.insert(schema.projects).values({
      workspaceId, key: `fb-${RUN}`, name: "FB", platform: "backend",
    }).returning();
    const [rule] = await db.insert(schema.knowledgeUnits).values({
      workspaceId, projectId: proj.id, title: "t", flow: "F", confidence: "high",
      content: { productDescription: "x".repeat(10), technicalDescription: "y".repeat(10) },
    } as never).returning();

    await insertFeedback({
      unitId: rule.id, unitVersion: 1, verdict: "rejected",
      comment: "fix it", reviewerName: "rev", status: "pending",
    } as never, db as never);

    const first = await findFirstFeedbackForRule(rule.id, db as never);
    expect(first?.verdict).toBe("rejected");
    expect(first?.status).toBe("pending");

    await resolveFeedback(rule.id, [first!.id], db as never);
    const after = await findFirstFeedbackForRule(rule.id, db as never);
    expect(after?.status).toBe("resolved");
  });
});
