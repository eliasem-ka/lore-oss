import type { Request, Response } from "express";
import type { ZodType, ZodRawShape } from "zod";
import type { EventBus } from "../domain/events.js";
import type { AuthUser } from "../services/auth.js";

export type Ctx = { bus: EventBus; user?: AuthUser; workspaceId?: string };

export type RestSpec = {
  method: "get" | "post" | "put" | "delete";
  path: string;                                   // mounted under /api
  input?: (req: Request) => unknown;              // default: GET→req.query else req.body
  status?: number;                                // default 200
  public?: boolean;                               // when true, no auth required
  // When present, the transport calls this INSTEAD of res.status().json(result) —
  // for raw content-typed output (e.g. text/markdown export).
  respond?: (res: Response, out: unknown) => void;
};

export type McpSpec<I, O> = {
  tool: string;
  description: string;
  shape: ZodRawShape;                             // raw shape for the MCP SDK
  render: (out: O, input: I) => string;
};

export type Capability<I = unknown, O = unknown> = {
  name: string;
  input: ZodType<I>;
  handler: (input: I, ctx: Ctx) => Promise<O>;
  rest?: RestSpec | false;
  mcp?: McpSpec<I, O> | false;
};

export function defineCapability<I, O>(c: Capability<I, O>): Capability<I, O> {
  if (!c.rest && !c.mcp) {
    throw new Error(`Capability "${c.name}" must expose at least one of rest/mcp`);
  }
  return c;
}
