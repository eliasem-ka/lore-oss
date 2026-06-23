import { z } from "zod";

export const VerdictSchema = z
  .object({
    ruleId: z.string().uuid(),
    verdict: z.enum(["approved", "rejected", "needs_clarification"]),
    comment: z.string().optional(),
    reviewerName: z.string().min(1).optional(),
    reviewerRole: z.string().optional(),
  })
  .refine(
    (d) =>
      d.verdict === "approved" || (d.comment && d.comment.trim().length > 0),
    { message: "Comment is required for rejected or needs_clarification verdicts" }
  );

export const ListPendingFeedbackSchema = z.object({
  flow: z.string().optional(),
});

export type VerdictInput = z.infer<typeof VerdictSchema>;
