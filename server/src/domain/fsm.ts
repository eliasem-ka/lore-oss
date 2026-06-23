export type Status = "in_review" | "approved" | "rejected" | "published";
export type Action = "approve" | "reject" | "clarify" | "refine";

export type TransitionResult =
  | { ok: true; to: Status }
  | { ok: false; code: "ILLEGAL_TRANSITION" | "COMMENT_REQUIRED"; message: string };

// Single source of truth for legal transitions. Rows = current status; keys = action.
const TRANSITIONS: Record<Status, Partial<Record<Action, Status>>> = {
  in_review: { approve: "approved", reject: "rejected", clarify: "rejected", refine: "in_review" },
  published: { approve: "approved", reject: "rejected", clarify: "rejected" },
  rejected:  { refine: "in_review" },
  approved:  {},
};

// Actions that demand a reviewer comment (constitution Principle III).
const COMMENT_REQUIRED: ReadonlySet<Action> = new Set(["reject", "clarify"]);

export function transition(from: Status, action: Action, opts: { comment?: string }): TransitionResult {
  const to = TRANSITIONS[from]?.[action];
  if (!to) {
    return { ok: false, code: "ILLEGAL_TRANSITION", message: `Cannot ${action} a unit in status '${from}'` };
  }
  if (COMMENT_REQUIRED.has(action) && !opts.comment?.trim()) {
    return { ok: false, code: "COMMENT_REQUIRED", message: `Comment is required to ${action}` };
  }
  return { ok: true, to };
}
