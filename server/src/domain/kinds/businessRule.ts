import type { KindPolicy, IndexableUnit, HierarchyInput } from "./types.js";
import type { BusinessRuleContent, UnitContent } from "../../db/schema.js";

export const businessRulePolicy: KindPolicy = {
  // Business rules are never auto-surfaced — a human always reviews (Principle III).
  computeInitialStatus() {
    return "in_review";
  },
  // No structural hierarchy for business rules.
  validateHierarchy(_input: HierarchyInput) {
    /* no-op */
  },
  requiredFields(_input: unknown) {
    /* Zod (SubmitCandidateSchema) already enforces the required fields. */
  },
  searchText(unit: IndexableUnit) {
    // Defensive: read from top-level fields first (set by ingestUnit), then fall back
    // to content (belt-and-suspenders for any direct reads from DB rows).
    const brContent = unit.content as BusinessRuleContent | null | undefined;
    const prod = unit.productDescription ?? brContent?.productDescription;
    const tech = unit.technicalDescription ?? brContent?.technicalDescription;
    return [unit.title, prod, tech].filter(Boolean).join("\n");
  },
  embeddingText(unit: IndexableUnit) {
    const brContent = unit.content as BusinessRuleContent | null | undefined;
    const prod = unit.productDescription ?? brContent?.productDescription;
    const tech = unit.technicalDescription ?? brContent?.technicalDescription;
    return [unit.title, prod, tech].filter(Boolean).join("\n");
  },
  indexableFrom(u: { title: string; content: unknown | null }): IndexableUnit {
    const brContent = u.content as BusinessRuleContent | null | undefined;
    return {
      title: u.title,
      productDescription: brContent?.productDescription ?? null,
      technicalDescription: brContent?.technicalDescription ?? null,
      content: null,
    };
  },
  structuralColumns(_input: unknown) {
    return {};
  },
  usesPriorVerdict: false,
  buildSnapshot(input: unknown): Record<string, unknown> {
    const i = input as {
      title: string;
      flow?: string;
      subflow?: string;
      sources?: unknown;
      confidence?: unknown;
      ruleKey?: string;
      entityLinks?: unknown;
      roundId?: string;
    };
    return {
      title: i.title,
      flow: i.flow,
      subflow: i.subflow,
      content: businessRulePolicy.buildContent(input),
      sources: i.sources,
      confidence: i.confidence,
      ruleKey: i.ruleKey,
      entityLinks: i.entityLinks,
      roundId: i.roundId,
    };
  },
  buildContent(input: unknown): UnitContent {
    const i = input as {
      productDescription?: string;
      technicalDescription?: string;
      decisionLogic?: Record<string, unknown>;
      openQuestions?: string[];
    };
    return {
      productDescription: i.productDescription ?? "",
      technicalDescription: i.technicalDescription ?? "",
      ...(i.decisionLogic !== undefined ? { decisionLogic: i.decisionLogic } : {}),
      ...(i.openQuestions !== undefined && i.openQuestions.length > 0 ? { openQuestions: i.openQuestions } : {}),
    } as BusinessRuleContent;
  },
};
