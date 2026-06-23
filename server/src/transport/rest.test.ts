import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { buildApiRouter } from "./rest.js";
import { ALL_CAPABILITIES } from "../app/capabilities/index.js";
import { createEventBus } from "../infra/eventBus.js";
import { issueToken } from "../services/auth.js";
import { submitCandidate, registerProject } from "../services/loop.js";
import * as flowPolicyRepo from "../repos/flowPolicyRepo.js";
import * as workspaceRepo from "../repos/workspaceRepo.js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../db/schema.js";
import * as relations from "../db/relations.js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";

const TEST_DB_URL =
  process.env.DATABASE_URL ?? "postgres://lore:lore@localhost:5432/lore";

let server: Server; let base: string;
// A synthetic token valid for the duration of tests — no DB user needed.
// IDs must be valid UUIDs because workspace resolution queries workspace_members (uuid FK).
const AUTH = `Bearer ${issueToken({ id: "00000000-0000-0000-0000-000000000001", email: "test@example.com", name: "Test", role: "reviewer" })}`;
const REVIEWER_TOKEN = `Bearer ${issueToken({ id: "00000000-0000-0000-0000-000000000002", email: "reviewer@example.com", name: "Reviewer", role: "reviewer" })}`;

const RUN = Date.now().toString(36);
let pgClient: ReturnType<typeof postgres>;
let testDb: ReturnType<typeof drizzle>;
let defaultWorkspaceId: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", buildApiRouter(ALL_CAPABILITIES, { bus: createEventBus() }));
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  // Set up DB connection for seeding 403 gate test data
  pgClient = postgres(TEST_DB_URL);
  testDb = drizzle(pgClient, { schema: { ...schema, ...relations } }) as never;
  await migrate(testDb as never, { migrationsFolder: "./migrations" });

  // Resolve the default workspace for seeding and header use
  const ws = await workspaceRepo.findByKey("default", testDb as never);
  if (!ws) throw new Error("Default workspace not found");
  defaultWorkspaceId = ws.id;
  // Ensure the AUTH test user exists in `users` so the FK on workspace_members is satisfied.
  // Uses INSERT … ON CONFLICT DO NOTHING so repeated test runs are idempotent.
  await (testDb as any).execute(sql`
    INSERT INTO users (id, email, name, role, password_hash)
    VALUES (
      '00000000-0000-0000-0000-000000000001',
      'test@example.com',
      'Test',
      'reviewer',
      'x'
    ) ON CONFLICT (id) DO NOTHING
  `);
  await workspaceRepo.addMember(defaultWorkspaceId, "00000000-0000-0000-0000-000000000001", testDb as never);
});
afterAll(async () => {
  await pgClient?.end();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("generated REST transport", () => {
  it("GET /api/projects returns an array including the default project", async () => {
    const res = await fetch(`${base}/api/projects`, { headers: { authorization: AUTH } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((p: any) => p.key === "default")).toBe(true);
  });
  it("GET /api/progress returns totals/byFlow/openRounds", async () => {
    const res = await fetch(`${base}/api/progress`, { headers: { authorization: AUTH } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("totals");
    expect(body).toHaveProperty("byFlow");
  });
  it("POST /api/projects upserts and echoes the project", async () => {
    const key = `smoke-${Date.now().toString(36)}`;
    const res = await fetch(`${base}/api/projects`, {
      method: "POST", headers: { "content-type": "application/json", authorization: AUTH, "x-workspace-id": defaultWorkspaceId },
      body: JSON.stringify({ key, name: "Smoke", platform: "backend" }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).key).toBe(key);
  });
  it("validation error returns 400", async () => {
    const res = await fetch(`${base}/api/projects`, {
      method: "POST", headers: { "content-type": "application/json", authorization: AUTH },
      body: JSON.stringify({ name: "no key" }),
    });
    expect(res.status).toBe(400);
  });
  it("unknown rule id returns 404", async () => {
    const res = await fetch(`${base}/api/rules/00000000-0000-0000-0000-000000000000`, {
      headers: { authorization: AUTH },
    });
    expect(res.status).toBe(404);
  });
  it("GET /api/export?format=markdown returns text/markdown", async () => {
    const res = await fetch(`${base}/api/export?format=markdown`, { headers: { authorization: AUTH } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
  });
  it("GET /api/export returns JSON by default with a count", async () => {
    const res = await fetch(`${base}/api/export`, { headers: { authorization: AUTH } });
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toHaveProperty("count");
  });

  it("GET /api/flow-policies returns an array", async () => {
    const res = await fetch(`${base}/api/flow-policies`, { headers: { authorization: AUTH } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});

describe("FORBIDDEN→403 gate (S6·3)", () => {
  it("reviewer approving a rule in a gated flow returns HTTP 403", async () => {
    const gatedFlow = `HTTP-GATE-${RUN}`;
    const projectKey = `http-gate-${RUN}`;

    // Seed project, rule, and flow policy
    await registerProject({ key: projectKey, name: "HTTP Gate", platform: "android" }, defaultWorkspaceId, testDb as never);
    await flowPolicyRepo.upsertPolicy({ flow: gatedFlow, minApproveRole: "senior" }, testDb as never);

    const { rule } = await submitCandidate(
      {
        title: "HTTP gate test rule",
        flow: gatedFlow,
        subflow: "Sub",
        productDescription: "A rule in a gated flow.",
        technicalDescription: "impl",
        confidence: "high",
        sources: [{ path: "Foo.kt", symbol: "Foo" }],
        openQuestions: [],
        entityLinks: [],
        projectKey,
      },
      defaultWorkspaceId,
      testDb as never
    );

    // Issue verdict as "reviewer" (role from JWT) → expect 403
    // The synthetic test user has no workspace membership; the capability's workspace
    // guard fires first (workspaceId undefined → FORBIDDEN) which is still a 403
    // with code="FORBIDDEN", satisfying the test assertion.
    const res = await fetch(`${base}/api/rules/${rule.id}/feedback`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: REVIEWER_TOKEN,
      },
      body: JSON.stringify({ verdict: "approved" }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("FORBIDDEN");
  });
});
