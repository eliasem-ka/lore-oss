import { z } from "zod";
import { defineCapability, type Capability } from "../registry.js";
import { LoginSchema } from "../../schemas/auth.js";
import * as userRepo from "../../repos/userRepo.js";
import { verifyPassword, issueToken } from "../../services/auth.js";
import { db } from "../../db/index.js";
import { LoopError } from "../../services/loop.js";

export const authCapabilities: Capability<any, any>[] = [
  defineCapability({
    name: "login",
    input: LoginSchema,
    handler: async (input) => {
      const u = await userRepo.findByEmail(input.email, db);
      if (!u || !(await verifyPassword(input.password, u.passwordHash))) {
        throw new LoopError("Invalid credentials", "UNAUTHORIZED");
      }
      const user = { id: u.id, email: u.email, name: u.name, role: u.role };
      return { token: issueToken(user), user };
    },
    rest: { method: "post", path: "/auth/login", public: true },
  }),
  defineCapability({
    name: "me",
    input: z.object({}),
    handler: async (_input, ctx) => ctx.user ?? null,
    rest: { method: "get", path: "/auth/me" },
  }),
];
