import type { Capability } from "../registry.js";
import { projectCapabilities } from "./projects.js";
import { roundCapabilities } from "./rounds.js";
import { ruleCapabilities } from "./rules.js";
import { architectureCapabilities } from "./architecture.js";
import { entityCapabilities } from "./entities.js";
import { exportCapabilities } from "./export.js";
import { authCapabilities } from "./auth.js";
import { flowPolicyCapabilities } from "./flowPolicies.js";
import { workspaceCapabilities } from "./workspaces.js";

export const ALL_CAPABILITIES: Capability[] = [
  ...projectCapabilities,
  ...roundCapabilities,
  ...ruleCapabilities,
  ...architectureCapabilities,
  ...entityCapabilities,
  ...exportCapabilities,
  ...authCapabilities,
  ...flowPolicyCapabilities,
  ...workspaceCapabilities,
];
