import { z } from "zod";
import { defineCapability, type Capability } from "../registry.js";
import { createRound, completeRound, getRounds, LoopError } from "../../services/loop.js";
import { StartRoundSchema, CompleteRoundSchema } from "../../schemas/round.js";

export const roundCapabilities: Capability<any, any>[] = [
  defineCapability({
    name: "createRound",
    input: StartRoundSchema,
    handler: (input, ctx) => {
      if (!ctx.workspaceId) throw new LoopError("No active workspace", "FORBIDDEN");
      return createRound(input as any, ctx.workspaceId);
    },
    rest: { method: "post", path: "/rounds" },
    mcp: {
      tool: "start_round",
      description: "Start a new extraction round for a project (projectKey required). Optionally declare scope (flows/paths) and owner_name to detect conflicts with other open rounds in the same project.",
      shape: StartRoundSchema.shape,
      render: ({ round, conflicts }: any) => {
        const lines: string[] = [`✓ Round started: ${round.id}`];
        lines.push(`  source: ${round.sourceLabel} (${round.sourceKind})`);
        if (round.ownerName) lines.push(`  owner: ${round.ownerName}`);
        if (round.scope) {
          const s = round.scope as { flows?: string[]; paths?: string[] };
          if (s.flows?.length) lines.push(`  scope flows: ${s.flows.join(", ")}`);
        }

        if (conflicts.length > 0) {
          lines.push(`\n⚠ Scope conflicts with ${conflicts.length} open round(s):`);
          for (const c of conflicts) {
            const owner = c.conflictingOwner ? ` (${c.conflictingOwner})` : "";
            const flows = c.overlapFlows?.length ? ` — overlapping flows: ${c.overlapFlows.join(", ")}` : " — global scope overlap";
            lines.push(`  - "${c.conflictingRoundLabel}"${owner}${flows}`);
          }
          lines.push("\n  Consider narrowing scope or coordinating with the other team.");
        }

        lines.push(`\nround_id: ${round.id}`);
        return lines.join("\n");
      },
    },
  }),
  defineCapability({
    name: "completeRound",
    input: CompleteRoundSchema,
    handler: ({ roundId }, ctx) => {
      if (!ctx.workspaceId) throw new LoopError("No active workspace", "FORBIDDEN");
      return completeRound(roundId, ctx.workspaceId);
    },
    rest: {
      method: "post",
      path: "/rounds/:id/complete",
      input: (req) => ({ roundId: req.params.id }),
    },
    mcp: {
      tool: "complete_round",
      description: "Mark an extraction round as completed.",
      shape: { roundId: z.string().uuid() },
      render: (round: any) => JSON.stringify(round, null, 2),
    },
  }),
  defineCapability({
    name: "getRounds",
    input: z.object({}),
    handler: (_input, ctx) => {
      if (!ctx.workspaceId) throw new LoopError("No active workspace", "FORBIDDEN");
      return getRounds(ctx.workspaceId);
    },
    rest: { method: "get", path: "/rounds" },
    mcp: false,
  }),
];
