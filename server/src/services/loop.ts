import { eq, and, inArray } from "drizzle-orm";
import { db as defaultDb, type DB } from "../db/index.js";
import * as projectRepo from "../repos/projectRepo.js";
import * as roundRepo from "../repos/roundRepo.js";
import * as feedbackRepo from "../repos/feedbackRepo.js";
import * as entityRepo from "../repos/entityRepo.js";
import * as unitRepo from "../repos/knowledgeUnitRepo.js";
import * as unitLinkRepo from "../repos/unitLinkRepo.js";
import * as searchRepo from "../repos/searchRepo.js";
import { rounds, knowledgeUnits, entities } from "../db/schema.js";
import type { ArchitectureContent, BusinessRuleContent } from "../db/schema.js";
import type {
  SubmitCandidateInput,
  SubmitRefinementInput,
  SearchCatalogInput,
  BulkFeedbackInput,
} from "../schemas/rule.js";
import type {
  DefineEntityInput,
  UpdateEntityInput,
  LinkRuleEntityInput,
  ListEntitiesInput,
} from "../schemas/entity.js";
import type { VerdictInput } from "../schemas/feedback.js";
import type { StartRoundInput } from "../schemas/round.js";
import type { RegisterProjectInput } from "../schemas/project.js";
import type {
  SubmitArchitectureUnitInput,
  ListStaleUnitsInput,
} from "../schemas/architecture.js";
import { embed } from "./embeddings.js";
import { transition, type Action } from "../domain/fsm.js";
import { policyFor, HierarchyError } from "../domain/kinds/index.js";
import { ingestUnit, ruleEmbeddingFields, archEmbeddingFields, searchTextFor, buildSnapshot } from "./ingestUnit.js";
import * as flowPolicyRepo from "../repos/flowPolicyRepo.js";
import { meetsRole } from "../domain/roles.js";

// Hybrid-search tuning. CANDIDATE_K = how many candidates each retriever (dense /
// sparse) contributes; RRF_K = Reciprocal Rank Fusion constant (60 is the standard,
// dampens the weight of top ranks so the two lists blend smoothly).
const CANDIDATE_K = 50;
const RRF_K = 60;

export class LoopError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
  }
}

// ── Projects ────────────────────────────────────────────────────────────────────

export async function registerProject(input: RegisterProjectInput, workspaceId: string, db: DB = defaultDb) {
  return projectRepo.upsertProject(input, workspaceId, db);
}

export async function listProjects(workspaceId: string, db: DB = defaultDb) {
  return projectRepo.listAllProjects(workspaceId, db);
}

export async function getProjectByKey(key: string, workspaceId: string, db: DB = defaultDb) {
  const project = await projectRepo.findProjectByKey(key, workspaceId, db);
  if (!project) throw new LoopError(`Project not found: ${key}`, "PROJECT_NOT_FOUND");
  return project;
}

// ── Rounds ────────────────────────────────────────────────────────────────────

export type RoundConflict = {
  type: "scope_overlap";
  conflictingRoundId: string;
  conflictingRoundLabel: string;
  conflictingOwner: string | null;
  overlapFlows?: string[];
};

export type CreateRoundResult = {
  round: typeof rounds.$inferSelect;
  conflicts: RoundConflict[];
};

export async function createRound(
  input: StartRoundInput,
  workspaceId: string,
  db: DB = defaultDb
): Promise<CreateRoundResult> {
  const project = await getProjectByKey(input.projectKey, workspaceId, db);
  const conflicts = await detectRoundConflicts(input, project.id, workspaceId, db);

  const round = await roundRepo.insertRound({
    workspaceId,
    projectId: project.id,
    sourceLabel: input.sourceLabel,
    sourceKind: input.sourceKind,
    toolsDetected: input.toolsDetected,
    scope: input.scope,
    ownerName: input.ownerName,
    status: "open",
  }, db);

  return { round, conflicts };
}

// Conflicts are detected ONLY against open rounds of the same project (FR-003) —
// two different projects never falsely conflict.
async function detectRoundConflicts(
  input: StartRoundInput,
  projectId: string,
  workspaceId: string,
  db: DB
): Promise<RoundConflict[]> {
  const openRounds = await roundRepo.findOpenRoundsByProject(projectId, workspaceId, db);
  if (!openRounds.length) return [];

  const newFlows = input.scope?.flows ?? [];
  const conflicts: RoundConflict[] = [];

  for (const r of openRounds) {
    const existingFlows = (r.scope as { flows?: string[] } | null)?.flows ?? [];

    // If either round has no scope, treat as "touches everything"
    const newIsGlobal = !newFlows.length;
    const existingIsGlobal = !existingFlows.length;

    if (newIsGlobal || existingIsGlobal) {
      conflicts.push({
        type: "scope_overlap",
        conflictingRoundId: r.id,
        conflictingRoundLabel: r.sourceLabel,
        conflictingOwner: r.ownerName ?? null,
      });
      continue;
    }

    const overlap = newFlows.filter((f) => existingFlows.includes(f));
    if (overlap.length > 0) {
      conflicts.push({
        type: "scope_overlap",
        conflictingRoundId: r.id,
        conflictingRoundLabel: r.sourceLabel,
        conflictingOwner: r.ownerName ?? null,
        overlapFlows: overlap,
      });
    }
  }

  return conflicts;
}

export async function completeRound(roundId: string, workspaceId: string, db: DB = defaultDb) {
  const round = await roundRepo.markRoundCompleted(roundId, workspaceId, db);
  if (!round) throw new LoopError("Round not found", "ROUND_NOT_FOUND");
  return round;
}

export async function getActiveRounds(workspaceId: string, db: DB = defaultDb) {
  return roundRepo.findOpenRounds(workspaceId, db);
}

export async function getRounds(workspaceId: string, db: DB = defaultDb) {
  return roundRepo.findAllRounds(workspaceId, db);
}

// ── Rules ─────────────────────────────────────────────────────────────────────

export type SourceOverlapWarning = {
  type: "source_overlap";
  existingRuleId: string;
  existingRuleTitle: string;
  overlapSource: string;
};

export type RelatedApprovedRule = {
  id: string;
  title: string;
  unitKey: string | null;
};

export type SubmitCandidateResult = {
  rule: typeof knowledgeUnits.$inferSelect;
  merged: boolean;
  version: number;
  warnings: SourceOverlapWarning[];
  relatedApproved: RelatedApprovedRule[];
};

export async function submitCandidate(
  input: SubmitCandidateInput,
  workspaceId: string,
  db: DB = defaultDb
): Promise<SubmitCandidateResult> {
  // Every knowledge unit belongs to a project (FR-002). Business rules default to
  // the `default` project when no projectKey is given (preserves existing callers).
  const project = await getProjectByKey(input.projectKey ?? "default", workspaceId, db);

  // S4: pre-fetch approved rules in same flow for agent awareness
  const relatedApproved = await unitRepo.findApprovedByFlow(input.flow, workspaceId, db);

  const r = await ingestUnit(
    {
      workspaceId,
      projectId: project.id,
      kind: "business_rule",
      ruleKey: input.ruleKey,
      title: input.title,
      confidence: input.confidence,
      sources: input.sources,
      roundId: input.roundId,
      entityLinks: input.entityLinks,
      flow: input.flow,
      subflow: input.subflow,
      productDescription: input.productDescription,
      technicalDescription: input.technicalDescription,
      decisionLogic: input.decisionLogic,
      openQuestions: input.openQuestions,
    },
    relatedApproved,
    db
  );

  return { rule: r.unit, merged: r.merged, version: r.version, warnings: r.warnings, relatedApproved: r.relatedApproved };
}

// ── Architecture units (kind=architecture) ─────────────────────────────────────

export type SubmitArchitectureUnitResult = {
  unit: typeof knowledgeUnits.$inferSelect;
  merged: boolean;
  version: number;
  status: typeof knowledgeUnits.$inferSelect.status;
  warnings: SourceOverlapWarning[];
  relatedApproved: RelatedApprovedRule[];
};

export async function submitArchitectureUnit(
  input: SubmitArchitectureUnitInput,
  workspaceId: string,
  db: DB = defaultDb
): Promise<SubmitArchitectureUnitResult> {
  const project = await getProjectByKey(input.projectKey, workspaceId, db);

  // A layer sub-unit must hang off a feature (domain invariant — lives in the kind policy).
  try {
    policyFor("architecture").validateHierarchy({ unitType: input.unitType, parentId: input.parentId }, undefined);
  } catch (e) {
    if (e instanceof HierarchyError) throw new LoopError(e.message, e.code);
    throw e;
  }

  // Validate parent (if any) exists and belongs to the same project.
  if (input.parentId) {
    const parent = await unitRepo.findUnitById(input.parentId, workspaceId, db);
    if (!parent) throw new LoopError("Parent unit not found", "PARENT_NOT_FOUND");
    if (parent.projectId !== project.id) {
      throw new LoopError("Parent unit belongs to a different project", "PARENT_PROJECT_MISMATCH");
    }
  }

  const relatedApproved = await unitRepo.findApprovedArchByProject(project.id, workspaceId, db);

  const r = await ingestUnit(
    {
      workspaceId,
      projectId: project.id,
      kind: "architecture",
      ruleKey: input.ruleKey,
      title: input.title,
      confidence: input.confidence,
      sources: input.sources,
      roundId: input.roundId,
      entityLinks: input.entityLinks,
      unitType: input.unitType,
      parentId: input.parentId,
      content: input.content,
    },
    relatedApproved,
    db
  );

  return { unit: r.unit, merged: r.merged, version: r.version, status: r.status as typeof r.unit.status, warnings: r.warnings, relatedApproved: r.relatedApproved };
}

export async function submitVerdict(input: VerdictInput, workspaceId: string, db: DB = defaultDb) {
  const rule = await unitRepo.findUnitById(input.ruleId, workspaceId, db);
  if (!rule) throw new LoopError("Rule not found", "RULE_NOT_FOUND");

  // Guard against NULL being inserted into NOT-NULL column
  if (!input.reviewerName) {
    throw new LoopError("reviewerName is required", "INVALID_INPUT");
  }

  const action: Action = input.verdict === "approved" ? "approve"
    : input.verdict === "rejected" ? "reject" : "clarify";
  const t = transition(rule.status as never, action, { comment: input.comment });
  if (!t.ok) {
    throw new LoopError(t.message, t.code === "COMMENT_REQUIRED" ? "COMMENT_REQUIRED" : "INVALID_STATUS");
  }
  const newStatus = t.to;

  // Role-based approval gate (S6·3): a flow may require a minimum role to approve.
  if (input.verdict === "approved" && rule.flow) {
    const policy = await flowPolicyRepo.findPolicy(rule.flow, db);
    if (policy && !meetsRole(input.reviewerRole, policy.minApproveRole)) {
      throw new LoopError(
        `Role '${input.reviewerRole ?? "none"}' cannot approve flow '${rule.flow}' (requires ${policy.minApproveRole})`,
        "FORBIDDEN"
      );
    }
  }

  await feedbackRepo.insertFeedback({
    unitId: input.ruleId,
    unitVersion: rule.currentVersion,
    verdict: input.verdict,
    comment: input.comment,
    reviewerName: input.reviewerName,
    reviewerRole: input.reviewerRole,
    status: "pending",
  }, db);

  const updated = await unitRepo.updateUnit(input.ruleId, { status: newStatus, updatedAt: new Date() }, db);

  return updated!;
}

// S3: bulk approve / reject
export async function bulkVerdict(
  input: BulkFeedbackInput,
  workspaceId: string,
  db: DB = defaultDb
) {
  if (
    (input.verdict === "rejected" || input.verdict === "needs_clarification") &&
    !input.comment?.trim()
  ) {
    throw new LoopError(
      "Comment is required for rejected or needs_clarification bulk verdicts",
      "COMMENT_REQUIRED"
    );
  }

  const results = await Promise.allSettled(
    input.ruleIds.map((ruleId) =>
      submitVerdict(
        {
          ruleId,
          verdict: input.verdict,
          comment: input.comment,
          reviewerName: input.reviewerName,
          reviewerRole: input.reviewerRole,
        },
        workspaceId,
        db
      )
    )
  );

  return results.map((r, i) =>
    r.status === "fulfilled"
      ? { ruleId: input.ruleIds[i], ok: true }
      : { ruleId: input.ruleIds[i], ok: false, error: (r.reason as Error).message }
  );
}

export async function submitRefinement(
  input: SubmitRefinementInput,
  workspaceId: string,
  db: DB = defaultDb
) {
  const rule = await unitRepo.findUnitById(input.ruleId, workspaceId, db);
  if (!rule) throw new LoopError("Rule not found", "RULE_NOT_FOUND");
  const t = transition(rule.status as never, "refine", {});
  if (!t.ok) throw new LoopError(`Cannot refine a rule in status '${rule.status}'`, "INVALID_STATUS");

  const newVersion = rule.currentVersion + 1;

  // For business_rule, content is BusinessRuleContent; read fields from it for refinement merging.
  const existingBrContent = rule.kind === "business_rule"
    ? (rule.content as BusinessRuleContent | null | undefined)
    : null;

  const patchTitle = input.title ?? rule.title;
  const patchSources = input.sources ?? rule.sources;
  const patchConfidence = input.confidence ?? rule.confidence;

  // Build the new content for business_rule patches
  const patchContent =
    rule.kind === "architecture"
      ? rule.content
      : {
          productDescription: input.productDescription ?? existingBrContent?.productDescription ?? "",
          technicalDescription: input.technicalDescription ?? existingBrContent?.technicalDescription ?? "",
          ...(input.decisionLogic !== undefined
            ? { decisionLogic: input.decisionLogic }
            : existingBrContent?.decisionLogic !== undefined
            ? { decisionLogic: existingBrContent.decisionLogic }
            : {}),
          ...(input.openQuestions !== undefined
            ? { openQuestions: input.openQuestions }
            : existingBrContent?.openQuestions !== undefined && existingBrContent.openQuestions.length > 0
            ? { openQuestions: existingBrContent.openQuestions }
            : {}),
        } as BusinessRuleContent;

  const patch = {
    title: patchTitle,
    sources: patchSources,
    confidence: patchConfidence,
    content: patchContent,
  };

  const embFields =
    rule.kind === "architecture" && rule.content
      ? await archEmbeddingFields(patch.title, rule.content as ArchitectureContent)
      : await ruleEmbeddingFields({ title: patch.title, content: patchContent as BusinessRuleContent });
  const refinedSearchText = searchTextFor(rule.kind as "architecture" | "business_rule", { title: patch.title, content: patchContent });
  const updated = await unitRepo.updateUnit(
    input.ruleId,
    { ...patch, ...embFields, status: "in_review", currentVersion: newVersion, updatedAt: new Date(), searchText: refinedSearchText },
    db
  );

  await unitRepo.insertVersion({
    unitId: rule.id,
    version: newVersion,
    snapshot: buildSnapshot(patch as Record<string, unknown>),
    createdBy: "agent",
    changeNote: input.changeNote ?? "Agent refinement",
  }, db);

  await feedbackRepo.resolveFeedback(input.ruleId, input.addressesFeedbackIds, db);

  return updated!;
}

// ── Queries ───────────────────────────────────────────────────────────────────

export async function listPendingFeedback(
  { flow }: { flow?: string } = {},
  workspaceId: string,
  db: DB = defaultDb
) {
  return unitRepo.findPendingFeedbackUnits(flow, workspaceId, db);
}

// Hybrid semantic + keyword search.
//
// Without a query → plain filtered list (unchanged).
// With a query → fuse two retrievers with Reciprocal Rank Fusion:
//   - DENSE: cosine distance over multilingual embeddings (semantic, cross-lingual).
//            An agent querying in Spanish hits English rules and vice-versa.
//   - SPARSE: Postgres FTS with the 'simple' config (no stemming) → exact tokens
//             and code identifiers like "SKU4471" / "getCartTotalForCustomer".
// If the query can't be embedded (model down), DENSE is empty and we degrade to
// SPARSE-only — i.e. the previous FTS behavior, never a hard failure.
export async function searchCatalog(
  input: SearchCatalogInput,
  workspaceId: string,
  db: DB = defaultDb
) {
  // Resolve project filter (unknown key → no results, never an error in search).
  let projectId: string | undefined;
  if (input.projectKey) {
    projectId = await searchRepo.findProjectIdByKey(input.projectKey, workspaceId, db);
    if (!projectId) return [];
  }

  // Kind defaults to business_rule so the legacy catalog/review-queue (which never
  // sends `kind`) keeps returning only business rules — architecture is opt-in via
  // kind=architecture. Keeps business-rule behavior unchanged for existing callers.
  const kind = input.kind ?? "business_rule";

  // Status default: explicit wins; else architecture surfaces published+approved,
  // business rules stay approved-only (FR-024/025). status=approved always excludes
  // unreviewed `published`.
  const statusFilter = input.status
    ? eq(knowledgeUnits.status, input.status)
    : kind === "architecture"
      ? inArray(knowledgeUnits.status, ["published", "approved"])
      : eq(knowledgeUnits.status, "approved");

  const filters = [
    eq(knowledgeUnits.workspaceId, workspaceId),
    statusFilter,
    eq(knowledgeUnits.kind, kind),
    ...(input.flow       ? [eq(knowledgeUnits.flow,       input.flow)]       : []),
    ...(input.confidence ? [eq(knowledgeUnits.confidence, input.confidence)] : []),
    ...(projectId        ? [eq(knowledgeUnits.projectId,  projectId)]        : []),
    ...(input.unitType   ? [eq(knowledgeUnits.unitType,   input.unitType)]   : []),
  ];

  // No query → filtered catalog list, grouped by flow.
  if (!input.query) {
    const rows = await searchRepo.findFilteredUnits(filters, db);
    return attachEntities(rows, db);
  }

  // SPARSE candidates (keyword) — always available.
  const sparse = await searchRepo.sparseCandidates(filters, input.query, CANDIDATE_K, db);

  // DENSE candidates (semantic) — only if the query embedded successfully.
  let dense: { id: string }[] = [];
  const queryVec = await embed(input.query, "query");
  if (queryVec) {
    dense = await searchRepo.denseCandidates(filters, queryVec, CANDIDATE_K, db);
  }

  // Reciprocal Rank Fusion: score = Σ 1 / (RRF_K + rank).
  const scores = new Map<string, number>();
  const fuse = (list: { id: string }[]) =>
    list.forEach((r, i) => scores.set(r.id, (scores.get(r.id) ?? 0) + 1 / (RRF_K + i + 1)));
  fuse(dense);
  fuse(sparse);

  if (scores.size === 0) return [];

  const rankedIds = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)
    .slice(0, CANDIDATE_K);

  const rows = await unitRepo.findManyByIds(rankedIds, workspaceId, db);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = rankedIds
    .map((id) => byId.get(id))
    .filter((r): r is (typeof rows)[number] => !!r);

  return attachEntities(ordered, db);
}

export async function getRule(
  { id, ruleKey }: { id?: string; ruleKey?: string },
  workspaceId: string,
  db: DB = defaultDb
) {
  const rule = await unitRepo.findUnitWithHistory({ id, ruleKey }, workspaceId, db);
  if (!rule) throw new LoopError("Rule not found", "RULE_NOT_FOUND");

  const entityLinks = await entityRepo.findEntityLinksForRule(rule.id, db);

  // Architecture hierarchy: expose layer children of a feature and the parent of a layer.
  // (`content` is already part of `rule`.) Orphaned children tolerate a missing parent.
  const children = await unitRepo.findChildren(rule.id, workspaceId, db);
  // Parent lookup stays within the request workspace — hierarchy is always intra-workspace.
  const parent = rule.parentId ? await unitRepo.findUnitById(rule.parentId, workspaceId, db) ?? null : null;
  const externalLinks = await unitLinkRepo.findLinksForUnit(rule.id, db);

  return { ...rule, entities: entityLinks, parent, children, externalLinks };
}

export async function getProgress(workspaceId: string, db: DB = defaultDb) {
  const allRules = await unitRepo.findStatusFlowRows(workspaceId, db);

  const zero = () => ({ in_review: 0, approved: 0, rejected: 0, published: 0 });
  const totals = zero();
  const byFlow: Record<string, ReturnType<typeof zero>> = {};

  for (const r of allRules) {
    totals[r.status]++;
    const flow = r.flow ?? "(unscoped)"; // architecture units may have no flow
    if (!byFlow[flow]) byFlow[flow] = zero();
    byFlow[flow][r.status]++;
  }

  const openRounds = await roundRepo.findOpenRounds(workspaceId, db);

  return { totals, byFlow, openRounds };
}

// Staleness (FR-012): architecture units whose recorded provenance.indexCommit
// differs from a reference revision (defaults to the project's defaultRef).
export async function listStaleUnits(input: ListStaleUnitsInput, workspaceId: string, db: DB = defaultDb) {
  const project = await getProjectByKey(input.projectKey, workspaceId, db);
  const ref = input.ref ?? project.defaultRef ?? null;

  const units = await unitRepo.findArchUnitsByProject(project.id, workspaceId, db);

  const stale = units.filter((u) => {
    const indexCommit = (u.content as ArchitectureContent | null)?.provenance?.indexCommit ?? null;
    return ref !== null && indexCommit !== null && indexCommit !== ref;
  });

  return { reference: ref, stale };
}

// ── Entities ──────────────────────────────────────────────────────────────────

export async function defineEntity(input: DefineEntityInput, db: DB = defaultDb) {
  return entityRepo.upsertEntity(input, db);
}

export async function updateEntity(key: string, input: UpdateEntityInput, db: DB = defaultDb) {
  const patch: Partial<typeof entities.$inferInsert> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.category !== undefined) patch.category = input.category;
  if (input.description !== undefined) patch.description = input.description;
  if (input.attributes !== undefined) patch.attributes = input.attributes;
  if (input.source !== undefined) patch.source = input.source;
  const entity = await entityRepo.patchEntity(key, patch, db);
  if (!entity) throw new LoopError(`Entity not found: ${key}`, "ENTITY_NOT_FOUND");
  return entity;
}

export async function listEntities(input: ListEntitiesInput = { includeDeleted: false }, db: DB = defaultDb) {
  return entityRepo.findEntities({ includeDeleted: input.includeDeleted, category: input.category }, db);
}

export async function getEntityWithRules(key: string, workspaceId: string, db: DB = defaultDb) {
  const entity = await entityRepo.findEntityByKey(key, db);
  if (!entity) throw new LoopError(`Entity not found: ${key}`, "ENTITY_NOT_FOUND");
  // Entities are global, but the linked rules must not leak cross-tenant units.
  const linked = await entityRepo.findRulesForEntity(key, workspaceId, db);
  return { ...entity, rules: linked };
}

export async function deleteEntity(key: string, db: DB = defaultDb) {
  const entity = await entityRepo.softDeleteEntity(key, db);
  if (!entity) throw new LoopError(`Entity not found: ${key}`, "ENTITY_NOT_FOUND");
}

export async function linkRuleToEntity(input: LinkRuleEntityInput, workspaceId: string, db: DB = defaultDb) {
  // Tenant guard: the unit must belong to the caller's workspace (a foreign unit
  // is indistinguishable from not-found — no cross-tenant link mutation).
  const unit = await unitRepo.findUnitById(input.ruleId, workspaceId, db);
  if (!unit) throw new LoopError("Rule not found", "RULE_NOT_FOUND");
  const entity = await entityRepo.findEntityByKey(input.entityKey, db);
  if (!entity) throw new LoopError(`Entity not found: ${input.entityKey}`, "ENTITY_NOT_FOUND");
  await entityRepo.upsertRuleEntityLink(input.ruleId, input.entityKey, input.role, db);
}

export async function unlinkRuleFromEntity(
  { ruleId, entityKey }: { ruleId: string; entityKey: string },
  workspaceId: string,
  db: DB = defaultDb
) {
  // Same tenant guard as linkRuleToEntity.
  const unit = await unitRepo.findUnitById(ruleId, workspaceId, db);
  if (!unit) throw new LoopError("Rule not found", "RULE_NOT_FOUND");
  await entityRepo.deleteRuleEntityLink(ruleId, entityKey, db);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export type { EntityLink } from "../repos/entityRepo.js";

async function attachEntities<T extends { id: string }>(rows: T[], db: DB): Promise<(T & { entities: import("../repos/entityRepo.js").EntityLink[] })[]> {
  if (!rows.length) return rows.map((r) => ({ ...r, entities: [] }));
  const byRule = await entityRepo.findEntityLinksForRules(rows.map((r) => r.id), db);
  return rows.map((r) => ({ ...r, entities: byRule.get(r.id) ?? [] }));
}
