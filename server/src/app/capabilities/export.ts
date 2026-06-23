import type { Response } from "express";
import { defineCapability, type Capability } from "../registry.js";
import { exportCatalog } from "../../services/export.js";
import { LoopError } from "../../services/loop.js";
import { ExportCatalogSchema } from "../../schemas/export.js";

export const exportCapabilities: Capability<any, any>[] = [
  defineCapability({
    name: "exportCatalog",
    input: ExportCatalogSchema,
    handler: (input, ctx) => {
      if (!ctx.workspaceId) throw new LoopError("No active workspace", "FORBIDDEN");
      return exportCatalog(input as any, ctx.workspaceId);
    },
    rest: {
      method: "get",
      path: "/export",
      respond: (res: Response, out: any) => res.type(out.contentType).send(out.body),
    },
    mcp: {
      tool: "export_catalog",
      description:
        "Export the catalog as JSON or Markdown (default approved units). Filter by projectKey, kind, flow, status. Markdown is ready to paste into Confluence/Notion or feed a RAG pipeline.",
      shape: ExportCatalogSchema.shape,
      render: (out: any) => out.body,
    },
  }),
];
