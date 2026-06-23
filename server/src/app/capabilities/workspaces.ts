import { z } from "zod";
import { defineCapability, type Capability } from "../registry.js";
import * as workspaceRepo from "../../repos/workspaceRepo.js";
import { db } from "../../db/index.js";

export const workspaceCapabilities: Capability<any, any>[] = [
  defineCapability({
    name: "listWorkspaces",
    input: z.object({}),
    handler: async (_input, ctx) => (ctx.user ? workspaceRepo.listForUser(ctx.user.id, db) : []),
    rest: { method: "get", path: "/workspaces" },
  }),
];
