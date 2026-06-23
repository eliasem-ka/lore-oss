/**
 * ingestUnit — single unified flow for submitting a knowledge unit of any kind.
 *
 * Both `submitCandidate` (business_rule) and `submitArchitectureUnit` (architecture)
 * are thin facades over this function. It encapsulates the duplicated logic that
 * lived in both: project resolve, rule_key dedup → version bump, source-overlap
 * warnings, relatedApproved query, autoLinkEntities, version snapshot, status via
 * `policyFor(kind).computeInitialStatus`, and embedding + search_text.
 *
 * Business-rule payload is now stored entirely in `content` (BusinessRuleContent).
 * The flat top-level fields (productDescription / technicalDescription / etc.) are
 * accepted from callers (submit_candidate input stays flat) and mapped into content here.
 */

import { db as defaultDb, type DB } from "../db/index.js";
import * as feedbackRepo from "../repos/feedbackRepo.js";
import * as entityRepo from "../repos/entityRepo.js";
import * as unitRepo from "../repos/knowledgeUnitRepo.js";
import type { Source, EntityRole, ArchitectureContent, BusinessRuleContent, Kind, UnitType, Confidence } from "../db/schema.js";
import { embed, embedRule, EMBEDDING_MODEL } from "./embeddings.js";
import { policyFor } from "../domain/kinds/index.js";
import type { RelatedApprovedRule, SourceOverlapWarning } from "./loop.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type IngestInput = {
  projectId: string;           // already-resolved project id (facades pass this in)
  workspaceId: string;         // caller's workspace — set on insert, used to scope dedup + overlap
  kind: Kind;
  ruleKey?: string;
  title: string;
  confidence: Confidence;
  sources?: Source[];
  roundId?: string;
  entityLinks: Array<{ key: string; role: string }>;
  // business-rule flat input fields (mapped into content by ingestUnit):
  flow?: string;
  subflow?: string;
  productDescription?: string;
  technicalDescription?: string;
  decisionLogic?: Record<string, unknown>;
  openQuestions?: string[];
  // architecture fields:
  unitType?: UnitType;
  parentId?: string;
  content?: ArchitectureContent;
};

export type IngestResult = {
  unit: ReturnType<typeof unitRepo.insertUnit> extends Promise<infer T> ? T : never;
  merged: boolean;
  version: number;
  status: string;
  warnings: SourceOverlapWarning[];
  relatedApproved: RelatedApprovedRule[];
};

// ── Embedding helpers (exported for use by submitRefinement in loop.ts) ──────

export async function ruleEmbeddingFields(r: {
  title: string;
  productDescription?: string | null;
  technicalDescription?: string | null;
  content?: BusinessRuleContent | null;
}): Promise<{ embedding: number[] | null; embeddingModel: string | null }> {
  const prodDesc = r.productDescription ?? r.content?.productDescription ?? "";
  const techDesc = r.technicalDescription ?? r.content?.technicalDescription ?? "";
  const vec = await embedRule({
    title: r.title,
    productDescription: prodDesc,
    technicalDescription: techDesc,
  });
  return vec
    ? { embedding: vec, embeddingModel: EMBEDDING_MODEL }
    : { embedding: null, embeddingModel: null };
}

export async function archEmbeddingFields(
  title: string,
  content: ArchitectureContent
): Promise<{ embedding: number[] | null; embeddingModel: string | null }> {
  const text = policyFor("architecture").embeddingText({
    title,
    productDescription: null,
    technicalDescription: null,
    content,
  });
  const vec = await embed(text, "passage");
  return vec ? { embedding: vec, embeddingModel: EMBEDDING_MODEL } : { embedding: null, embeddingModel: null };
}

export function searchTextFor(
  kind: Kind,
  fields: {
    title: string;
    productDescription?: string | null;
    technicalDescription?: string | null;
    content?: ArchitectureContent | BusinessRuleContent | null;
  }
): string {
  const policy = policyFor(kind);
  const indexable = policy.indexableFrom({ title: fields.title, content: fields.content ?? null });
  return policy.searchText(indexable);
}

export function buildSnapshot(data: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(data));
}

// ── Internal helper: embedding fields from policy ────────────────────────────

async function embeddingFieldsFor(
  kind: Kind,
  indexable: ReturnType<ReturnType<typeof policyFor>["indexableFrom"]>
): Promise<{ embedding: number[] | null; embeddingModel: string | null }> {
  const vec = await embed(policyFor(kind).embeddingText(indexable), "passage");
  return vec ? { embedding: vec, embeddingModel: EMBEDDING_MODEL } : { embedding: null, embeddingModel: null };
}

// ── Overlap / entity helpers ──────────────────────────────────────────────────

async function detectSourceOverlaps(
  incomingSources: Source[],
  excludeRuleId: string | null,
  workspaceId: string,
  db: DB
): Promise<SourceOverlapWarning[]> {
  if (!incomingSources.length) return [];

  const allRules = await unitRepo.findAllForSourceOverlap(excludeRuleId, workspaceId, db);

  const warnings: SourceOverlapWarning[] = [];

  for (const existing of allRules) {
    const existingSources = (existing.sources ?? []) as Source[];
    for (const inc of incomingSources) {
      if (!inc.path && !inc.symbol) continue;
      for (const ex of existingSources) {
        const pathMatch = inc.path && ex.path && inc.path === ex.path;
        const symbolMatch = inc.symbol && ex.symbol && inc.symbol === ex.symbol;
        if (pathMatch && symbolMatch) {
          warnings.push({
            type: "source_overlap",
            existingRuleId: existing.id,
            existingRuleTitle: existing.title,
            overlapSource: [inc.path, inc.symbol].filter(Boolean).join(" · "),
          });
          break;
        }
      }
    }
  }

  return warnings;
}

async function autoLinkEntities(
  ruleId: string,
  links: Array<{ key: string; role: string }>,
  db: DB
): Promise<void> {
  if (!links.length) return;
  const validKeys = await entityRepo.findExistingEntityKeys(links.map((l) => l.key), db);
  const valid = links
    .filter((l) => validKeys.has(l.key))
    .map((l) => ({ key: l.key, role: l.role as EntityRole }));
  await entityRepo.upsertRuleEntityLinks(ruleId, valid, db);
}

// ── Main flow ─────────────────────────────────────────────────────────────────

/**
 * Ingest a knowledge unit. `input.projectId` must already be resolved by the caller.
 *
 * For architecture units: hierarchy validation and parent existence checks must be
 * performed by the caller BEFORE calling this function (they require repo lookups
 * that are better done in the facade where the LoopError boundary lives).
 */
export async function ingestUnit(
  input: IngestInput,
  relatedApproved: RelatedApprovedRule[],
  db: DB = defaultDb
): Promise<IngestResult> {
  const { projectId, workspaceId, kind } = input;
  const policy = policyFor(kind);

  // ── 1. rule_key dedup: if key exists → new version ─────────────────────────
  if (input.ruleKey) {
    const existing = await unitRepo.findUnitByRuleKey(input.ruleKey, workspaceId, db);
    if (existing) {
      const priorFeedback = policy.usesPriorVerdict
        ? await feedbackRepo.findFirstFeedbackForRule(existing.id, db)
        : null;
      const status = policy.computeInitialStatus(
        input.confidence,
        !!priorFeedback
      );
      const newVersion = existing.currentVersion + 1;

      // Build the patch fields — shared + kind-specific
      const basePatch = {
        title: input.title,
        sources: input.sources,
        confidence: input.confidence,
      };

      // Build kind-specific content object for the patch
      const builtContent = policy.buildContent(input);

      const kindPatch = {
        ...policy.structuralColumns(input),
        content: builtContent,
      };

      const patch = { ...basePatch, ...kindPatch };

      const indexable = policy.indexableFrom({ title: input.title, content: builtContent });
      const embFields = await embeddingFieldsFor(kind, indexable);

      const searchText = searchTextFor(kind, {
        title: input.title,
        content: builtContent,
      });

      const updated = await unitRepo.updateUnit(
        existing.id,
        {
          ...patch,
          ...embFields,
          status,
          currentVersion: newVersion,
          updatedAt: new Date(),
          searchText,
        },
        db
      );

      await unitRepo.insertVersion(
        {
          unitId: existing.id,
          version: newVersion,
          snapshot: buildSnapshot(patch as Record<string, unknown>),
          createdBy: "agent",
          changeNote: `Re-extracted by round ${input.roundId ?? "unknown"} (rule_key merge)`,
        },
        db
      );

      const warnings = await detectSourceOverlaps(input.sources ?? [], existing.id, workspaceId, db);
      await autoLinkEntities(existing.id, input.entityLinks, db);

      return {
        unit: updated!,
        merged: true,
        version: newVersion,
        status: updated!.status,
        warnings,
        relatedApproved,
      };
    }
  }

  // ── 2. Source overlap detection ─────────────────────────────────────────────
  const warnings = await detectSourceOverlaps(input.sources ?? [], null, workspaceId, db);

  // ── 3. Compute status for new insert ───────────────────────────────────────
  const status = policy.computeInitialStatus(input.confidence, false);

  // ── 4. Build insert values ─────────────────────────────────────────────────

  // Build kind-specific content for the new insert
  const insertContent = policy.buildContent(input);

  const indexable = policy.indexableFrom({ title: input.title, content: insertContent });
  const embFields = await embeddingFieldsFor(kind, indexable);

  const searchText = searchTextFor(kind, {
    title: input.title,
    content: insertContent,
  });

  // Snapshot shape is kind-specific (mirrors the per-kind snapshots in loop.ts)
  const snapshotData = policy.buildSnapshot(input);

  const insertValues = {
    workspaceId,
    projectId,
    kind,
    unitKey: input.ruleKey,
    title: input.title,
    status,
    confidence: input.confidence,
    sources: input.sources,
    currentVersion: 1 as const,
    roundId: input.roundId,
    searchText,
    ...embFields,
    // flow/subflow are business-rule-specific but remain top-level columns for filtering
    flow: input.flow,
    subflow: input.subflow,
    // architecture columns (null for business rules)
    ...policy.structuralColumns(input),
    // all kind-specific payload goes into content
    content: insertContent,
  } as typeof import("../db/schema.js").knowledgeUnits.$inferInsert;

  const unit = await unitRepo.insertUnit(insertValues, db);

  await unitRepo.insertVersion(
    {
      unitId: unit.id,
      version: 1,
      snapshot: buildSnapshot(snapshotData),
      createdBy: "agent",
      changeNote: "Initial extraction",
    },
    db
  );

  await autoLinkEntities(unit.id, input.entityLinks, db);

  return {
    unit,
    merged: false,
    version: 1,
    status: unit.status,
    warnings,
    relatedApproved,
  };
}
