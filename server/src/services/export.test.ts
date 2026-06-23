import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../db/schema.js";
import * as relations from "../db/relations.js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { registerProject, getProjectByKey } from "./loop.js";
import { exportCatalog } from "./export.js";
import * as workspaceRepo from "../repos/workspaceRepo.js";

const TEST_DB_URL =
  process.env.DATABASE_URL ?? "postgres://lore:lore@localhost:5432/lore";

// Per-run unique suffix — keeps repeated runs isolated in the persistent test DB.
const RUN = Date.now().toString(36);
const PROJ_KEY = `export-proj-${RUN}`;
const FLOW = `S5Flow-${RUN}`;
const APPROVED_TITLE = `ApprovedRule-${RUN}`;
const ARCH_TITLE = `ApprovedArch-${RUN}`;
const IN_REVIEW_TITLE = `InReviewRule-${RUN}`;
const META_TITLE = `Rule [x] *y* \`z\` _q_ ${RUN}`;
const META_PROJ_KEY = `export-meta-${RUN}`;

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

  // Register a project for this run
  await registerProject({ key: PROJ_KEY, name: "Export Test Project", platform: "other" }, workspaceId, db as never);
  const project = await getProjectByKey(PROJ_KEY, workspaceId, db as never);
  const projectId = project.id;

  // Seed: 1 approved business rule in FLOW
  await (db as any).insert(schema.knowledgeUnits).values({
    workspaceId,
    projectId,
    title: APPROVED_TITLE,
    kind: "business_rule",
    flow: FLOW,
    status: "approved",
    confidence: "high",
    content: {
      productDescription: `Product desc for ${APPROVED_TITLE}`,
      technicalDescription: "Tech desc",
    },
    sources: [],
    currentVersion: 1,
  } as never);

  // Seed: 1 approved architecture unit (no flow)
  await (db as any).insert(schema.knowledgeUnits).values({
    workspaceId,
    projectId,
    title: ARCH_TITLE,
    kind: "architecture",
    unitType: "feature",
    status: "approved",
    confidence: "high",
    content: {
      overview: "Test architecture unit",
      provenance: { indexCommit: "sha-test", generatedAt: new Date().toISOString() },
    },
    sources: [],
    currentVersion: 1,
  } as never);

  // Seed: 1 in_review business rule in FLOW (must be excluded from default approved export)
  await (db as any).insert(schema.knowledgeUnits).values({
    workspaceId,
    projectId,
    title: IN_REVIEW_TITLE,
    kind: "business_rule",
    flow: FLOW,
    status: "in_review",
    confidence: "high",
    content: {
      productDescription: "Should not appear in approved export",
      technicalDescription: "Tech desc",
    },
    sources: [],
    currentVersion: 1,
  } as never);

  // Seed: metacharacter escaping tests — isolated project to avoid cross-contamination
  await registerProject({ key: META_PROJ_KEY, name: "Meta Export Project", platform: "other" }, workspaceId, db as never);
  const metaProject = await getProjectByKey(META_PROJ_KEY, workspaceId, db as never);
  await (db as any).insert(schema.knowledgeUnits).values({
    workspaceId,
    projectId: metaProject.id,
    title: META_TITLE,
    kind: "business_rule",
    flow: `MetaFlow-${RUN}`,
    status: "approved",
    confidence: "high",
    content: {
      productDescription: `Desc with *emphasis* and [link](url) and \`code\``,
      technicalDescription: "Tech desc",
    },
    sources: [],
    currentVersion: 1,
  } as never);
});

afterAll(async () => {
  await client.end();
});

describe("exportCatalog", () => {
  it("json export includes approved units and excludes in_review", async () => {
    // flow=FLOW + projectKey scopes to our seeded data; arch has no flow so it's excluded
    const out = await exportCatalog(
      { format: "json", flow: FLOW, projectKey: PROJ_KEY },
      workspaceId,
      db as never,
    );
    expect(out.contentType).toBe("application/json");
    const doc = JSON.parse(out.body);
    // Only the approved business rule in FLOW (arch has no flow so the flow filter excludes it)
    expect(doc.count).toBe(1);
    expect(doc.units.every((u: any) => u.status === "approved")).toBe(true);
    expect(doc.units.some((u: any) => u.title === APPROVED_TITLE)).toBe(true);
  });

  it("markdown export contains the approved title and is text/markdown", async () => {
    const out = await exportCatalog(
      { format: "markdown", projectKey: PROJ_KEY },
      workspaceId,
      db as never,
    );
    expect(out.contentType).toBe("text/markdown");
    // No escaping of hyphens — they are not inline Markdown metacharacters
    expect(out.body).toContain(APPROVED_TITLE);
    // Architecture units render their overview (content.overview) as the body
    expect(out.body).toContain("Test architecture unit");
  });

  it("kind filter narrows results to architecture only", async () => {
    const out = await exportCatalog(
      { format: "json", kind: "architecture", projectKey: PROJ_KEY },
      workspaceId,
      db as never,
    );
    const doc = JSON.parse(out.body);
    expect(doc.units.length).toBeGreaterThan(0);
    expect(doc.units.every((u: any) => u.kind === "architecture")).toBe(true);
    expect(doc.units.some((u: any) => u.title === ARCH_TITLE)).toBe(true);
  });
});

describe("exportCatalog — Markdown escaping", () => {
  it("escapes Markdown metacharacters in title and body", async () => {
    const out = await exportCatalog(
      { format: "markdown", projectKey: META_PROJ_KEY },
      workspaceId,
      db as never,
    );
    expect(out.contentType).toBe("text/markdown");
    const body = out.body;
    // Title metacharacters are escaped
    expect(body).toContain("\\[x\\]");
    expect(body).toContain("\\*y\\*");
    expect(body).toContain("\\`z\\`");
    expect(body).toContain("\\_q\\_");
    // Raw emphasis markers must NOT appear in the heading line
    const headingLine = body.split("\n").find((l) => l.includes("\\[x\\]"));
    expect(headingLine).toBeDefined();
    expect(headingLine).not.toMatch(/(?<!\\)\*y\*/);
    // Body metacharacters are escaped
    expect(body).toContain("\\*emphasis\\*");
    expect(body).toContain("\\[link\\]");
    expect(body).toContain("\\`code\\`");
  });

  it("does not add stray backslashes to normal alphanumeric text or non-inline-metacharacters", async () => {
    const out = await exportCatalog(
      { format: "markdown", projectKey: PROJ_KEY },
      workspaceId,
      db as never,
    );
    // Alphanumeric characters must never be preceded by a backslash
    expect(out.body).not.toMatch(/\\[a-zA-Z0-9]/);
    // Hyphens and dots must NOT be escaped (not inline metacharacters)
    expect(out.body).not.toMatch(/\\-/);
    expect(out.body).not.toMatch(/\\\./);
    // The full APPROVED_TITLE appears verbatim (no escaping)
    expect(out.body).toContain(APPROVED_TITLE);
  });
});
