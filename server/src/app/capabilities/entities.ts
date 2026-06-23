import { z } from "zod";
import { defineCapability, type Capability } from "../registry.js";
import {
  defineEntity,
  listEntities,
  getEntityWithRules,
  updateEntity,
  deleteEntity,
  linkRuleToEntity,
  unlinkRuleFromEntity,
  LoopError,
} from "../../services/loop.js";
import {
  DefineEntitySchema,
  ListEntitiesSchema,
  UpdateEntitySchema,
  LinkRuleEntitySchema,
} from "../../schemas/entity.js";

export const entityCapabilities: Capability<any, any>[] = [
  defineCapability({
    name: "defineEntity",
    input: DefineEntitySchema,
    handler: (input) => defineEntity(input as any),
    rest: { method: "post", path: "/entities" },
    mcp: {
      tool: "define_entity",
      description:
        "Create or update a domain entity (user type, account type, membership, etc.). Upserts by key — safe to call multiple times.",
      shape: DefineEntitySchema.shape,
      render: (entity: any) =>
        `✓ Entity defined: ${entity.key}\n  category: ${entity.category}\n  name: ${entity.name}${entity.description ? `\n  description: ${entity.description}` : ""}`,
    },
  }),

  defineCapability({
    name: "listEntities",
    input: ListEntitiesSchema,
    handler: (input) => listEntities(input as any),
    rest: { method: "get", path: "/entities" },
    mcp: {
      tool: "list_entities",
      description:
        "List all domain entities in the catalog. Optionally filter by category (e.g. 'user_type', 'membership').",
      shape: { category: z.string().optional().describe("Filter by category") },
      render: (list: any[]) => {
        if (!list.length) {
          return "No entities defined yet. Use define_entity to add domain context.";
        }
        const byCategory: Record<string, typeof list> = {};
        for (const e of list) (byCategory[e.category] ??= []).push(e);
        const lines: string[] = [];
        for (const [cat, items] of Object.entries(byCategory).sort()) {
          lines.push(`\n## ${cat}`);
          for (const e of items) lines.push(`  ${e.key}  ${e.name}${e.description ? ` — ${e.description}` : ""}`);
        }
        return lines.join("\n").trim();
      },
    },
  }),

  defineCapability({
    name: "linkRuleToEntity",
    input: LinkRuleEntitySchema,
    handler: async (i: any, ctx) => {
      if (!ctx.workspaceId) throw new LoopError("No active workspace", "FORBIDDEN");
      await linkRuleToEntity(i, ctx.workspaceId);
      return { ok: true };
    },
    rest: { method: "post", path: "/entities/link" },
    mcp: {
      tool: "link_rule_to_entity",
      description:
        "Associate a rule with a domain entity. Use after submit_candidate when the entity_links[] in that call weren't enough.",
      shape: {
        ruleId: z.string().uuid(),
        entityKey: z.string().min(1),
        role: z.enum(["applies_to", "excludes", "requires", "modifies"]).default("applies_to"),
      },
      render: (_out: any, input: any) =>
        `✓ Linked rule ${input.ruleId} → ${input.entityKey} (${input.role})`,
    },
  }),

  defineCapability({
    name: "getEntityWithRules",
    input: z.object({ key: z.string() }),
    handler: ({ key }: any, ctx) => {
      if (!ctx.workspaceId) throw new LoopError("No active workspace", "FORBIDDEN");
      return getEntityWithRules(key, ctx.workspaceId);
    },
    rest: {
      method: "get",
      path: "/entities/:key(*)",
      input: (req) => ({ key: req.params.key }),
    },
    mcp: false,
  }),

  defineCapability({
    name: "updateEntity",
    input: z.object({ key: z.string() }).and(UpdateEntitySchema) as any,
    handler: ({ key, ...rest }: any) => updateEntity(key, rest),
    rest: {
      method: "put",
      path: "/entities/:key(*)",
      input: (req) => ({ ...req.body, key: req.params.key }),
    },
    mcp: false,
  }),

  defineCapability({
    name: "deleteEntity",
    input: z.object({ key: z.string() }),
    handler: async ({ key }: any) => {
      await deleteEntity(key);
      return { ok: true };
    },
    rest: {
      method: "delete",
      path: "/entities/:key(*)",
      input: (req) => ({ key: req.params.key }),
    },
    mcp: false,
  }),

  defineCapability({
    name: "unlinkRuleFromEntity",
    input: z.object({ ruleId: z.string(), entityKey: z.string() }),
    handler: async (i: any, ctx) => {
      if (!ctx.workspaceId) throw new LoopError("No active workspace", "FORBIDDEN");
      await unlinkRuleFromEntity(i, ctx.workspaceId);
      return { ok: true };
    },
    rest: {
      method: "delete",
      path: "/entities/link",
    },
    mcp: false,
  }),
];
