import { z } from "zod";
import { defineCapability, type Capability } from "../registry.js";
import { registerProject, listProjects, listStaleUnits, LoopError } from "../../services/loop.js";
import { RegisterProjectSchema } from "../../schemas/project.js";
import { ListStaleUnitsSchema } from "../../schemas/architecture.js";

export const projectCapabilities: Capability<any, any>[] = [
  defineCapability({
    name: "registerProject",
    input: RegisterProjectSchema,
    handler: (input, ctx) => {
      if (!ctx.workspaceId) throw new LoopError("No active workspace", "FORBIDDEN");
      return registerProject(input, ctx.workspaceId);
    },
    rest: { method: "post", path: "/projects" },
    mcp: {
      tool: "register_project",
      description: "Create or update a project (the top-level grouping for all knowledge). Upserts by key — safe to call repeatedly. Required before starting a round or submitting units for that project.",
      shape: RegisterProjectSchema.shape,
      render: (p: any) =>
        `✓ Project registered: ${p.key}\n  name: ${p.name}\n  platform: ${p.platform}${p.defaultRef ? `\n  defaultRef: ${p.defaultRef}` : ""}`,
    },
  }),
  defineCapability({
    name: "listProjects",
    input: z.object({}),
    handler: (_input, ctx) => {
      if (!ctx.workspaceId) throw new LoopError("No active workspace", "FORBIDDEN");
      return listProjects(ctx.workspaceId);
    },
    rest: { method: "get", path: "/projects" },
    mcp: {
      tool: "list_projects",
      description: "List all registered projects.",
      shape: {},
      render: (list: any[]) =>
        !list.length
          ? "No projects registered yet. Use register_project."
          : list.map((p) => `  ${p.key}  [${p.platform}]  ${p.name}`).join("\n"),
    },
  }),
  defineCapability({
    name: "listStaleUnits",
    input: ListStaleUnitsSchema,
    handler: (input, ctx) => {
      if (!ctx.workspaceId) throw new LoopError("No active workspace", "FORBIDDEN");
      return listStaleUnits(input, ctx.workspaceId);
    },
    rest: {
      method: "get",
      path: "/projects/:key/stale",
      input: (req) => ({ projectKey: req.params.key, ref: typeof req.query.ref === "string" ? req.query.ref : undefined }),
    },
    mcp: {
      tool: "list_stale_units",
      description: "List architecture units whose recorded source revision (provenance.indexCommit) differs from a reference revision (defaults to the project's defaultRef) — candidates for re-extraction.",
      shape: ListStaleUnitsSchema.shape,
      render: (out: any) => {
        if (!out.stale.length) return `No stale units (reference: ${out.reference ?? "none"}).`;
        const lines = [`Reference revision: ${out.reference ?? "none"}`, `Stale units (${out.stale.length}):`];
        for (const u of out.stale) {
          const commit = (u.content?.provenance?.indexCommit) ?? "?";
          lines.push(`  - "${u.title}" [${u.unitKey ?? u.id}] @ ${commit}`);
        }
        return lines.join("\n");
      },
    },
  }),
];
