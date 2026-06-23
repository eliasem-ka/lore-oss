/**
 * DB-backed integration test for the denormalized `search_text` column (Phase 3 Task 1).
 *
 * Asserts:
 *  1. `search_text` is populated on insert via submitCandidate.
 *  2. FTS (searchCatalog) finds a rule via a unique token that lives in
 *     `technicalDescription` — the column that FTS previously read directly but
 *     now reaches through `search_text`.
 *  3. Architecture units also get `search_text` populated via submitArchitectureUnit.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema.js";
import * as relations from "../db/relations.js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { DB } from "../db/index.js";
import {
  submitCandidate,
  submitArchitectureUnit,
  submitVerdict,
  searchCatalog,
  registerProject,
} from "../services/loop.js";
import { knowledgeUnits } from "../db/schema.js";
import * as workspaceRepo from "./workspaceRepo.js";

const TEST_DB_URL =
  process.env.DATABASE_URL ?? "postgres://lore:lore@localhost:5432/lore";

const RUN = Date.now().toString(36);
const PROJECT_KEY = `st-proj-${RUN}`;

let client: ReturnType<typeof postgres>;
let db: DB;
let workspaceId: string;

beforeAll(async () => {
  client = postgres(TEST_DB_URL);
  db = drizzle(client, { schema: { ...schema, ...relations } }) as unknown as DB;
  await migrate(db as never, { migrationsFolder: "./migrations" });
  const ws = await workspaceRepo.findByKey("default", db);
  if (!ws) throw new Error("Default workspace not found");
  workspaceId = ws.id;
  await registerProject(
    { key: PROJECT_KEY, name: "SearchText Test Project", platform: "backend" },
    workspaceId,
    db
  );
});

afterAll(async () => {
  await client.end();
});

describe("search_text column — business_rule", () => {
  const TOKEN = `ZZTOKEN-${RUN}`;

  it("populates search_text on insert and finds the rule via FTS", async () => {
    // Submit a business rule with the unique token in technicalDescription.
    const { rule } = await submitCandidate(
      {
        projectKey: PROJECT_KEY,
        title: "Search text test rule",
        flow: "SearchTextFlow",
        productDescription: "Product desc without token.",
        technicalDescription: `Technical description containing ${TOKEN} for FTS.`,
        confidence: "high",
        sources: [],
        openQuestions: [],
        entityLinks: [],
      },
      workspaceId,
      db
    );

    // 1. search_text column must be populated with the token.
    const [row] = await db
      .select({ searchText: knowledgeUnits.searchText })
      .from(knowledgeUnits)
      .where(eq(knowledgeUnits.id, rule.id));

    expect(row.searchText).toBeTruthy();
    expect(row.searchText).toContain(TOKEN);

    // 2. Approve the rule so searchCatalog (status=approved) can find it.
    await submitVerdict(
      {
        ruleId: rule.id,
        verdict: "approved",
        comment: undefined,
        reviewerName: "tester",
        reviewerRole: "qa",
      },
      workspaceId,
      db
    );

    // 3. FTS search must return the rule via the unique token.
    const results = await searchCatalog(
      {
        query: TOKEN,
        status: "approved",
        kind: "business_rule",
        projectKey: PROJECT_KEY,
      },
      workspaceId,
      db
    );

    const ids = results.map((r) => r.id);
    expect(ids).toContain(rule.id);
  });
});

describe("search_text column — architecture", () => {
  const ARCH_TOKEN = `ZZARCH-${RUN}`;

  it("populates search_text on insert of an architecture unit", async () => {
    const { unit } = await submitArchitectureUnit(
      {
        projectKey: PROJECT_KEY,
        title: "Architecture search text feature",
        unitType: "feature",
        confidence: "high",
        content: {
          overview: `Overview containing ${ARCH_TOKEN} token for FTS.`,
          entryPoints: [],
          patterns: [],
          dependencies: [],
          diagrams: [],
          provenance: { indexCommit: "abc123", generatedAt: "2026-06-01T00:00:00Z" },
        },
        sources: [],
        entityLinks: [],
      },
      workspaceId,
      db
    );

    const [row] = await db
      .select({ searchText: knowledgeUnits.searchText })
      .from(knowledgeUnits)
      .where(eq(knowledgeUnits.id, unit.id));

    expect(row.searchText).toBeTruthy();
    expect(row.searchText).toContain(ARCH_TOKEN);
  });
});
