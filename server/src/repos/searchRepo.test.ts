import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { and, eq } from "drizzle-orm";
import * as schema from "../db/schema.js";
import * as relations from "../db/relations.js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { findFilteredUnits, sparseCandidates } from "./searchRepo.js";
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

describe("searchRepo", () => {
  it("filters by status/kind and finds sparse candidates by token", async () => {
    const [proj] = await db.insert(schema.projects).values({
      workspaceId, key: `sr-${RUN}`, name: "SR", platform: "backend",
    }).returning();
    const mk = (title: string) => db.insert(schema.knowledgeUnits).values({
      workspaceId, projectId: proj.id, title, flow: "Checkout", confidence: "high", status: "approved",
      content: { productDescription: "p".repeat(10), technicalDescription: "t".repeat(10) },
    } as never).returning();
    await mk(`Zebra rule ${RUN}`);
    await mk(`Other rule ${RUN}`);

    const filters = [eq(schema.knowledgeUnits.status, "approved"), eq(schema.knowledgeUnits.projectId, proj.id)];
    const all = await findFilteredUnits(filters as never, db as never);
    expect(all.length).toBeGreaterThanOrEqual(2);

    const hits = await sparseCandidates(filters as never, "Zebra", 50, db as never);
    expect(hits.length).toBe(1);
  });
});
