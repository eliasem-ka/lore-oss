/**
 * S6·3 gate tests: role-based approval gate in submitVerdict.
 * DB-backed — requires Postgres running with migrations applied.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../db/schema.js";
import * as relations from "../db/relations.js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import {
  submitCandidate,
  submitVerdict,
  registerProject,
  LoopError,
} from "./loop.js";
import * as flowPolicyRepo from "../repos/flowPolicyRepo.js";
import * as workspaceRepo from "../repos/workspaceRepo.js";

const TEST_DB_URL =
  process.env.DATABASE_URL ?? "postgres://lore:lore@localhost:5432/lore";

const RUN = Date.now().toString(36);
const GATED_FLOW = `GATE-${RUN}`;
const FREE_FLOW = `FREE-${RUN}`;
const PROJECT_KEY = `gate-proj-${RUN}`;

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
  await registerProject({ key: PROJECT_KEY, name: "Gate Project", platform: "android" }, workspaceId, db as never);
  // Seed a flow policy: GATED_FLOW requires at least "senior" to approve
  await flowPolicyRepo.upsertPolicy({ flow: GATED_FLOW, minApproveRole: "senior" }, db as never);
});

afterAll(async () => {
  await client.end();
});

const gatedCandidate = {
  title: "Gated rule",
  flow: GATED_FLOW,
  subflow: "Sub",
  productDescription: "A rule in a gated flow.",
  technicalDescription: "impl detail",
  confidence: "high" as const,
  sources: [{ path: "Foo.kt", symbol: "Foo" }],
  openQuestions: [],
  entityLinks: [] as { key: string; role: "applies_to" | "excludes" | "requires" | "modifies" }[],
};

const freeCandidate = {
  ...gatedCandidate,
  title: "Free rule",
  flow: FREE_FLOW,
};

describe("Role-based approval gate (S6·3)", () => {
  it("reviewer cannot approve a rule in a gated flow → FORBIDDEN", async () => {
    const { rule } = await submitCandidate(
      { ...gatedCandidate, projectKey: PROJECT_KEY },
      workspaceId,
      db as never
    );
    await expect(
      submitVerdict(
        { ruleId: rule.id, verdict: "approved", reviewerName: "R", reviewerRole: "reviewer" },
        workspaceId,
        db as never
      )
    ).rejects.toThrow(LoopError);

    try {
      await submitVerdict(
        { ruleId: rule.id, verdict: "approved", reviewerName: "R", reviewerRole: "reviewer" },
        workspaceId,
        db as never
      );
    } catch (e) {
      expect(e).toBeInstanceOf(LoopError);
      expect((e as LoopError).code).toBe("FORBIDDEN");
    }
  });

  it("senior can approve a rule in a gated flow → approved", async () => {
    const { rule } = await submitCandidate(
      { ...gatedCandidate, title: "Gated rule senior", projectKey: PROJECT_KEY },
      workspaceId,
      db as never
    );
    const updated = await submitVerdict(
      { ruleId: rule.id, verdict: "approved", reviewerName: "S", reviewerRole: "senior" },
      workspaceId,
      db as never
    );
    expect(updated.status).toBe("approved");
  });

  it("reviewer can approve a rule in an UNGATED flow → approved", async () => {
    const { rule } = await submitCandidate(
      { ...freeCandidate, projectKey: PROJECT_KEY },
      workspaceId,
      db as never
    );
    const updated = await submitVerdict(
      { ruleId: rule.id, verdict: "approved", reviewerName: "R", reviewerRole: "reviewer" },
      workspaceId,
      db as never
    );
    expect(updated.status).toBe("approved");
  });

  it("reviewer can REJECT a rule in a gated flow → rejected (gate skips reject)", async () => {
    const { rule } = await submitCandidate(
      { ...gatedCandidate, title: "Gated rule reject", projectKey: PROJECT_KEY },
      workspaceId,
      db as never
    );
    const updated = await submitVerdict(
      {
        ruleId: rule.id,
        verdict: "rejected",
        comment: "Not correct.",
        reviewerName: "R",
        reviewerRole: "reviewer",
      },
      workspaceId,
      db as never
    );
    expect(updated.status).toBe("rejected");
  });

  it("undefined role fails gate on gated flow → FORBIDDEN", async () => {
    const { rule } = await submitCandidate(
      { ...gatedCandidate, title: "Gated rule no role", projectKey: PROJECT_KEY },
      workspaceId,
      db as never
    );
    try {
      await submitVerdict(
        { ruleId: rule.id, verdict: "approved", reviewerName: "R", reviewerRole: undefined },
        workspaceId,
        db as never
      );
      expect.fail("should have thrown FORBIDDEN");
    } catch (e) {
      expect(e).toBeInstanceOf(LoopError);
      expect((e as LoopError).code).toBe("FORBIDDEN");
    }
  });
});
