import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../db/schema.js";
import * as relations from "../db/relations.js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { insertRound, findOpenRoundsByProject, markRoundCompleted } from "./roundRepo.js";
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

describe("roundRepo", () => {
  it("inserts an open round, finds it by project, completes it", async () => {
    const [proj] = await db.insert(schema.projects).values({
      workspaceId, key: `rr-${RUN}`, name: "RR", platform: "backend",
    }).returning();

    const round = await insertRound({
      workspaceId, projectId: proj.id, sourceLabel: "rr-src", sourceKind: "repo", status: "open",
    } as never, db as never);
    expect(round.status).toBe("open");

    const open = await findOpenRoundsByProject(proj.id, workspaceId, db as never);
    expect(open.some((r) => r.id === round.id)).toBe(true);

    const done = await markRoundCompleted(round.id, workspaceId, db as never);
    expect(done?.status).toBe("completed");

    const stillOpen = await findOpenRoundsByProject(proj.id, workspaceId, db as never);
    expect(stillOpen.some((r) => r.id === round.id)).toBe(false);
  });
});
