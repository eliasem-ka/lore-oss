import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../db/schema.js";
import * as relations from "../db/relations.js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { DB } from "../db/index.js";
import {
  findByKey,
  upsertWorkspace,
  isMember,
  addMember,
  listForUser,
} from "./workspaceRepo.js";

const TEST_DB_URL = process.env.DATABASE_URL ?? "postgres://lore:lore@localhost:5432/lore";
const RUN = Date.now().toString(36);

let client: ReturnType<typeof postgres>;
let db: DB;

beforeAll(async () => {
  client = postgres(TEST_DB_URL);
  db = drizzle(client, { schema: { ...schema, ...relations } }) as unknown as DB;
  await migrate(db as never, { migrationsFolder: "./migrations" });
});

afterAll(async () => { await client.end(); });

describe("workspaceRepo", () => {
  it("upsertWorkspace creates a new workspace", async () => {
    const ws = await upsertWorkspace({ key: `ws-${RUN}`, name: "Test WS" }, db);
    expect(ws.key).toBe(`ws-${RUN}`);
    expect(ws.name).toBe("Test WS");
    expect(ws.id).toBeTruthy();
  });

  it("upsertWorkspace updates name on conflict", async () => {
    const key = `ws-upsert-${RUN}`;
    await upsertWorkspace({ key, name: "First Name" }, db);
    const updated = await upsertWorkspace({ key, name: "Updated Name" }, db);
    expect(updated.name).toBe("Updated Name");
    expect(updated.key).toBe(key);
  });

  it("findByKey returns workspace if it exists", async () => {
    const key = `ws-find-${RUN}`;
    await upsertWorkspace({ key, name: "Find Me" }, db);
    const found = await findByKey(key, db);
    expect(found).toBeDefined();
    expect(found?.key).toBe(key);
  });

  it("findByKey returns undefined for unknown key", async () => {
    const found = await findByKey("no-such-ws-ever", db);
    expect(found).toBeUndefined();
  });

  it("isMember returns false before addMember", async () => {
    const ws = await upsertWorkspace({ key: `ws-mem-${RUN}`, name: "Mem WS" }, db);
    const [user] = await db.insert(schema.users).values({
      email: `ws-mem-user-${RUN}@test.com`,
      name: "Mem User",
      role: "reviewer",
      passwordHash: "hash",
    }).returning();

    const before = await isMember(ws.id, user.id, db);
    expect(before).toBe(false);
  });

  it("addMember makes isMember return true", async () => {
    const ws = await upsertWorkspace({ key: `ws-addmem-${RUN}`, name: "Add Mem WS" }, db);
    const [user] = await db.insert(schema.users).values({
      email: `ws-addmem-user-${RUN}@test.com`,
      name: "Add Mem User",
      role: "reviewer",
      passwordHash: "hash",
    }).returning();

    await addMember(ws.id, user.id, db);
    const after = await isMember(ws.id, user.id, db);
    expect(after).toBe(true);
  });

  it("addMember is idempotent (no conflict on duplicate)", async () => {
    const ws = await upsertWorkspace({ key: `ws-idm-${RUN}`, name: "Idm WS" }, db);
    const [user] = await db.insert(schema.users).values({
      email: `ws-idm-user-${RUN}@test.com`,
      name: "Idm User",
      role: "reviewer",
      passwordHash: "hash",
    }).returning();

    await addMember(ws.id, user.id, db);
    // second call must not throw
    await expect(addMember(ws.id, user.id, db)).resolves.toBeUndefined();
  });

  it("listForUser returns workspaces the user is a member of, ordered by key", async () => {
    const [user] = await db.insert(schema.users).values({
      email: `ws-list-user-${RUN}@test.com`,
      name: "List User",
      role: "reviewer",
      passwordHash: "hash",
    }).returning();

    const wsA = await upsertWorkspace({ key: `aaa-ws-list-${RUN}`, name: "WS A" }, db);
    const wsB = await upsertWorkspace({ key: `bbb-ws-list-${RUN}`, name: "WS B" }, db);

    await addMember(wsA.id, user.id, db);
    await addMember(wsB.id, user.id, db);

    const list = await listForUser(user.id, db);
    const keys = list.map((w) => w.key);
    expect(keys).toContain(`aaa-ws-list-${RUN}`);
    expect(keys).toContain(`bbb-ws-list-${RUN}`);
    // ordered by key ascending
    const idxA = keys.indexOf(`aaa-ws-list-${RUN}`);
    const idxB = keys.indexOf(`bbb-ws-list-${RUN}`);
    expect(idxA).toBeLessThan(idxB);
  });
});

describe("migration sanity checks", () => {
  it("default workspace exists after migration", async () => {
    const ws = await findByKey("default", db);
    expect(ws).toBeDefined();
    expect(ws?.name).toBe("Default Workspace");
  });

  it("no knowledge_units lack a workspace_id (all backfilled by migration)", async () => {
    const { sql: rawSql, eq: rawEq } = await import("drizzle-orm");
    // Count units with null workspace_id — must be zero after migration
    const rows = await db.select({ wsId: schema.knowledgeUnits.workspaceId })
      .from(schema.knowledgeUnits)
      .where(rawSql`${schema.knowledgeUnits.workspaceId} IS NULL`);
    expect(rows.length).toBe(0);
  });

  it("same unit_key can exist under two different workspace_ids (composite unique)", async () => {
    const defaultWs = await findByKey("default", db);
    expect(defaultWs).toBeDefined();

    const ws2 = await upsertWorkspace({ key: `ws-dup-key-${RUN}`, name: "WS Dup" }, db);

    // seed projects in both workspaces
    const [proj1] = await db.insert(schema.projects).values({
      key: `proj-dupkey-a-${RUN}`, name: "P1", platform: "backend",
      workspaceId: defaultWs!.id,
    }).returning();
    const [proj2] = await db.insert(schema.projects).values({
      key: `proj-dupkey-b-${RUN}`, name: "P2", platform: "backend",
      workspaceId: ws2.id,
    }).returning();

    const sharedKey = `shared-unit-key-${RUN}`;

    // insert unit with sharedKey in default workspace
    const [u1] = await db.insert(schema.knowledgeUnits).values({
      workspaceId: defaultWs!.id,
      projectId: proj1.id,
      kind: "business_rule",
      unitKey: sharedKey,
      title: "Unit in WS1",
      status: "in_review",
      confidence: "high",
      content: { productDescription: "desc", technicalDescription: "tech" },
    }).returning();
    expect(u1.unitKey).toBe(sharedKey);

    // insert unit with same unitKey in ws2 — must NOT violate uniqueness
    const [u2] = await db.insert(schema.knowledgeUnits).values({
      workspaceId: ws2.id,
      projectId: proj2.id,
      kind: "business_rule",
      unitKey: sharedKey,
      title: "Unit in WS2",
      status: "in_review",
      confidence: "high",
      content: { productDescription: "desc", technicalDescription: "tech" },
    }).returning();
    expect(u2.unitKey).toBe(sharedKey);
    expect(u1.id).not.toBe(u2.id);
  });
});
