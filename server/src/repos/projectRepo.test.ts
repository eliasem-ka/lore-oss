import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../db/schema.js";
import * as relations from "../db/relations.js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { upsertProject, findProjectByKey, listAllProjects } from "./projectRepo.js";
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

describe("projectRepo", () => {
  it("upserts by key, then finds and lists it", async () => {
    const key = `repo-test-${RUN}`;
    const created = await upsertProject(
      { key, name: "Repo Test", platform: "backend" } as never,
      workspaceId,
      db as never
    );
    expect(created.key).toBe(key);

    const updated = await upsertProject(
      { key, name: "Repo Test v2", platform: "backend" } as never,
      workspaceId,
      db as never
    );
    expect(updated.id).toBe(created.id);          // same row, not a duplicate
    expect(updated.name).toBe("Repo Test v2");

    const found = await findProjectByKey(key, workspaceId, db as never);
    expect(found?.id).toBe(created.id);

    const all = await listAllProjects(workspaceId, db as never);
    expect(all.some((p) => p.key === key)).toBe(true);
  });

  it("returns undefined for an unknown key", async () => {
    expect(await findProjectByKey(`missing-${RUN}`, workspaceId, db as never)).toBeUndefined();
  });
});
