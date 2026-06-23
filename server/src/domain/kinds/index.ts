import type { Kind } from "../../db/schema.js";
import type { KindPolicy } from "./types.js";
import { businessRulePolicy } from "./businessRule.js";
import { architecturePolicy } from "./architecture.js";

export const KINDS: Record<Kind, KindPolicy> = {
  business_rule: businessRulePolicy,
  architecture: architecturePolicy,
};

export function policyFor(kind: Kind): KindPolicy {
  return KINDS[kind];
}

export { HierarchyError } from "./architecture.js";
export type { KindPolicy, KindLifecycle, KindValidation, KindIndexing, KindSnapshot, KindContent } from "./types.js";
