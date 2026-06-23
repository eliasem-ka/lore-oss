import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema.js";
import * as relations from "../../db/relations.js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { registerProject, submitCandidate, LoopError } from "../../services/loop.js";
import { findFirstFeedbackForRule } from "../../repos/feedbackRepo.js";
import { createEventBus } from "../../infra/eventBus.js";
import { ruleCapabilities } from "./rules.js";

const cap = (name: string) => ruleCapabilities.find((c) => c.name === name)!;

describe("ruleCapabilities — flags", () => {
  it("submitVerdict has mcp === false", () => {
    expect(cap("submitVerdict").mcp).toBe(false);
  });

  it("bulkVerdict has mcp === false", () => {
    expect(cap("bulkVerdict").mcp).toBe(false);
  });

  it("getProgress has mcp === false", () => {
    expect(cap("getProgress").mcp).toBe(false);
  });

  it("submitCandidate has a truthy mcp", () => {
    expect(cap("submitCandidate").mcp).toBeTruthy();
  });
});

describe("ruleCapabilities — input mappers", () => {
  it("getRule.rest.input maps params.id → { id }", () => {
    const restSpec = cap("getRule").rest as { input: (req: any) => any };
    expect(restSpec.input({ params: { id: "x" } })).toEqual({ id: "x" });
  });

  it("submitRefinement.rest.input merges body + ruleId", () => {
    const restSpec = cap("submitRefinement").rest as { input: (req: any) => any };
    expect(
      restSpec.input({ params: { id: "r" }, body: { changeNote: "n" } })
    ).toEqual({ changeNote: "n", ruleId: "r" });
  });

  it("submitVerdict.rest.input merges body + ruleId", () => {
    const restSpec = cap("submitVerdict").rest as { input: (req: any) => any };
    expect(
      restSpec.input({ params: { id: "v1" }, body: { verdict: "approved", reviewerName: "Alice" } })
    ).toEqual({ verdict: "approved", reviewerName: "Alice", ruleId: "v1" });
  });

  it("listPendingFeedback.rest.input passes flow from query string", () => {
    const restSpec = cap("listPendingFeedback").rest as { input: (req: any) => any };
    expect(restSpec.input({ query: { flow: "Checkout" } })).toEqual({ flow: "Checkout" });
    expect(restSpec.input({ query: {} })).toEqual({ flow: undefined });
  });
});

describe("ruleCapabilities — submitCandidate MCP render", () => {
  it('render for created rule contains ✓ Created new rule "T"', () => {
    const mcpSpec = cap("submitCandidate").mcp as { render: (out: any, input: any) => string };
    const text = mcpSpec.render({
      rule: { id: "r1", title: "T", flow: "F" },
      merged: false,
      version: 1,
      warnings: [],
      relatedApproved: [],
    }, {});
    expect(text).toContain('✓ Created new rule "T"');
    expect(text).toContain("rule_id: r1");
  });

  it("render for merged rule shows merged text", () => {
    const mcpSpec = cap("submitCandidate").mcp as { render: (out: any, input: any) => string };
    const text = mcpSpec.render({
      rule: { id: "r2", title: "My Rule", flow: "F", ruleKey: "my-rule" },
      merged: true,
      version: 3,
      warnings: [],
      relatedApproved: [],
    }, {});
    expect(text).toContain('✓ Merged into existing rule "My Rule"');
    expect(text).toContain("v3");
  });

  it("render includes warnings section", () => {
    const mcpSpec = cap("submitCandidate").mcp as { render: (out: any, input: any) => string };
    const text = mcpSpec.render({
      rule: { id: "r3", title: "R", flow: "F" },
      merged: false,
      version: 1,
      warnings: [{ existingRuleTitle: "Old Rule", existingRuleId: "old-id", overlapSource: "src/foo.ts" }],
      relatedApproved: [],
    }, {});
    expect(text).toContain("⚠ Source overlap warnings");
    expect(text).toContain('"Old Rule"');
  });

  it("render includes relatedApproved section", () => {
    const mcpSpec = cap("submitCandidate").mcp as { render: (out: any, input: any) => string };
    const text = mcpSpec.render({
      rule: { id: "r4", title: "R", flow: "MyFlow" },
      merged: false,
      version: 1,
      warnings: [],
      relatedApproved: [{ title: "Approved One", id: "ap1" }],
    }, {});
    expect(text).toContain('📚 Already-approved rules in flow "MyFlow"');
    expect(text).toContain('"Approved One"');
  });
});

// ──────────────────────────────────────────────────────────────
// DB-backed: verdict reviewer derived from ctx.user, not payload
// ──────────────────────────────────────────────────────────────
const TEST_DB_URL =
  process.env.DATABASE_URL ?? "postgres://lore:lore@localhost:5432/lore";
const RUN = Date.now().toString(36);
const PROJ_KEY = `verdict-token-proj-${RUN}`;

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;
let workspaceId: string;

beforeAll(async () => {
  client = postgres(TEST_DB_URL);
  db = drizzle(client, { schema: { ...schema, ...relations } }) as never;
  await migrate(db as never, { migrationsFolder: "./migrations" });
  // Resolve the default workspace (seeded by migration 0012)
  const [ws] = await client`SELECT id FROM workspaces WHERE key = 'default' LIMIT 1`;
  if (!ws) throw new Error("Default workspace not found");
  workspaceId = ws.id;
  await registerProject({ key: PROJ_KEY, name: "Verdict Token Test", platform: "backend" }, workspaceId, db as never);
});

afterAll(async () => {
  await client.end();
});

describe("ruleCapabilities — submitVerdict derives reviewer from ctx.user", () => {
  it("stores reviewerName/reviewerRole from ctx.user, ignoring payload values", async () => {
    // Seed an in_review unit
    const { rule } = await submitCandidate({
      projectKey: PROJ_KEY,
      title: "Token reviewer test rule",
      flow: "Auth",
      productDescription: "Verifies reviewer identity comes from token.",
      technicalDescription: "submitVerdict handler takes ctx.user over payload.",
      confidence: "high",
      sources: [],
      entityLinks: [],
      openQuestions: [],
    }, workspaceId, db as never);

    const bus = createEventBus();
    const submitVerdictCap = cap("submitVerdict");

    // Call handler with ctx.user = { name: "TokenUser", role: "senior" }
    // and a DIFFERENT reviewerName in the input — ctx.user must win
    await submitVerdictCap.handler(
      { ruleId: rule.id, verdict: "approved", reviewerName: "PayloadName", reviewerRole: "junior" },
      { bus, workspaceId, user: { id: "u-test", email: "token@test.com", name: "TokenUser", role: "senior" } },
    );

    const feedbackRow = await findFirstFeedbackForRule(rule.id, db as never);
    expect(feedbackRow).toBeDefined();
    expect(feedbackRow!.reviewerName).toBe("TokenUser");
    expect(feedbackRow!.reviewerRole).toBe("senior");
  });

  it("throws UNAUTHORIZED when no ctx.user and no payload reviewerName", async () => {
    const bus = createEventBus();
    const submitVerdictCap = cap("submitVerdict");

    await expect(
      submitVerdictCap.handler(
        { ruleId: "00000000-0000-0000-0000-000000000001", verdict: "approved" },
        { bus, workspaceId },
      )
    ).rejects.toThrow(LoopError);
  });
});
