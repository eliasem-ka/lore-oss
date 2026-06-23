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
let workspaceAId: string;
let workspaceBId: string;

const TEST_EMAIL = `ws-ctx-${Date.now()}@example.com`;
const TEST_PASSWORD = "ws-ctx-P@ss";

beforeAll(async () => {
  // Seed user U
  const passwordHash = await hashPassword(TEST_PASSWORD);
  const user = await userRepo.upsertUser(
    { email: TEST_EMAIL, name: "WS Ctx Tester", role: "reviewer", passwordHash },
    db
  );

  // Seed workspace A and B; U is member of A only
  const wsA = await workspaceRepo.upsertWorkspace({ key: `ws-a-${Date.now()}`, name: "Workspace A" }, db);
  const wsB = await workspaceRepo.upsertWorkspace({ key: `ws-b-${Date.now()}`, name: "Workspace B" }, db);
  workspaceAId = wsA.id;
  workspaceBId = wsB.id;

  await workspaceRepo.addMember(workspaceAId, user.id, db);
  // U is NOT added to wsB

  const app = express();
  app.use(express.json());
  app.use("/api", buildApiRouter(ALL_CAPABILITIES, { bus: createEventBus() }));
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  // Login to get token
  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });
  const loginBody = await loginRes.json() as { token: string };
  token = loginBody.token;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe("workspace context resolution", () => {
  it("GET /api/workspaces → returns only workspace A (the one U belongs to)", async () => {
    const res = await fetch(`${base}/api/workspaces`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { id: string }[];
    expect(Array.isArray(body)).toBe(true);
    const ids = body.map((w) => w.id);
    expect(ids).toContain(workspaceAId);
    expect(ids).not.toContain(workspaceBId);
  });

  it("request with X-Workspace-Id: <B> → 403 (not a member)", async () => {
    const res = await fetch(`${base}/api/workspaces`, {
      headers: {
        authorization: `Bearer ${token}`,
        "x-workspace-id": workspaceBId,
      },
    });
    expect(res.status).toBe(403);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Not a member of workspace");
  });

  it("request with X-Workspace-Id: <A> → 200 (is a member)", async () => {
    const res = await fetch(`${base}/api/workspaces`, {
      headers: {
        authorization: `Bearer ${token}`,
        "x-workspace-id": workspaceAId,
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { id: string }[];
    expect(Array.isArray(body)).toBe(true);
  });

  it("no X-Workspace-Id header → defaults to workspace A (first membership)", async () => {
    // Without header, workspaceId defaults to listForUser[0].id = wsA (only workspace)
    // We verify the allow path: /api/workspaces returns successfully with A only
    const res = await fetch(`${base}/api/workspaces`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { id: string }[];
    const ids = body.map((w) => w.id);
    expect(ids).toContain(workspaceAId);
  });

  it("non-member with a valid workspace ID that exists → 403 (never silently granted)", async () => {
    const res = await fetch(`${base}/api/auth/me`, {
      headers: {
        authorization: `Bearer ${token}`,
        "x-workspace-id": workspaceBId,
      },
    });
    expect(res.status).toBe(403);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Not a member of workspace");
  });
});
