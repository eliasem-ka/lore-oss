import { z } from "zod";
import { defineCapability, type Capability } from "../registry.js";
import {
  submitCandidate,
  submitRefinement,
  submitVerdict,
  bulkVerdict,
  searchCatalog,
  getRule,
  getProgress,
  listPendingFeedback,
  LoopError,
} from "../../services/loop.js";
import { SubmitCandidateSchema, SubmitRefinementSchema, SearchCatalogSchema, BulkFeedbackSchema, GetRuleSchema } from "../../schemas/rule.js";
import { VerdictSchema } from "../../schemas/feedback.js";

export const ruleCapabilities: Capability<any, any>[] = [
  defineCapability({
    name: "submitCandidate",
    input: SubmitCandidateSchema,
    handler: async (input, ctx) => {
      if (!ctx.workspaceId) throw new LoopError("No active workspace", "FORBIDDEN");
      const result = await submitCandidate(input as any, ctx.workspaceId);
      ctx.bus.emit({ type: "UnitContentChanged", unitId: result.rule.id, kind: "business_rule", version: result.version });
      return result;
    },
    rest: { method: "post", path: "/rules" },
    mcp: {
      tool: "submit_candidate",
      description: "Submit a discovered business rule as a candidate for human review (status: in_review). If a rule with the same rule_key already exists, a new version is created instead of a duplicate. Returns merged/version/warnings.",
      shape: SubmitCandidateSchema.shape,
      render: ({ rule, merged, version, warnings, relatedApproved }: any) => {
        const lines: string[] = [];
        lines.push(
          merged
            ? `✓ Merged into existing rule "${rule.title}" (unit_key: ${rule.unitKey ?? rule.id}) → now at v${version}`
            : `✓ Created new rule "${rule.title}" → v${version}`
        );
        lines.push(`  rule_id: ${rule.id}`);

        if (warnings.length > 0) {
          lines.push(`\n⚠ Source overlap warnings (${warnings.length}):`);
          for (const w of warnings) {
            lines.push(`  - "${w.existingRuleTitle}" (${w.existingRuleId}) already references: ${w.overlapSource}`);
          }
          lines.push(
            "\n  Consider: is this the same rule? If yes, pass its rule_key so the versions merge instead of duplicating."
          );
        }

        if (relatedApproved.length > 0) {
          lines.push(`\n📚 Already-approved rules in flow "${rule.flow}" (${relatedApproved.length}):`);
          for (const r of relatedApproved.slice(0, 5)) {
            lines.push(`  - "${r.title}"${r.unitKey ? ` [${r.unitKey}]` : ""} (${r.id})`);
          }
          if (relatedApproved.length > 5) lines.push(`  … and ${relatedApproved.length - 5} more`);
          lines.push("  Review these to avoid submitting rules already covered by the catalog.");
        }

        return lines.join("\n");
      },
    },
  }),

  defineCapability({
    name: "submitRefinement",
    input: SubmitRefinementSchema,
    handler: async (input, ctx) => {
      if (!ctx.workspaceId) throw new LoopError("No active workspace", "FORBIDDEN");
      const updated = await submitRefinement(input as any, ctx.workspaceId);
      ctx.bus.emit({ type: "UnitContentChanged", unitId: updated.id, kind: updated.kind as any, version: updated.currentVersion });
      return updated;
    },
    rest: {
      method: "post",
      path: "/rules/:id/refine",
      input: (req) => ({ ...req.body, ruleId: req.params.id }),
    },
    mcp: {
      tool: "submit_refinement",
      description: "Submit a refined version of a rejected rule, addressing specific feedback items.",
      shape: SubmitRefinementSchema.shape,
      render: (out: any) => JSON.stringify(out, null, 2),
    },
  }),

  defineCapability({
    name: "submitVerdict",
    input: VerdictSchema,
    handler: async (input, ctx) => {
      if (!ctx.workspaceId) throw new LoopError("No active workspace", "FORBIDDEN");
      const reviewerName = ctx.user?.name ?? input.reviewerName;
      const reviewerRole = ctx.user?.role ?? input.reviewerRole;
      if (!reviewerName) throw new LoopError("Unauthorized", "UNAUTHORIZED");
      const updated = await submitVerdict({ ...input, reviewerName, reviewerRole }, ctx.workspaceId);
      ctx.bus.emit({ type: "VerdictSubmitted", unitId: input.ruleId, verdict: input.verdict, reviewer: reviewerName });
      ctx.bus.emit({ type: "UnitStatusChanged", unitId: input.ruleId, to: updated.status as any });
      return updated;
    },
    rest: {
      method: "post",
      path: "/rules/:id/feedback",
      input: (req) => ({ ...req.body, ruleId: req.params.id }),
    },
    mcp: false,
  }),

  defineCapability({
    name: "bulkVerdict",
    input: BulkFeedbackSchema,
    handler: async (input, ctx) => {
      if (!ctx.workspaceId) throw new LoopError("No active workspace", "FORBIDDEN");
      const reviewerName = ctx.user?.name ?? input.reviewerName;
      const reviewerRole = ctx.user?.role ?? input.reviewerRole;
      if (!reviewerName) throw new LoopError("Unauthorized", "UNAUTHORIZED");
      return bulkVerdict({ ...input, reviewerName, reviewerRole }, ctx.workspaceId);
    },
    rest: { method: "post", path: "/rules/bulk-feedback" },
    mcp: false,
  }),

  defineCapability({
    name: "searchCatalog",
    input: SearchCatalogSchema,
    handler: (input, ctx) => {
      if (!ctx.workspaceId) throw new LoopError("No active workspace", "FORBIDDEN");
      return searchCatalog(input, ctx.workspaceId);
    },
    rest: { method: "get", path: "/rules" },
    mcp: {
      tool: "search_catalog",
      description: "Search the knowledge catalog (business rules and architecture units). Business rules default to approved; architecture (kind='architecture') defaults to published+approved. Filter by project, kind, unitType, flow, confidence, or status.",
      shape: {
        query: z.string().optional().describe("Full-text / semantic search string"),
        status: z
          .enum(["in_review", "approved", "rejected", "published"])
          .optional()
          .describe("Filter by status (business_rule default: approved; architecture default: published+approved)"),
        flow: z.string().optional().describe("Filter by flow name (business rules)"),
        confidence: z.enum(["high", "medium", "low"]).optional().describe("Filter by confidence"),
        projectKey: z.string().optional().describe("Scope to a project (unknown key → no results)"),
        kind: z.enum(["business_rule", "architecture"]).optional().describe("Filter by knowledge kind"),
        unitType: z.enum(["feature", "layer", "component"]).optional().describe("Filter architecture units by level"),
      },
      render: (out: any) => JSON.stringify(out, null, 2),
    },
  }),

  defineCapability({
    name: "getRule",
    input: GetRuleSchema,
    handler: (input, ctx) => {
      if (!ctx.workspaceId) throw new LoopError("No active workspace", "FORBIDDEN");
      return getRule(input as any, ctx.workspaceId);
    },
    rest: {
      method: "get",
      path: "/rules/:id",
      input: (req) => ({ id: req.params.id }),
    },
    mcp: {
      tool: "get_rule",
      description: "Get a full rule with all versions and feedback history.",
      shape: {
        id: z.string().uuid().optional(),
        ruleKey: z.string().optional(),
      },
      render: (out: any) => JSON.stringify(out, null, 2),
    },
  }),

  defineCapability({
    name: "getProgress",
    input: z.object({}),
    handler: (_input, ctx) => {
      if (!ctx.workspaceId) throw new LoopError("No active workspace", "FORBIDDEN");
      return getProgress(ctx.workspaceId);
    },
    rest: { method: "get", path: "/progress" },
    mcp: false,
  }),

  defineCapability({
    name: "listPendingFeedback",
    input: z.object({ flow: z.string().optional() }),
    handler: (input, ctx) => {
      if (!ctx.workspaceId) throw new LoopError("No active workspace", "FORBIDDEN");
      return listPendingFeedback(input, ctx.workspaceId);
    },
    rest: {
      method: "get",
      path: "/feedback/pending",
      input: (req) => ({ flow: typeof req.query.flow === "string" ? req.query.flow : undefined }),
    },
    mcp: {
      tool: "list_pending_feedback",
      description: "Get rejected rules with reviewer comments — the agent re-work queue.",
      shape: { flow: z.string().optional() },
      render: (out: any) => JSON.stringify(out, null, 2),
    },
  }),
];
