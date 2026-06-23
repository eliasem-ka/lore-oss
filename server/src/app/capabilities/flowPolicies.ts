import { z } from "zod";
import { defineCapability, type Capability } from "../registry.js";
import * as flowPolicyRepo from "../../repos/flowPolicyRepo.js";
import { db } from "../../db/index.js";

export const flowPolicyCapabilities: Capability<any, any>[] = [
  defineCapability({
    name: "listFlowPolicies",
    input: z.object({}),
    handler: async () => flowPolicyRepo.listPolicies(db),
    rest: { method: "get", path: "/flow-policies" }, // protected (auth) but no mcp
  }),
];
