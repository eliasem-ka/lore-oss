import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../db/schema.js";
import * as relations from "../db/relations.js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import {
  upsertEntity,
  findEntityByKey,
  upsertRuleEntityLink,
  findEntityLinksForRule,
  softDeleteEntity,
} from "./entityRepo.js";
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

describe("entityRepo", () => {
  it("upserts an entity, links a rule, then soft-deletes", async () => {
    const [proj] = await db.insert(schema.projects).values({
      workspaceId, key: `er-${RUN}`, name: "ER", platform: "backend",
    }).returning();
    const [rule] = await db.insert(schema.knowledgeUnits).values({
      workspaceId, projectId: proj.id, title: "t", flow: "F", confidence: "high",
      content: { productDescription: "x".repeat(10), technicalDescription: "y".repeat(10) },
    } as never).returning();

    const key = `user_type.test_${RUN}`;
    await upsertEntity({ key, category: "user_type", name: "Test" } as never, db as never);
    expect((await findEntityByKey(key, db as never))?.name).toBe("Test");

    await upsertRuleEntityLink(rule.id, key, "applies_to", db as never);
    const links = await findEntityLinksForRule(rule.id, db as never);
    expect(links.map((l) => l.key)).toContain(key);

    await softDeleteEntity(key, db as never);
    expect(await findEntityByKey(key, db as never)).toBeUndefined();
  });
});
