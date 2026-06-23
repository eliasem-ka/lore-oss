import { z } from "zod";

export const SourceSchema = z.object({
  path: z.string().optional(),
  symbol: z.string().optional(),
  lines: z.string().optional(),
  sha: z.string().optional(),
  tool: z.string().optional(),
  note: z.string().optional(),
});

export const SubmitCandidateSchema = z.object({
  projectKey: z.string().optional(),
  title: z.string().min(3),
  flow: z.string().min(1),
  subflow: z.string().optional(),
  productDescription: z.string().min(10),
  technicalDescription: z.string().min(10),
  decisionLogic: z.record(z.unknown()).optional(),
  sources: z.array(SourceSchema).default([]),
  confidence: z.enum(["high", "medium", "low"]),
  openQuestions: z.array(z.string()).default([]),
  roundId: z.string().uuid().optional(),
  ruleKey: z.string().optional(),
  entityLinks: z.array(z.object({
    key: z.string().min(1),
    role: z.enum(["applies_to", "excludes", "requires", "modifies"]).default("applies_to"),
  })).default([]),
});

export const SubmitRefinementSchema = z.object({
  ruleId: z.string().uuid(),
  title: z.string().min(3).optional(),
  productDescription: z.string().min(10).optional(),
  technicalDescription: z.string().min(10).optional(),
  decisionLogic: z.record(z.unknown()).optional(),
  sources: z.array(SourceSchema).optional(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
  openQuestions: z.array(z.string()).optional(),
  changeNote: z.string().optional(),
  addressesFeedbackIds: z.array(z.string().uuid()).default([]),
});

export const SearchCatalogSchema = z.object({
  query: z.string().optional(),
  status: z.enum(["in_review", "approved", "rejected", "published"]).optional(),
  flow: z.string().optional(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
  projectKey: z.string().optional(),
  kind: z.enum(["business_rule", "architecture"]).optional(),
  unitType: z.enum(["feature", "layer", "component"]).optional(),
});

export const BulkFeedbackSchema = z.object({
  ruleIds: z.array(z.string().uuid()).min(1),
  verdict: z.enum(["approved", "rejected", "needs_clarification"]),
  comment: z.string().optional(),
  reviewerName: z.string().min(1).optional(),
  reviewerRole: z.string().optional(),
});

export const GetRuleSchema = z.object({
  id: z.string().uuid().optional(),
  ruleKey: z.string().optional(),
}).refine((d) => d.id ?? d.ruleKey, { message: "Provide id or ruleKey" });

export type SubmitCandidateInput = z.infer<typeof SubmitCandidateSchema>;
export type SubmitRefinementInput = z.infer<typeof SubmitRefinementSchema>;
export type SearchCatalogInput = z.infer<typeof SearchCatalogSchema>;
export type BulkFeedbackInput = z.infer<typeof BulkFeedbackSchema>;
