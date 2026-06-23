import { z } from "zod";

export const ExportCatalogSchema = z.object({
  format: z.enum(["json", "markdown"]).default("json"),
  projectKey: z.string().optional(),
  kind: z.enum(["business_rule", "architecture"]).optional(),
  flow: z.string().optional(),
  status: z.enum(["in_review", "approved", "rejected", "published"]).optional(),
});
export type ExportCatalogInput = z.infer<typeof ExportCatalogSchema>;
