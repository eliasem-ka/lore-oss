import { Router, type Request, type Response } from "express";
import { ZodError } from "zod";
import { LoopError } from "../services/loop.js";
import { verifyToken } from "../services/auth.js";
import type { Capability, Ctx } from "../app/registry.js";
import * as workspaceRepo from "../repos/workspaceRepo.js";
import { db } from "../db/index.js";

const NOT_FOUND = new Set(["RULE_NOT_FOUND", "ROUND_NOT_FOUND", "PROJECT_NOT_FOUND", "ENTITY_NOT_FOUND"]);
const UNAUTHORIZED = new Set(["UNAUTHORIZED"]);
const FORBIDDEN = new Set(["FORBIDDEN"]);

export function buildApiRouter(capabilities: Capability[], ctx: Ctx): Router {
  const router = Router();
  for (const cap of capabilities) {
    if (!cap.rest) continue;
    const rest = cap.rest;
    const { method, path, input, status } = rest;
    router[method](path, async (req: Request, res: Response) => {
      // --- auth enforcement ---
      const authz = req.headers.authorization;
      let user: ReturnType<typeof verifyToken> | undefined;
      if (authz?.startsWith("Bearer ")) {
        try { user = verifyToken(authz.slice(7)); } catch { /* invalid → treated as no user */ }
      }
      if (!rest.public && !user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      // --- workspace resolution (authenticated routes only) ---
      let workspaceId: string | undefined;
      if (user) {
        const wsHeader = req.headers["x-workspace-id"];
        const wsId = Array.isArray(wsHeader) ? wsHeader[0] : wsHeader;
        if (wsId) {
          if (!(await workspaceRepo.isMember(wsId, user.id, db))) {
            res.status(403).json({ error: "Not a member of workspace" });
            return;
          }
          workspaceId = wsId;
        } else {
          workspaceId = (await workspaceRepo.listForUser(user.id, db))[0]?.id;
        }
      }
      // --- end workspace resolution ---
      const reqCtx = { ...ctx, user, workspaceId };
      // --- end auth ---
      try {
        const raw = input ? input(req) : method === "get" ? req.query : req.body;
        const parsed = cap.input.parse(raw);
        const result = await cap.handler(parsed, reqCtx);
        if (rest.respond) rest.respond(res, result);
        else res.status(status ?? 200).json(result);
      } catch (err) {
        if (err instanceof ZodError) {
          res.status(400).json({ error: "Validation error", issues: err.errors });
        } else if (err instanceof LoopError) {
          const statusCode = NOT_FOUND.has(err.code) ? 404 : UNAUTHORIZED.has(err.code) ? 401 : FORBIDDEN.has(err.code) ? 403 : 422;
          res.status(statusCode).json({ error: err.message, code: err.code });
        } else {
          console.error(err);
          res.status(500).json({ error: "Internal server error" });
        }
      }
    });
  }
  return router;
}
