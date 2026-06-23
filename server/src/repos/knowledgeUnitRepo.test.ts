import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../db/schema.js";
import * as relations from "../db/relations.js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import {
  insertUnit,
  insertVersion,
  findUnitByRuleKey,
  findUnitWithHistory,
  findChildren,
} from "./knowledgeUnitRepo.js";
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

describe("knowledgeUnitRepo", () => {
  it("inserts a unit + version, reads history, and finds children", async () => {
    const [proj] = await db.insert(schema.projects).values({
      workspaceId, key: `ku-${RUN}`, name: "KU", platform: "backend",
    }).returning();

    const unit = await insertUnit({
      workspaceId, projectId: proj.id, title: "Parent feature", confidence: "high", kind: "architecture",
      unitType: "feature", unitKey: `arch:ku:${RUN}`, status: "published", currentVersion: 1,
      content: { overview: "x".repeat(10), provenance: {} },
    } as never, db as never);
    await insertVersion({ unitId: unit.id, version: 1, snapshot: {}, createdBy: "agent" } as never, db as never);

    const child = await insertUnit({
      workspaceId, projectId: proj.id, title: "UI layer", confidence: "high", kind: "architecture",
      unitType: "layer", parentId: unit.id, status: "published", currentVersion: 1,
      content: { overview: "y".repeat(10), provenance: {} },
    } as never, db as never);

    const byKey = await findUnitByRuleKey(`arch:ku:${RUN}`, workspaceId, db as never);
    expect(byKey?.id).toBe(unit.id);

    const history = await findUnitWithHistory({ id: unit.id }, workspaceId, db as never);
    expect(history?.unitVersions.length).toBe(1);

    const children = await findChildren(unit.id, workspaceId, db as never);
    expect(children.map((c) => c.id)).toContain(child.id);
  });
});
