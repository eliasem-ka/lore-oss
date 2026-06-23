import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../db/schema.js";
import * as relations from "../db/relations.js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { insertUnit } from "./knowledgeUnitRepo.js";
import { findLink, insertLink, findLinksForUnit } from "./unitLinkRepo.js";
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

describe("unitLinkRepo", () => {
  it("inserts a link and retrieves it via findLink", async () => {
    const [proj] = await db.insert(schema.projects).values({
      workspaceId, key: `uel-${RUN}`, name: "UEL", platform: "backend",
    }).returning();

    const unit = await insertUnit({
      workspaceId,
      projectId: proj.id,
      title: "Test rule",
      confidence: "high",
      kind: "business_rule",
      status: "in_review",
      currentVersion: 1,
      content: {
        productDescription: "desc",
        technicalDescription: "tech",
      },
    } as never, db as never);

    await insertLink({ unitId: unit.id, system: "jira", externalKey: "PROJ-42", url: "https://jira.example.com/browse/PROJ-42" }, db as never);

    const found = await findLink(unit.id, "jira", db as never);
    expect(found).toBeDefined();
    expect(found?.externalKey).toBe("PROJ-42");
    expect(found?.url).toBe("https://jira.example.com/browse/PROJ-42");
    expect(found?.unitId).toBe(unit.id);
    expect(found?.system).toBe("jira");
  });

  it("second insertLink with same (unitId, system) is a no-op — idempotency", async () => {
    const [proj] = await db.insert(schema.projects).values({
      workspaceId, key: `uel2-${RUN}`, name: "UEL2", platform: "backend",
    }).returning();

    const unit = await insertUnit({
      workspaceId,
      projectId: proj.id,
      title: "Idempotent rule",
      confidence: "medium",
      kind: "business_rule",
      status: "in_review",
      currentVersion: 1,
      content: {
        productDescription: "desc",
        technicalDescription: "tech",
      },
    } as never, db as never);

    await insertLink({ unitId: unit.id, system: "jira", externalKey: "PROJ-1", url: "https://jira.example.com/browse/PROJ-1" }, db as never);
    // Second insert: same (unitId, "jira") — must be a no-op
    await insertLink({ unitId: unit.id, system: "jira", externalKey: "PROJ-999", url: "https://jira.example.com/browse/PROJ-999" }, db as never);

    const links = await findLinksForUnit(unit.id, db as never);
    expect(links.length).toBe(1);
    expect(links[0].externalKey).toBe("PROJ-1"); // original preserved
  });

  it("findLink returns undefined for missing system", async () => {
    const [proj] = await db.insert(schema.projects).values({
      workspaceId, key: `uel3-${RUN}`, name: "UEL3", platform: "backend",
    }).returning();

    const unit = await insertUnit({
      workspaceId,
      projectId: proj.id,
      title: "No links rule",
      confidence: "low",
      kind: "business_rule",
      status: "in_review",
      currentVersion: 1,
      content: {
        productDescription: "desc",
        technicalDescription: "tech",
      },
    } as never, db as never);

    const found = await findLink(unit.id, "jira", db as never);
    expect(found).toBeUndefined();
  });

  it("findLinksForUnit returns all links for a unit ordered by system", async () => {
    const [proj] = await db.insert(schema.projects).values({
      workspaceId, key: `uel4-${RUN}`, name: "UEL4", platform: "backend",
    }).returning();

    const unit = await insertUnit({
      workspaceId,
      projectId: proj.id,
      title: "Multi-link rule",
      confidence: "high",
      kind: "business_rule",
      status: "in_review",
      currentVersion: 1,
      content: {
        productDescription: "desc",
        technicalDescription: "tech",
      },
    } as never, db as never);

    await insertLink({ unitId: unit.id, system: "github", externalKey: "issue-7", url: "https://github.com/org/repo/issues/7" }, db as never);
    await insertLink({ unitId: unit.id, system: "jira", externalKey: "PROJ-10", url: "https://jira.example.com/browse/PROJ-10" }, db as never);

    const links = await findLinksForUnit(unit.id, db as never);
    expect(links.length).toBe(2);
    expect(links[0].system).toBe("github"); // ordered by system asc
    expect(links[1].system).toBe("jira");
  });
});
