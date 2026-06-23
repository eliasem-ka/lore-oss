/**
 * DB-backed integration tests for `ingestUnit`.
 *
 * Covers (per brief Step 4):
 * - business_rule insert → status in_review, search_text populated
 * - architecture high-confidence insert → status published
 * - architecture medium-confidence insert → status in_review
 * - architecture high-confidence + prior verdict → status in_review
 * - rule_key resubmit → version bump, no duplicate row
 * - architecture `layer` without parentId → throws PARENT_REQUIRED (via submitArchitectureUnit)
 *
 * The 18 loop.test.ts tests remain the oracle; this file adds coverage
 * specifically for the ingestUnit seam.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../db/schema.js";
import * as relations from "../db/relations.js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { ingestUnit } from "./ingestUnit.js";
import {
  registerProject,
  getProjectByKey,
  submitVerdict,
  submitArchitectureUnit,
  LoopError,
} from "./loop.js";
import * as unitRepo from "../repos/knowledgeUnitRepo.js";
import * as workspaceRepo from "../repos/workspaceRepo.js";

const TEST_DB_URL =
  process.env.DATABASE_URL ?? "postgres://lore:lore@localhost:5432/lore";

const RUN = Date.now().toString(36) + "iu";
const PROJ_KEY = `iu-proj-${RUN}`;
const rk = (s: string) => `iu:${s}:${RUN}`;

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;
let projectId: string;
let workspaceId: string;

beforeAll(async () => {
  client = postgres(TEST_DB_URL);
  db = drizzle(client, { schema: { ...schema, ...relations } }) as never;
  await migrate(db as never, { migrationsFolder: "./migrations" });
  // Resolve the default workspace (seeded by migration 0012)
  const ws = await workspaceRepo.findByKey("default", db as never);
  if (!ws) throw new Error("Default workspace not found — run migrations first");
  workspaceId = ws.id;
  await registerProject({ key: PROJ_KEY, name: "IngestUnit Test Project", platform: "backend" }, workspaceId, db as never);
  const proj = await getProjectByKey(PROJ_KEY, workspaceId, db as never);
  projectId = proj.id;
});

afterAll(async () => {
  await client.end();
});

const archContent = () => ({
  overview: "The Checkout feature orchestrates the order checkout funnel.",
  techStack: { endpoints: [], libraries: ["Hilt"], persistence: ["Room"] },
  entryPoints: ["CheckoutScreen"],
  patterns: ["MVI"],
  dependencies: [],
  diagrams: [],
  provenance: { indexCommit: "abc123", generatedAt: "2026-06-01T00:00:00Z" },
});

describe("ingestUnit", () => {
  // ── business_rule ───────────────────────────────────────────────────────────

  it("business_rule insert → status in_review, search_text populated", async () => {
    const result = await ingestUnit(
      {
        projectId,
        workspaceId,
        kind: "business_rule",
        title: "Coupon apply requires valid order",
        confidence: "high",
        flow: "Checkout",
        subflow: "Coupon Apply",
        productDescription: "A customer can only apply a coupon if they have an active order.",
        technicalDescription: "CouponMiddleware.validate() checks OrderRepository.findByOrderNumber().",
        sources: [],
        entityLinks: [],
      },
      [],
      db as never
    );

    expect(result.unit.status).toBe("in_review");
    expect(result.merged).toBe(false);
    expect(result.version).toBe(1);
    // search_text should include the title and descriptions
    expect(result.unit.searchText).toBeTruthy();
    expect(result.unit.searchText).toContain("Coupon apply requires valid order");
  });

  // ── architecture: high confidence → published ───────────────────────────────

  it("architecture high-confidence insert → status published", async () => {
    const result = await ingestUnit(
      {
        projectId,
        workspaceId,
        kind: "architecture",
        title: "Checkout Feature",
        confidence: "high",
        unitType: "feature",
        content: archContent(),
        sources: [],
        entityLinks: [],
      },
      [],
      db as never
    );

    expect(result.unit.status).toBe("published");
    expect(result.merged).toBe(false);
    expect(result.version).toBe(1);
    expect(result.unit.searchText).toBeTruthy();
    expect(result.unit.searchText).toContain("Checkout Feature");
  });

  // ── architecture: medium confidence → in_review ─────────────────────────────

  it("architecture medium-confidence insert → status in_review", async () => {
    const result = await ingestUnit(
      {
        projectId,
        workspaceId,
        kind: "architecture",
        title: "Payment Feature",
        confidence: "medium",
        unitType: "feature",
        content: archContent(),
        sources: [],
        entityLinks: [],
      },
      [],
      db as never
    );

    expect(result.unit.status).toBe("in_review");
    expect(result.merged).toBe(false);
    expect(result.version).toBe(1);
  });

  // ── architecture: high + prior verdict → in_review ──────────────────────────

  it("architecture high-confidence + prior verdict → status in_review on version bump", async () => {
    const key = rk("arch-with-verdict");

    // First insert at high confidence → published
    const first = await ingestUnit(
      {
        projectId,
        workspaceId,
        kind: "architecture",
        ruleKey: key,
        title: "Auth Feature",
        confidence: "high",
        unitType: "feature",
        content: archContent(),
        sources: [],
        entityLinks: [],
      },
      [],
      db as never
    );
    expect(first.unit.status).toBe("published");

    // Submit a verdict so there's prior feedback
    await submitVerdict(
      { ruleId: first.unit.id, verdict: "approved", reviewerName: "alice", reviewerRole: "architect" },
      workspaceId,
      db as never
    );

    // Re-submit via ingestUnit (same ruleKey) — should detect prior feedback → in_review
    const second = await ingestUnit(
      {
        projectId,
        workspaceId,
        kind: "architecture",
        ruleKey: key,
        title: "Auth Feature v2",
        confidence: "high",
        unitType: "feature",
        content: archContent(),
        sources: [],
        entityLinks: [],
      },
      [],
      db as never
    );

    expect(second.merged).toBe(true);
    expect(second.version).toBe(2);
    expect(second.unit.status).toBe("in_review");
  });

  // ── rule_key dedup → version bump, no duplicate row ─────────────────────────

  it("rule_key resubmit bumps version — no duplicate row inserted", async () => {
    const key = rk("dedup-test");

    // First insert
    const first = await ingestUnit(
      {
        projectId,
        workspaceId,
        kind: "business_rule",
        ruleKey: key,
        title: "Dedup Rule v1",
        confidence: "medium",
        flow: "Returns",
        productDescription: "Customers must present their order confirmation at checkout.",
        technicalDescription: "CheckoutService.validate() validates the QR code.",
        sources: [],
        entityLinks: [],
      },
      [],
      db as never
    );
    expect(first.merged).toBe(false);
    expect(first.version).toBe(1);

    // Re-submit with same ruleKey
    const second = await ingestUnit(
      {
        projectId,
        workspaceId,
        kind: "business_rule",
        ruleKey: key,
        title: "Dedup Rule v2",
        confidence: "medium",
        flow: "Returns",
        productDescription: "Customers must present their order confirmation (updated) at checkout.",
        technicalDescription: "CheckoutService.validate() validates the QR code strictly.",
        sources: [],
        entityLinks: [],
      },
      [],
      db as never
    );
    expect(second.merged).toBe(true);
    expect(second.version).toBe(2);
    // Same underlying row id — no duplicate
    expect(second.unit.id).toBe(first.unit.id);

    // Confirm only one row exists for this ruleKey
    const row = await unitRepo.findUnitByRuleKey(key, workspaceId, db as never);
    expect(row).toBeDefined();
    expect(row!.currentVersion).toBe(2);
    expect(row!.title).toBe("Dedup Rule v2");
  });

  // ── search_text populated on insert ─────────────────────────────────────────

  it("search_text is populated for both kinds", async () => {
    const br = await ingestUnit(
      {
        projectId,
        workspaceId,
        kind: "business_rule",
        title: "Checkout window closes 45 minutes before order expiry",
        confidence: "low",
        flow: "Checkout",
        productDescription: "The online checkout window closes 45 minutes before the scheduled order expiry.",
        technicalDescription: "CheckoutService.isWindowOpen() checks expiryTime - 45min < now.",
        sources: [],
        entityLinks: [],
      },
      [],
      db as never
    );
    expect(br.unit.searchText).toContain("Checkout window closes 45 minutes before order expiry");
    expect(br.unit.searchText).toContain("online checkout window");

    const arch = await ingestUnit(
      {
        projectId,
        workspaceId,
        kind: "architecture",
        title: "Catalog Feature",
        confidence: "medium",
        unitType: "feature",
        content: {
          ...archContent(),
          overview: "The Catalog feature enables product discovery across all categories.",
        },
        sources: [],
        entityLinks: [],
      },
      [],
      db as never
    );
    expect(arch.unit.searchText).toContain("Catalog Feature");
    expect(arch.unit.searchText).toContain("The Catalog feature enables product discovery");
  });

  // ── architecture layer without parentId → PARENT_REQUIRED ───────────────────

  it("architecture layer without parentId throws PARENT_REQUIRED", async () => {
    // This validation lives in policyFor('architecture').validateHierarchy and is
    // enforced by the submitArchitectureUnit facade (and also by the Zod schema).
    // We test via the facade since that's the public boundary — ingestUnit itself
    // relies on the caller to enforce hierarchy before calling in.
    await expect(
      submitArchitectureUnit(
        {
          projectKey: PROJ_KEY,
          title: "Network Layer",
          unitType: "layer",
          // parentId deliberately omitted
          confidence: "high",
          sources: [],
          content: archContent(),
          entityLinks: [],
        } as never, // cast past Zod's refine (parentId required at schema level)
        workspaceId,
        db as never
      )
    ).rejects.toMatchObject({ code: "PARENT_REQUIRED" });
  });
});
