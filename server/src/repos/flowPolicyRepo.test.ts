import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../db/schema.js";
import * as relations from "../db/relations.js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { findPolicy, upsertPolicy, listPolicies } from "./flowPolicyRepo.js";

const TEST_DB_URL = process.env.DATABASE_URL ?? "postgres://lore:lore@localhost:5432/lore";
const RUN = Date.now().toString(36);

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
  client = postgres(TEST_DB_URL);
  db = drizzle(client, { schema: { ...schema, ...relations } }) as never;
  await migrate(db as never, { migrationsFolder: "./migrations" });
});

afterAll(async () => { await client.end(); });

describe("flowPolicyRepo", () => {
  it("upsertPolicy creates and findPolicy retrieves it", async () => {
    const flow = `F-${RUN}`;
    const p = await upsertPolicy({ flow, minApproveRole: "senior" }, db as never);
    expect(p.flow).toBe(flow);
    expect(p.minApproveRole).toBe("senior");

    const found = await findPolicy(flow, db as never);
    expect(found).toBeDefined();
    expect(found?.minApproveRole).toBe("senior");
  });

  it("re-upsert updates minApproveRole — no duplicate row, listPolicies count unchanged for that flow", async () => {
    const flow = `F2-${RUN}`;
    await upsertPolicy({ flow, minApproveRole: "senior" }, db as never);
    const before = (await listPolicies(db as never)).filter((p) => p.flow === flow);
    expect(before.length).toBe(1);

    await upsertPolicy({ flow, minApproveRole: "admin" }, db as never);
    const after = (await listPolicies(db as never)).filter((p) => p.flow === flow);
    expect(after.length).toBe(1);
    expect(after[0].minApproveRole).toBe("admin");
  });

  it("findPolicy returns undefined for missing flow", async () => {
    const found = await findPolicy("no-such-flow", db as never);
    expect(found).toBeUndefined();
  });
});
