/**
 * Migration 0008 test — verifies that business-rule flat columns are folded into
 * typed `content` jsonb. After the migration:
 * - submitCandidate still accepts flat productDescription/technicalDescription (input unchanged)
 * - getRule returns them nested under content.productDescription / content.technicalDescription
 * - the flat columns no longer exist on the returned type
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../db/schema.js";
import * as relations from "../db/relations.js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { BusinessRuleContent } from "../db/schema.js";
import {
  registerProject,
  submitCandidate,
  getRule,
  submitVerdict,
  submitRefinement,
} from "./loop.js";
import * as workspaceRepo from "../repos/workspaceRepo.js";

const TEST_DB_URL =
  process.env.DATABASE_URL ?? "postgres://lore:lore@localhost:5432/lore";

const RUN = Date.now().toString(36) + "m8";
const PROJ_KEY = `m8-proj-${RUN}`;

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;
let workspaceId: string;

beforeAll(async () => {
  client = postgres(TEST_DB_URL);
  db = drizzle(client, { schema: { ...schema, ...relations } }) as never;
  // Runs all migrations including 0008_fold_content
  await migrate(db as never, { migrationsFolder: "./migrations" });
  const ws = await workspaceRepo.findByKey("default", db as never);
  if (!ws) throw new Error("Default workspace not found");
  workspaceId = ws.id;
  await registerProject(
    { key: PROJ_KEY, name: "Migration 0008 Test", platform: "backend" },
    workspaceId,
    db as never
  );
});

afterAll(async () => {
  await client.end();
});

describe("migration 0008 — content fold", () => {
  it("submitCandidate with flat input → getRule returns content.productDescription", async () => {
    const productDescription =
      "A customer can only apply a coupon if they have an active order with a valid order number.";
    const technicalDescription =
      "CouponMiddleware.validate() checks OrderRepository.findByOrderNumber() returns non-null.";

    // Input stays flat (SubmitCandidateSchema unchanged)
    const { rule } = await submitCandidate(
      {
        projectKey: PROJ_KEY,
        title: "Coupon apply requires valid order",
        flow: "Checkout",
        productDescription,
        technicalDescription,
        confidence: "high",
        sources: [],
        openQuestions: [],
        entityLinks: [],
      },
      workspaceId,
      db as never
    );

    expect(rule.status).toBe("in_review");

    // getRule returns the full row — content should carry the business-rule payload
    const full = await getRule({ id: rule.id }, workspaceId, db as never);
    const content = full.content as BusinessRuleContent;

    expect(content).toBeDefined();
    expect(content.productDescription).toBe(productDescription);
    expect(content.technicalDescription).toBe(technicalDescription);

    // Flat columns no longer exist on the type — verify via type narrowing
    // (TypeScript would catch references at compile time; here we confirm at runtime)
    expect((full as any).productDescription).toBeUndefined();
    expect((full as any).technicalDescription).toBeUndefined();
    expect((full as any).decisionLogic).toBeUndefined();
    expect((full as any).openQuestions).toBeUndefined();
  });

  it("refinement preserves content.technicalDescription update", async () => {
    const { rule } = await submitCandidate(
      {
        projectKey: PROJ_KEY,
        title: "Checkout window closes before order expiry",
        flow: "Checkout",
        productDescription:
          "The online checkout window closes 45 minutes before the scheduled order expiry time.",
        technicalDescription:
          "CheckoutService.isWindowOpen() checks expiryTime minus 45 minutes is before now.",
        confidence: "medium",
        sources: [],
        openQuestions: [],
        entityLinks: [],
      },
      workspaceId,
      db as never
    );

    // Reject first so refinement is allowed
    await submitVerdict(
      {
        ruleId: rule.id,
        verdict: "rejected",
        comment: "Technical description is unclear.",
        reviewerName: "Alice",
      },
      workspaceId,
      db as never
    );

    const newTechDesc =
      "CheckoutService.isWindowOpen() checks now < (expiryTime - Duration.ofMinutes(45)).";

    const refined = await submitRefinement(
      {
        ruleId: rule.id,
        technicalDescription: newTechDesc,
        changeNote: "Clarified time comparison",
        addressesFeedbackIds: [],
      },
      workspaceId,
      db as never
    );

    expect(refined.status).toBe("in_review");
    expect(refined.currentVersion).toBe(2);

    const content = refined.content as BusinessRuleContent;
    expect(content.technicalDescription).toBe(newTechDesc);
    // productDescription should be preserved from original
    expect(content.productDescription).toContain("online checkout window");
  });
});
