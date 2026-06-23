import type { Status } from "../fsm.js";
import type { Confidence, UnitContent, UnitType } from "../../db/schema.js";

export type HierarchyInput = { unitType?: "feature" | "layer" | "component"; parentId?: string; projectId?: string };

// The fields any kind might draw on to build its search / embedding text. Both
// business-rule columns and architecture `content` are present-or-null.
export type IndexableUnit = {
  title: string;
  productDescription: string | null;
  technicalDescription: string | null;
  content: import("../../db/schema.js").ArchitectureContent | null;
};

export interface KindLifecycle {
  /** Entry status when a unit is (re)submitted. Realizes FR-013/014 + FR-020. */
  computeInitialStatus(confidence: Confidence, hasHumanVerdict: boolean): Status;
  /** Throws LoopError-compatible errors for structural violations (e.g. layer needs a parent). */
  validateHierarchy(input: HierarchyInput, parent: { projectId: string } | undefined): void;
}

export interface KindValidation {
  requiredFields(input: unknown): void;
}

export interface KindIndexing {
  searchText(unit: IndexableUnit): string;
  embeddingText(unit: IndexableUnit): string;
  /** Build an IndexableUnit from a unit's title + content (kind-specific field extraction). */
  indexableFrom(u: { title: string; content: unknown | null }): IndexableUnit;
}

export interface KindStructure {
  /** Returns kind-specific structural DB columns (unitType/parentId for arch; {} for business). */
  structuralColumns(input: unknown): { unitType?: UnitType; parentId?: string };
  /** Whether this kind uses a prior human verdict to gate auto-publish. */
  usesPriorVerdict: boolean;
}

export interface KindSnapshot {
  buildSnapshot(input: unknown): Record<string, unknown>;
}

export interface KindContent {
  buildContent(input: unknown): UnitContent;
}

export type KindPolicy = KindLifecycle & KindValidation & KindIndexing & KindStructure & KindSnapshot & KindContent;
