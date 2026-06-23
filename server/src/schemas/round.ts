import { z } from "zod";

export const RoundScopeSchema = z.object({
  flows: z.array(z.string()).optional(),
  paths: z.array(z.string()).optional(),
});

export const StartRoundSchema = z.object({
  projectKey: z.string().min(1),
  sourceLabel: z.string().min(1),
  sourceKind: z.enum(["gitnexus", "repo", "docs", "generic"]),
  toolsDetected: z.array(z.string()).default([]),
  scope: RoundScopeSchema.optional(),
  ownerName: z.string().optional(),
});

export const CompleteRoundSchema = z.object({
  roundId: z.string().uuid(),
});

export type StartRoundInput = z.infer<typeof StartRoundSchema>;
