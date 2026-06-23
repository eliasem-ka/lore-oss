import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema.js";
import * as relations from "../../db/relations.js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createEventBus } from "../../infra/eventBus.js";
import { ruleCapabilities } from "./rules.js";

const TEST_DB_URL =
  process.env.DATABASE_URL ?? "postgres://lore:lore@localhost:5432/lore";

const RUN = Date.now().toString(36);

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;
let workspaceId: string;

beforeAll(async () => {
  client = postgres(TEST_DB_URL);
  db = drizzle(client, { schema: { ...schema, ...relations } }) as never;
  await migrate(db as never, { migrationsFolder: "./migrations" });
  // Resolve the default workspace id
  const [ws] = await client`SELECT id FROM workspaces WHERE key = 'default' LIMIT 1`;
  if (!ws) throw new Error("Default workspace not found");
  workspaceId = ws.id;
});

afterAll(async () => {
  await client.end();
});

describe("events wiring — submitVerdict emits VerdictSubmitted + UnitStatusChanged", () => {
  it("records both events via a recording bus", async () => {
    // Seed: ensure a project exists (reuse 'default' seeded by migration 0004).
    // Then insert an in_review rule directly so the service can find it.

    // Use sql-level insert to get a project id robustly
    const projectRows: { id: string }[] = await client`
      SELECT id FROM projects WHERE key = 'default' LIMIT 1
    `;

    if (projectRows.length === 0) {
      await client`
        INSERT INTO projects (key, name, platform)
        VALUES ('default', 'Default', 'other')
        ON CONFLICT (key) DO NOTHING
      `;
    }

    const [proj] = await client`SELECT id FROM projects WHERE key = 'default' LIMIT 1`;
    const projectId = proj.id;

    // Insert an in_review business_rule (content holds productDescription/technicalDescription after migration 0008)
    const contentJson = JSON.stringify({ productDescription: "Product desc", technicalDescription: "Technical desc" });
    const [rule] = await client`
      INSERT INTO knowledge_units (workspace_id, project_id, kind, title, flow, content, confidence, status, current_version, sources)
      VALUES (
        ${workspaceId},
        ${projectId},
        'business_rule',
        'Wiring test rule',
        'Test Flow',
        ${contentJson}::jsonb,
        'high',
        'in_review',
        1,
        '[]'
      )
      RETURNING id
    `;
    const ruleId = rule.id;

    // Recording bus
    const events: any[] = [];
    const bus = createEventBus();
    for (const t of ["UnitStatusChanged", "VerdictSubmitted", "UnitPublished", "UnitContentChanged"] as const) {
      bus.on(t, (e) => events.push(e));
    }

    // Call the capability handler directly (pass workspaceId so the FORBIDDEN guard passes)
    const cap = ruleCapabilities.find((c) => c.name === "submitVerdict")!;
    await cap.handler({ ruleId, verdict: "approved", reviewerName: "rev", reviewerRole: "QA" } as any, { bus, workspaceId });

    // Assert both events were emitted
    const types = events.map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(["VerdictSubmitted", "UnitStatusChanged"]));

    // Check event payloads
    const verdictEvent = events.find((e) => e.type === "VerdictSubmitted");
    expect(verdictEvent).toMatchObject({ unitId: ruleId, verdict: "approved", reviewer: "rev" });

    const statusEvent = events.find((e) => e.type === "UnitStatusChanged");
    expect(statusEvent).toMatchObject({ unitId: ruleId, to: "approved" });
  });
});
