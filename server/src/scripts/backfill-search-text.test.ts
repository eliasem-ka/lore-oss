/**
 * DB-backed test for backfill-search-text.ts (Cleanup Task 2).
 *
 * Seeds an architecture unit with a legacy `search_text` (title only — simulating
 * what migration 0006 produced for rows that pre-date the techStack fold).
 * After `recomputeSearchText()`, the row's `search_text` must contain the unique
 * library token from `content.techStack.libraries`.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema.js";
import * as relations from "../db/relations.js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { DB } from "../db/index.js";
import { knowledgeUnits, projects } from "../db/schema.js";
import type { ArchitectureContent } from "../db/schema.js";
import { recomputeSearchText } from "./backfill-search-text.js";
import * as workspaceRepo from "../repos/workspaceRepo.js";

const TEST_DB_URL =
  process.env.DATABASE_URL ?? "postgres://lore:lore@localhost:5432/lore";

const RUN = Date.now().toString(36);
const PROJECT_KEY = `bst-proj-${RUN}`;

let client: ReturnType<typeof postgres>;
let db: DB;
let workspaceId: string;

beforeAll(async () => {
  client = postgres(TEST_DB_URL);
  db = drizzle(client, { schema: { ...schema, ...relations } }) as unknown as DB;
  await migrate(db as never, { migrationsFolder: "./migrations" });
  const ws = await workspaceRepo.findByKey("default", db as never);
  if (!ws) throw new Error("Default workspace not found");
  workspaceId = ws.id;
  // Seed a project for the unit FK.
  await db
    .insert(projects)
    .values({
      workspaceId,
      key: PROJECT_KEY,
      name: "BackfillSearchText Test Project",
      platform: "backend",
    })
    .onConflictDoNothing();
});

afterAll(async () => {
  await client.end();
});

describe("recomputeSearchText()", () => {
  it("updates architecture search_text to include techStack libraries", async () => {
    const libToken = `zzlib-${RUN}`;

    // Build the architecture content with the unique token in techStack.libraries.
    const archContent: ArchitectureContent = {
      overview: "Arch overview for backfill test",
      techStack: {
        libraries: [libToken],
      },
      entryPoints: [],
      patterns: [],
      dependencies: [],
      diagrams: [],
      provenance: { indexCommit: "deadbeef", generatedAt: "2026-06-22T00:00:00Z" },
    };

    // Look up the project id.
    const [proj] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.key, PROJECT_KEY));

    // Direct insert: simulate a legacy row with search_text = title only.
    const TITLE = `Backfill test arch unit ${RUN}`;
    const [inserted] = await db
      .insert(knowledgeUnits)
      .values({
        workspaceId,
        projectId: proj.id,
        kind: "architecture",
        title: TITLE,
        status: "in_review",
        confidence: "high",
        content: archContent,
        searchText: TITLE, // legacy: only title, no techStack
        currentVersion: 1,
      })
      .returning({ id: knowledgeUnits.id });

    // Sanity: verify the initial search_text does NOT contain the lib token.
    const [before] = await db
      .select({ searchText: knowledgeUnits.searchText })
      .from(knowledgeUnits)
      .where(eq(knowledgeUnits.id, inserted.id));
    expect(before.searchText).not.toContain(libToken);

    // Run the backfill.
    const count = await recomputeSearchText();
    expect(count).toBeGreaterThanOrEqual(1);

    // Assert the row's search_text now contains the techStack library token.
    const [after] = await db
      .select({ searchText: knowledgeUnits.searchText })
      .from(knowledgeUnits)
      .where(eq(knowledgeUnits.id, inserted.id));

    expect(after.searchText).toContain(libToken);
  });
});
