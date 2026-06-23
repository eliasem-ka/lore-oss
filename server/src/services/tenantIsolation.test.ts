import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "../db/schema.js";
import * as relations from "../db/relations.js";
import * as workspaceRepo from "../repos/workspaceRepo.js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import {
  submitCandidate,
  submitArchitectureUnit,
  submitVerdict,
  searchCatalog,
  getRule,
  getProgress,
  registerProject,
  createRound,
  completeRound,
  defineEntity,
  linkRuleToEntity,
  LoopError,
} from "./loop.js";
import * as projectRepo from "../repos/projectRepo.js";

// Cross-tenant isolation — the behavioral proof of S6·2 multi-tenant scoping.
// Two workspaces (A, B) each get their own project and an approved business rule
// that SHARES the same unit_key value (proving per-workspace uniqueness), plus an
// approved architecture unit. Every tenant read must see ONLY its own workspace's
// units; a foreign unit must be INVISIBLE (getRule → RULE_NOT_FOUND), and a verdict
// must not cross tenants.

const TEST_DB_URL =
  process.env.DATABASE_URL ?? "postgres://lore:lore@localhost:5432/lore";

// Per-run unique suffix — the test DB is persistent, so keep keys collision-free.
const RUN = Date.now().toString(36);
const WS_A = `tenant-a-${RUN}`;
const WS_B = `tenant-b-${RUN}`;
const PROJ_A = `iso-proj-a-${RUN}`;
const PROJ_B = `iso-proj-b-${RUN}`;
// The SHARED unit_key — identical in both workspaces. The dual inserts succeeding
// is itself the proof that uniqueness is scoped (workspace_id, unit_key), not global.
const SHARED_KEY = `iso-shared-${RUN}`;
const ARCH_KEY_A = `iso-arch-a-${RUN}`;
const ARCH_KEY_B = `iso-arch-b-${RUN}`;
// Run-unique flow → never hits a flow_policy left in the persistent test DB.
const FLOW = `IsoCheckout-${RUN}`;

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;
let wsA: string;
let wsB: string;
let aUnitId: string;
let bUnitId: string;
let bRoundId: string;
// A project key registered in BOTH workspaces — the per-workspace uniqueness probe.
const SHARED_PROJ = `iso-shared-proj-${RUN}`;
let aSharedProjId: string;
let bSharedProjId: string;
// A global entity used to probe the cross-tenant entity-link guard (I1).
const ENTITY_KEY = `iso-entity-${RUN}`;

const candidate = (ruleKey: string, projectKey: string, title: string) => ({
  ruleKey,
  projectKey,
  title,
  flow: FLOW,
  subflow: "Payment",
  productDescription: "A valid payment method is required before checkout completes.",
  technicalDescription: "PaymentGuard.assertValid() runs before OrderService.place().",
  confidence: "high" as const,
  sources: [{ path: "checkout/PaymentGuard.kt", symbol: "PaymentGuard" }],
  openQuestions: [],
  entityLinks: [] as { key: string; role: "applies_to" | "excludes" | "requires" | "modifies" }[],
});

const archUnit = (ruleKey: string, projectKey: string, title: string) => ({
  ruleKey,
  projectKey,
  title,
  unitType: "feature" as const,
  confidence: "high" as const,
  sources: [] as { path?: string; symbol?: string }[],
  content: {
    overview: "Checkout feature overview spanning the purchase funnel steps.",
    techStack: { endpoints: [], libraries: [], persistence: [] },
    entryPoints: [],
    patterns: [],
    dependencies: [],
    diagrams: [],
    provenance: { indexCommit: "sha-iso", generatedAt: "2026-06-22T00:00:00Z" },
  },
  entityLinks: [] as { key: string; role: "applies_to" | "excludes" | "requires" | "modifies" }[],
});

beforeAll(async () => {
  client = postgres(TEST_DB_URL);
  db = drizzle(client, { schema: { ...schema, ...relations } }) as never;
  await migrate(db as never, { migrationsFolder: "./migrations" });

  // Two distinct workspaces.
  const a = await workspaceRepo.upsertWorkspace({ key: WS_A, name: "Tenant A" }, db as never);
  const b = await workspaceRepo.upsertWorkspace({ key: WS_B, name: "Tenant B" }, db as never);
  wsA = a.id;
  wsB = b.id;

  // One project per workspace.
  await registerProject({ key: PROJ_A, name: "Iso Project A", platform: "android" }, wsA, db as never);
  await registerProject({ key: PROJ_B, name: "Iso Project B", platform: "ios" }, wsB, db as never);

  // Approved business rule in A — SHARED unit_key.
  const aRule = await submitCandidate(candidate(SHARED_KEY, PROJ_A, "Payment rule (A)"), wsA, db as never);
  aUnitId = aRule.rule.id;
  await submitVerdict({ ruleId: aUnitId, verdict: "approved", reviewerName: "Alice" }, wsA, db as never);

  // Approved business rule in B — SAME unit_key value (must NOT collide).
  const bRule = await submitCandidate(candidate(SHARED_KEY, PROJ_B, "Payment rule (B)"), wsB, db as never);
  bUnitId = bRule.rule.id;
  await submitVerdict({ ruleId: bUnitId, verdict: "approved", reviewerName: "Bob" }, wsB, db as never);

  // Approved architecture unit per workspace.
  const aArch = await submitArchitectureUnit(archUnit(ARCH_KEY_A, PROJ_A, "Checkout arch (A)"), wsA, db as never);
  await submitVerdict({ ruleId: aArch.unit.id, verdict: "approved", reviewerName: "Alice" }, wsA, db as never);
  const bArch = await submitArchitectureUnit(archUnit(ARCH_KEY_B, PROJ_B, "Checkout arch (B)"), wsB, db as never);
  await submitVerdict({ ruleId: bArch.unit.id, verdict: "approved", reviewerName: "Bob" }, wsB, db as never);

  // An OPEN round in B — the completeRound cross-tenant target (C1).
  const bRound = await createRound(
    { projectKey: PROJ_B, sourceLabel: "iso-round-b", sourceKind: "repo", toolsDetected: [] },
    wsB,
    db as never
  );
  bRoundId = bRound.round.id;

  // The SAME project key registered in BOTH workspaces (C2). Two distinct rows.
  const aSharedProj = await registerProject(
    { key: SHARED_PROJ, name: "Shared Proj A name", platform: "android" },
    wsA,
    db as never
  );
  const bSharedProj = await registerProject(
    { key: SHARED_PROJ, name: "Shared Proj B name", platform: "ios" },
    wsB,
    db as never
  );
  aSharedProjId = aSharedProj.id;
  bSharedProjId = bSharedProj.id;

  // A global entity for the I1 link-guard probe.
  await defineEntity({ key: ENTITY_KEY, category: "user_type", name: "Iso Member" }, db as never);
});

afterAll(async () => {
  await client.end();
});

describe("cross-tenant isolation (S6·2)", () => {
  it("the SAME unit_key exists independently in A and B (per-workspace uniqueness)", () => {
    // The dual submitCandidate calls in beforeAll both succeeded with SHARED_KEY —
    // distinct rows, no unique collision. Two distinct ids prove independence.
    expect(aUnitId).toBeDefined();
    expect(bUnitId).toBeDefined();
    expect(aUnitId).not.toBe(bUnitId);
  });

  it("searchCatalog returns only the caller's workspace units", async () => {
    const fromA = await searchCatalog({ status: "approved" }, wsA, db as never);
    const fromB = await searchCatalog({ status: "approved" }, wsB, db as never);

    const idsA = fromA.map((r) => r.id);
    const idsB = fromB.map((r) => r.id);

    // A sees A's unit, never B's; B sees B's unit, never A's.
    expect(idsA).toContain(aUnitId);
    expect(idsA).not.toContain(bUnitId);
    expect(idsB).toContain(bUnitId);
    expect(idsB).not.toContain(aUnitId);
  });

  it("getRule for a foreign-workspace unit throws RULE_NOT_FOUND (invisible)", async () => {
    // A's unit must be invisible to B — never reveal cross-tenant existence.
    await expect(getRule({ id: aUnitId }, wsB, db as never)).rejects.toThrow(LoopError);
    await expect(getRule({ id: aUnitId }, wsB, db as never)).rejects.toMatchObject({
      code: "RULE_NOT_FOUND",
    });
    // Sanity: A can still read its own unit.
    const own = await getRule({ id: aUnitId }, wsA, db as never);
    expect(own.id).toBe(aUnitId);
  });

  it("getProgress counts only the caller's workspace units", async () => {
    const progA = await getProgress(wsA, db as never);
    const progB = await getProgress(wsB, db as never);

    // A seeded: 1 approved business rule + 1 approved architecture unit = 2 approved.
    // B seeded the same. Each workspace must report EXACTLY its own 2 approved units —
    // if scoping leaked, the count would be 4.
    expect(progA.totals.approved).toBe(2);
    expect(progB.totals.approved).toBe(2);
  });

  it("submitVerdict cannot approve a unit across tenants → RULE_NOT_FOUND", async () => {
    // B tries to act on A's unit — must be rejected as not-found, not approved.
    await expect(
      submitVerdict({ ruleId: aUnitId, verdict: "approved", reviewerName: "Bob" }, wsB, db as never)
    ).rejects.toMatchObject({ code: "RULE_NOT_FOUND" });
  });

  it("completeRound cannot complete a foreign-workspace round → ROUND_NOT_FOUND (and the round stays open)", async () => {
    // A tries to complete B's open round by id — must be not-found, no mutation.
    await expect(
      completeRound(bRoundId, wsA, db as never)
    ).rejects.toMatchObject({ code: "ROUND_NOT_FOUND" });

    // B's round must remain open — the cross-tenant UPDATE matched nothing.
    const [stillOpen] = await db
      .select()
      .from(schema.rounds)
      .where(eq(schema.rounds.id, bRoundId));
    expect(stillOpen.status).toBe("open");

    // Sanity: B can complete its own round.
    const done = await completeRound(bRoundId, wsB, db as never);
    expect(done.status).toBe("completed");
  });

  it("the SAME project key exists independently in A and B (per-workspace uniqueness)", async () => {
    // Both registerProject calls in beforeAll succeeded with SHARED_PROJ → distinct rows.
    expect(aSharedProjId).not.toBe(bSharedProjId);

    // B registering A's key did NOT overwrite A's row — A keeps its own name/workspace.
    const aRow = await projectRepo.findProjectByKey(SHARED_PROJ, wsA, db as never);
    expect(aRow?.id).toBe(aSharedProjId);
    expect(aRow?.name).toBe("Shared Proj A name");
    expect(aRow?.workspaceId).toBe(wsA);

    const bRow = await projectRepo.findProjectByKey(SHARED_PROJ, wsB, db as never);
    expect(bRow?.id).toBe(bSharedProjId);
    expect(bRow?.name).toBe("Shared Proj B name");
    expect(bRow?.workspaceId).toBe(wsB);
  });

  it("linkRuleToEntity cannot mutate a foreign-workspace unit's links → RULE_NOT_FOUND", async () => {
    // B tries to link A's unit to a (global) entity — must be not-found.
    await expect(
      linkRuleToEntity(
        { ruleId: aUnitId, entityKey: ENTITY_KEY, role: "applies_to" },
        wsB,
        db as never
      )
    ).rejects.toMatchObject({ code: "RULE_NOT_FOUND" });
  });
});
