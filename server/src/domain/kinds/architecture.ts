import type { KindPolicy, IndexableUnit, HierarchyInput } from "./types.js";
import type { ArchitectureContent, UnitContent, UnitType } from "../../db/schema.js";

// Thrown for structural violations; loop.ts maps this to LoopError("PARENT_REQUIRED").
export class HierarchyError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
  }
}

export const architecturePolicy: KindPolicy = {
  // FR-013/014 hybrid-by-confidence + FR-020 human-verdict precedence.
  computeInitialStatus(confidence, hasHumanVerdict) {
    if (hasHumanVerdict) return "in_review";
    return confidence === "high" ? "published" : "in_review";
  },
  validateHierarchy(input: HierarchyInput, parent) {
    if (input.unitType === "layer" && !input.parentId) {
      throw new HierarchyError("A layer unit requires a parentId", "PARENT_REQUIRED");
    }
    // Parent existence / project-match is checked by the caller (needs a repo lookup);
    // this method only enforces the kind's structural rule.
  },
  requiredFields(_input: unknown) {
    /* ArchitectureContentSchema (Zod) enforces content shape. */
  },
  searchText(unit: IndexableUnit) {
    return buildArchText(unit);
  },
  embeddingText(unit: IndexableUnit) {
    return buildArchText(unit);
  },
  indexableFrom(u: { title: string; content: unknown | null }): IndexableUnit {
    return {
      title: u.title,
      productDescription: null,
      technicalDescription: null,
      content: u.content as ArchitectureContent | null,
    };
  },
  structuralColumns(input: unknown): { unitType?: UnitType; parentId?: string } {
    const i = input as { unitType?: UnitType; parentId?: string };
    return { unitType: i.unitType, parentId: i.parentId };
  },
  usesPriorVerdict: true,
  buildSnapshot(input: unknown): Record<string, unknown> {
    const i = input as {
      title: string;
      unitType?: UnitType;
      parentId?: string;
      sources?: unknown;
      confidence?: unknown;
    };
    return {
      title: i.title,
      unitType: i.unitType,
      parentId: i.parentId,
      content: architecturePolicy.buildContent(input),
      sources: i.sources,
      confidence: i.confidence,
    };
  },
  buildContent(input: unknown): UnitContent {
    const i = input as { content: ArchitectureContent };
    return i.content;
  },
};

// Mirrors the previous loop.ts:archEmbeddingFields text builder.
function buildArchText(unit: IndexableUnit): string {
  const c = unit.content as ArchitectureContent | null;
  if (!c) return unit.title;
  const ts = c.techStack;
  return [
    unit.title,
    c.overview,
    ...(ts ? [...(ts.endpoints ?? []), ...(ts.libraries ?? []), ...(ts.persistence ?? [])] : []),
    ...(c.patterns ?? []),
  ].filter(Boolean).join("\n");
}
