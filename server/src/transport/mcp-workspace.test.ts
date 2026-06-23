import { describe, it, expect, beforeAll } from "vitest";
import { resolveMcpWorkspaceId } from "./mcp.js";
import * as workspaceRepo from "../repos/workspaceRepo.js";
import { db } from "../db/index.js";

// MCP workspace SELECTION (not authorization): the shared MCP_API_KEY is the trust
// boundary, so there is no membership check. We verify precedence:
//   header id > MCP_WORKSPACE key > "default".
let defaultId: string;
let workspaceB: workspaceRepo.Workspace;

beforeAll(async () => {
  // The "default" workspace is seeded by migration 0012; ensure it exists (idempotent).
  const def = await workspaceRepo.upsertWorkspace({ key: "default", name: "Default" }, db);
  defaultId = def.id;

  workspaceB = await workspaceRepo.upsertWorkspace(
    { key: `mcp-ws-b-${Date.now()}`, name: "Workspace B" },
    db
  );
});

describe("resolveMcpWorkspaceId", () => {
  it("no header, no env → resolves to the default workspace id", async () => {
    const resolved = await resolveMcpWorkspaceId(undefined, undefined, db);
    expect(resolved).toBe(defaultId);
  });

  it("X-Workspace-Id header (B's id) → resolves to B", async () => {
    const resolved = await resolveMcpWorkspaceId(workspaceB.id, undefined, db);
    expect(resolved).toBe(workspaceB.id);
  });

  it("MCP_WORKSPACE env (B's key), no header → resolves to B", async () => {
    const resolved = await resolveMcpWorkspaceId(undefined, workspaceB.key, db);
    expect(resolved).toBe(workspaceB.id);
  });

  it("header id wins over env key", async () => {
    const resolved = await resolveMcpWorkspaceId(workspaceB.id, "default", db);
    expect(resolved).toBe(workspaceB.id);
  });

  it("unknown header id falls through to env key", async () => {
    const resolved = await resolveMcpWorkspaceId(
      "00000000-0000-0000-0000-000000000000",
      workspaceB.key,
      db
    );
    expect(resolved).toBe(workspaceB.id);
  });

  it("unknown header and no env → falls through to default", async () => {
    const resolved = await resolveMcpWorkspaceId(
      "00000000-0000-0000-0000-000000000000",
      undefined,
      db
    );
    expect(resolved).toBe(defaultId);
  });
});
