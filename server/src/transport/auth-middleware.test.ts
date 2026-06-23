import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { buildApiRouter } from "./rest.js";
import { ALL_CAPABILITIES } from "../app/capabilities/index.js";
import { createEventBus } from "../infra/eventBus.js";
import { hashPassword } from "../services/auth.js";
import * as userRepo from "../repos/userRepo.js";
import * as workspaceRepo from "../repos/workspaceRepo.js";
import { db } from "../db/index.js";

let server: Server;
let base: string;
let token: string;

const TEST_EMAIL = `auth-test-${Date.now()}@example.com`;
const TEST_PASSWORD = "s3cr3tP@ss";

beforeAll(async () => {
  // Seed a user for auth tests
  const passwordHash = await hashPassword(TEST_PASSWORD);
  const user = await userRepo.upsertUser({ email: TEST_EMAIL, name: "Auth Tester", role: "reviewer", passwordHash }, db);
  // Membership in the default workspace → the transport resolves an active
  // workspaceId for this user, so workspace-scoped reads (GET /api/projects) work.
  const ws = await workspaceRepo.findByKey("default", db);
  if (!ws) throw new Error("Default workspace not found — run migrations first");
  await workspaceRepo.addMember(ws.id, user.id, db);

  const app = express();
  app.use(express.json());
  app.use("/api", buildApiRouter(ALL_CAPABILITIES, { bus: createEventBus() }));
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe("auth middleware", () => {
  it("POST /api/auth/login with correct creds → 200 + token", async () => {
    const res = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("token");
    expect(body).toHaveProperty("user");
    expect(body.user.email).toBe(TEST_EMAIL);
    token = body.token;
  });

  it("POST /api/auth/login with wrong password → 401", async () => {
    const res = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: TEST_EMAIL, password: "wrongpassword" }),
    });
    expect(res.status).toBe(401);
  });

  it("POST /api/auth/login works with NO auth token (public route)", async () => {
    const res = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });
    expect(res.status).toBe(200);
  });

  it("GET /api/projects with no token → 401", async () => {
    const res = await fetch(`${base}/api/projects`);
    expect(res.status).toBe(401);
  });

  it("GET /api/projects with bad Bearer token → 401", async () => {
    const res = await fetch(`${base}/api/projects`, {
      headers: { authorization: "Bearer thisisnotavalidtoken" },
    });
    expect(res.status).toBe(401);
  });

  it("GET /api/projects with valid token → 200", async () => {
    const res = await fetch(`${base}/api/projects`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  it("GET /api/auth/me with valid token → returns user", async () => {
    const res = await fetch(`${base}/api/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.email).toBe(TEST_EMAIL);
  });

  it("GET /api/auth/me with no token → 401", async () => {
    const res = await fetch(`${base}/api/auth/me`);
    expect(res.status).toBe(401);
  });
});
