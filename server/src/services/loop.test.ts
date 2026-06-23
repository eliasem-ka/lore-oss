import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../db/schema.js";
import * as relations from "../db/relations.js";
import * as unitLinkRepo from "../repos/unitLinkRepo.js";
import * as workspaceRepo from "../repos/workspaceRepo.js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import {
  createRound,
  completeRound,
  submitCandidate,
  submitArchitectureUnit,
  submitVerdict,
  submitRefinement,
  listPendingFeedback,
  searchCatalog,
  getRule,
  registerProject,
  getProjectByKey,
  listStaleUnits,
  LoopError,
} from "./loop.js";

const TEST_DB_URL =
  process.env.DATABASE_URL ?? "postgres://lore:lore@localhost:5432/lore";

// Per-run unique suffix for project/rule keys — the test DB is persistent, so this
// keeps repeated runs isolated (no ruleKey or open-round collisions between runs).
const RUN = Date.now().toString(36);
const AP = `arch-proj-${RUN}`;
const PA = `proj-a-${RUN}`;
const PB = `proj-b-${RUN}`;
const rk = (s: string) => `arch:${s}:${RUN}`;

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;
let workspaceId: string;  // default workspace — all tests run within it

beforeAll(async () => {
  client = postgres(TEST_DB_URL);
  db = drizzle(client, { schema: { ...schema, ...relations } }) as never;
  await migrate(db as never, { migrationsFolder: "./migrations" });
  // Resolve the default workspace (seeded by migration 0012)
  const ws = await workspaceRepo.findByKey("default", db as never);
  if (!ws) throw new Error("Default workspace not found — run migrations first");
  workspaceId = ws.id;
  await registerProject({ key: AP, name: "Arch Proj", platform: "android", defaultRef: "sha-1" }, workspaceId, db as never);
  await registerProject({ key: PA, name: "Project A", platform: "android" }, workspaceId, db as never);
  await registerProject({ key: PB, name: "Project B", platform: "ios" }, workspaceId, db as never);
});

afterAll(async () => {
  await client.end();
});

const candidateBase = {
  title: "Coupon apply requires valid order",
  flow: "Checkout",
  subflow: "Coupon Apply",
  productDescription:
    "A customer can only apply a coupon if they have an active order with a valid order number.",
  technicalDescription:
    "CouponMiddleware.validate() checks OrderRepository.findByOrderNumber() != null before allowing apply.",
  confidence: "high" as const,
  sources: [{ path: "feature/checkout/CouponApply.kt", symbol: "CouponMiddleware" }],
  openQuestions: [],
  entityLinks: [] as { key: string; role: "applies_to" | "excludes" | "requires" | "modifies" }[],
};

const archContent = (overrides: Record<string, unknown> = {}) => ({
  overview: "The Checkout feature orchestrates the order checkout funnel across four steps.",
  techStack: { endpoints: [], libraries: ["Hilt"], persistence: ["Room"] },
  entryPoints: ["CheckoutScreen"],
  patterns: ["MVI"],
  dependencies: [],
  diagrams: [],
  provenance: { indexCommit: "sha-1", generatedAt: "2026-05-28T20:13:11Z" },
  ...overrides,
});

const archBase = {
  projectKey: AP,
  title: "Checkout",
  unitType: "feature" as const,
  confidence: "high" as const,
  sources: [] as { path?: string; symbol?: string }[],
  content: archContent(),
  entityLinks: [] as { key: string; role: "applies_to" | "excludes" | "requires" | "modifies" }[],
};

describe("Loop FSM", () => {
  it("submit candidate → approve → appears in catalog", async () => {
    const { round } = await createRound(
      { projectKey: "default", sourceLabel: "acme_shop_web", sourceKind: "gitnexus", toolsDetected: ["gitnexus"] },
      workspaceId,
      db as never
    );
    expect(round.status).toBe("open");

    const { rule } = await submitCandidate(
      { ...candidateBase, roundId: round.id as string },
      workspaceId,
      db as never
    );
    expect(rule.status).toBe("in_review");
    expect(rule.currentVersion).toBe(1);

    const approved = await submitVerdict(
      { ruleId: rule.id, verdict: "approved", reviewerName: "Alice", reviewerRole: "Product" },
      workspaceId,
      db as never
    );
    expect(approved.status).toBe("approved");

    const catalog = await searchCatalog({ status: "approved" }, workspaceId, db as never);
    expect(catalog.some((r) => r.id === rule.id)).toBe(true);

    await completeRound(round.id as string, workspaceId, db as never);
  });

  it("reject → refine → back in_review, feedback resolved", async () => {
    const { rule } = await submitCandidate(candidateBase, workspaceId, db as never);

    await submitVerdict(
      {
        ruleId: rule.id,
        verdict: "rejected",
        comment: "Technical description is too vague — missing the null-check path.",
        reviewerName: "Bob",
        reviewerRole: "Senior Dev",
      },
      workspaceId,
      db as never
    );

    const pending = await listPendingFeedback({}, workspaceId, db as never);
    const found = pending.find((r) => r.id === rule.id);
    expect(found).toBeDefined();
    const feedbackId = found!.feedback[0].id;

    const refined = await submitRefinement(
      {
        ruleId: rule.id,
        technicalDescription:
          "CouponMiddleware.validate() checks OrderRepository.findByOrderNumber() returns a non-null ActiveOrder; if null throws CouponUnavailableException.",
        changeNote: "Added null-check path detail as requested",
        addressesFeedbackIds: [feedbackId],
      },
      workspaceId,
      db as never
    );
    expect(refined.status).toBe("in_review");
    expect(refined.currentVersion).toBe(2);

    const full = await getRule({ id: rule.id }, workspaceId, db as never);
    expect(full.unitVersions).toHaveLength(2);
    expect(full.feedback[0].status).toBe("resolved");
  });

  it("reject without comment throws COMMENT_REQUIRED", async () => {
    const { rule } = await submitCandidate(candidateBase, workspaceId, db as never);
    await expect(
      submitVerdict({ ruleId: rule.id, verdict: "rejected", reviewerName: "Carol" }, workspaceId, db as never)
    ).rejects.toThrow(LoopError);
  });

  it("verdict on non-in_review rule throws INVALID_STATUS", async () => {
    const { rule } = await submitCandidate(candidateBase, workspaceId, db as never);
    await submitVerdict(
      { ruleId: rule.id, verdict: "approved", reviewerName: "Dave" },
      workspaceId,
      db as never
    );
    await expect(
      submitVerdict(
        { ruleId: rule.id, verdict: "approved", reviewerName: "Eve" },
        workspaceId,
        db as never
      )
    ).rejects.toThrow(LoopError);
  });
});

// ── US1: capture architecture with confidence-aware surfacing ──────────────────
describe("Architecture — hybrid surfacing (US1)", () => {
  it("architecture + high confidence → published (auto-surfaced)", async () => {
    const { status, unit } = await submitArchitectureUnit(
      { ...archBase, ruleKey: rk("checkout-high"), title: "Checkout High" },
      workspaceId,
      db as never
    );
    expect(status).toBe("published");
    expect(unit.kind).toBe("architecture");
  });

  it("architecture + medium/low confidence → in_review", async () => {
    const med = await submitArchitectureUnit(
      { ...archBase, ruleKey: rk("checkout-med"), title: "Checkout Med", confidence: "medium" },
      workspaceId,
      db as never
    );
    expect(med.status).toBe("in_review");
    const low = await submitArchitectureUnit(
      { ...archBase, ruleKey: rk("checkout-low"), title: "Checkout Low", confidence: "low" },
      workspaceId,
      db as never
    );
    expect(low.status).toBe("in_review");
  });

  it("business_rule + high confidence → still in_review (no auto-surfacing)", async () => {
    const { rule } = await submitCandidate(candidateBase, workspaceId, db as never);
    expect(rule.status).toBe("in_review");
  });

  it("resubmit architecture by ruleKey → new version, no duplicate", async () => {
    const first = await submitArchitectureUnit(
      { ...archBase, ruleKey: rk("checkout-v"), title: "Checkout V1" },
      workspaceId,
      db as never
    );
    expect(first.version).toBe(1);
    const second = await submitArchitectureUnit(
      { ...archBase, ruleKey: rk("checkout-v"), title: "Checkout V2", confidence: "medium" },
      workspaceId,
      db as never
    );
    expect(second.merged).toBe(true);
    expect(second.version).toBe(2);
    expect(second.unit.id).toBe(first.unit.id);
    expect(second.status).toBe("in_review"); // recomputed from new (medium) confidence
  });
});

// ── US2: human review keeps the catalog trustworthy ────────────────────────────
describe("Architecture — human review (US2)", () => {
  it("published → approved only via explicit human verdict", async () => {
    const { unit, status } = await submitArchitectureUnit(
      { ...archBase, ruleKey: rk("ratify"), title: "Ratify Me" },
      workspaceId,
      db as never
    );
    expect(status).toBe("published");
    const approved = await submitVerdict(
      { ruleId: unit.id, verdict: "approved", reviewerName: "Ana" },
      workspaceId,
      db as never
    );
    expect(approved.status).toBe("approved");
  });

  it("published → rejected with comment; reject without comment refused", async () => {
    const { unit } = await submitArchitectureUnit(
      { ...archBase, ruleKey: rk("reject"), title: "Reject Me" },
      workspaceId,
      db as never
    );
    await expect(
      submitVerdict({ ruleId: unit.id, verdict: "rejected", reviewerName: "Ana" }, workspaceId, db as never)
    ).rejects.toThrow(LoopError); // COMMENT_REQUIRED

    const rejected = await submitVerdict(
      { ruleId: unit.id, verdict: "rejected", comment: "Wrong repository names.", reviewerName: "Ana" },
      workspaceId,
      db as never
    );
    expect(rejected.status).toBe("rejected");
  });

  it("human-verdict precedence: resubmit after a human verdict does NOT auto-publish", async () => {
    const { unit } = await submitArchitectureUnit(
      { ...archBase, ruleKey: rk("precedence"), title: "Precedence" },
      workspaceId,
      db as never
    );
    await submitVerdict({ ruleId: unit.id, verdict: "approved", reviewerName: "Ana" }, workspaceId, db as never);
    const resub = await submitArchitectureUnit(
      { ...archBase, ruleKey: rk("precedence"), title: "Precedence v2" },
      workspaceId,
      db as never
    );
    expect(resub.status).toBe("in_review");
  });

  it("reject architecture → refine → new version, in_review, feedback resolved", async () => {
    const { unit } = await submitArchitectureUnit(
      { ...archBase, ruleKey: rk("refine"), title: "Refine", confidence: "low" },
      workspaceId,
      db as never
    );
    await submitVerdict(
      { ruleId: unit.id, verdict: "rejected", comment: "Overview is too generic.", reviewerName: "Ana" },
      workspaceId,
      db as never
    );
    const pending = await listPendingFeedback({}, workspaceId, db as never);
    const found = pending.find((r) => r.id === unit.id);
    expect(found).toBeDefined();
    const refined = await submitRefinement(
      { ruleId: unit.id, changeNote: "Sharpened overview.", addressesFeedbackIds: [found!.feedback[0].id] },
      workspaceId,
      db as never
    );
    expect(refined.status).toBe("in_review");
    expect(refined.currentVersion).toBe(2);
    const full = await getRule({ id: unit.id }, workspaceId, db as never);
    expect(full.feedback[0].status).toBe("resolved");
  });
});

// ── US3: organize & retrieve per project / hierarchy ───────────────────────────
describe("Architecture — projects & hierarchy (US3)", () => {
  it("cross-project isolation: same feature name stays distinct", async () => {
    await submitArchitectureUnit(
      { ...archBase, projectKey: PA, ruleKey: rk("a:checkout"), title: "Checkout (A)" },
      workspaceId,
      db as never
    );
    await submitArchitectureUnit(
      { ...archBase, projectKey: PB, ruleKey: rk("b:checkout"), title: "Checkout (B)" },
      workspaceId,
      db as never
    );
    const a = await searchCatalog({ projectKey: PA, kind: "architecture" }, workspaceId, db as never);
    const b = await searchCatalog({ projectKey: PB, kind: "architecture" }, workspaceId, db as never);
    expect(a.every((r) => r.title !== "Checkout (B)")).toBe(true);
    expect(b.every((r) => r.title !== "Checkout (A)")).toBe(true);
    expect(a.some((r) => r.title === "Checkout (A)")).toBe(true);
  });

  it("round conflict detection is scoped per project", async () => {
    await createRound(
      { projectKey: PA, sourceLabel: "A", sourceKind: "gitnexus", toolsDetected: [], scope: { flows: ["Checkout"] } },
      workspaceId,
      db as never
    );
    // Same flow, DIFFERENT project → must NOT conflict.
    const { conflicts } = await createRound(
      { projectKey: PB, sourceLabel: "B", sourceKind: "gitnexus", toolsDetected: [], scope: { flows: ["Checkout"] } },
      workspaceId,
      db as never
    );
    expect(conflicts).toHaveLength(0);
  });

  it("business rule without projectKey lands in the default project (migration preserved)", async () => {
    const def = await getProjectByKey("default", workspaceId, db as never);
    const { rule } = await submitCandidate(candidateBase, workspaceId, db as never);
    expect(rule.projectId).toBe(def.id);
  });

  it("hierarchy: feature exposes layer children; child references its parent", async () => {
    const feature = await submitArchitectureUnit(
      { ...archBase, projectKey: PA, ruleKey: rk("a:returns"), title: "Returns" },
      workspaceId,
      db as never
    );
    const layer = await submitArchitectureUnit(
      {
        ...archBase,
        projectKey: PA,
        ruleKey: rk("a:returns:data"),
        title: "Returns · data",
        unitType: "layer",
        parentId: feature.unit.id,
        content: archContent({ layer: "data" }),
      },
      workspaceId,
      db as never
    );
    const full = await getRule({ id: feature.unit.id }, workspaceId, db as never);
    expect(full.children.some((c) => c.id === layer.unit.id)).toBe(true);
    const childFull = await getRule({ id: layer.unit.id }, workspaceId, db as never);
    expect(childFull.parent?.id).toBe(feature.unit.id);
  });

  it("layer without parentId is rejected (service-layer invariant)", async () => {
    await expect(
      submitArchitectureUnit(
        { ...archBase, projectKey: PA, ruleKey: rk("a:orphan"), title: "Orphan", unitType: "layer", parentId: undefined },
        workspaceId,
        db as never
      )
    ).rejects.toThrow(LoopError);
  });
});

// ── US4: staleness detection ───────────────────────────────────────────────────
describe("Architecture — staleness (US4)", () => {
  it("flags units whose indexCommit differs from the reference", async () => {
    const key = rk("stale");
    await submitArchitectureUnit(
      {
        ...archBase,
        projectKey: AP,
        ruleKey: key,
        title: "Stale Unit",
        content: archContent({ provenance: { indexCommit: "old-sha", generatedAt: "2026-01-01T00:00:00Z" } }),
      },
      workspaceId,
      db as never
    );
    const { stale } = await listStaleUnits({ projectKey: AP, ref: "new-sha" }, workspaceId, db as never);
    expect(stale.some((u) => u.unitKey === key)).toBe(true);

    const fresh = await listStaleUnits({ projectKey: AP, ref: "old-sha" }, workspaceId, db as never);
    expect(fresh.stale.some((u) => u.unitKey === key)).toBe(false);
  });
});

// ── S5·C: getRule exposes externalLinks ────────────────────────────────────────
describe("getRule — externalLinks (S5·C)", () => {
  it("attaches external links inserted via unitLinkRepo", async () => {
    const { rule } = await submitCandidate(
      { ...candidateBase, ruleKey: `ext-link-${RUN}`, title: "External link test" },
      workspaceId,
      db as never
    );
    await unitLinkRepo.insertLink(
      { unitId: rule.id, system: "jira", externalKey: "DOC-1", url: "https://jira.example.com/browse/DOC-1" },
      db as never
    );
    const full = await getRule({ id: rule.id }, workspaceId, db as never);
    expect(full.externalLinks).toHaveLength(1);
    expect(full.externalLinks[0].system).toBe("jira");
    expect(full.externalLinks[0].externalKey).toBe("DOC-1");
    expect(full.externalLinks[0].url).toBe("https://jira.example.com/browse/DOC-1");
  });

  it("returns empty externalLinks when no links exist", async () => {
    const { rule } = await submitCandidate(
      { ...candidateBase, ruleKey: `no-ext-link-${RUN}`, title: "No external links" },
      workspaceId,
      db as never
    );
    const full = await getRule({ id: rule.id }, workspaceId, db as never);
    expect(full.externalLinks).toEqual([]);
  });
});
