import { z } from "zod";
import { SourceSchema } from "./rule.js";

export const UnitTypeSchema = z.enum(["feature", "layer", "component"]);

export const DiagramSchema = z.object({
  type: z.enum(["c4_context", "c4_container", "c4_component", "sequence", "call_graph"]),
  format: z.literal("mermaid"),
  source: z.string().min(1),
});

export const ArchitectureContentSchema = z.object({
  overview: z.string().min(10),
  techStack: z
    .object({
      endpoints: z.array(z.string()).default([]),
      libraries: z.array(z.string()).default([]),
      persistence: z.array(z.string()).default([]),
    })
    .optional(),
  entryPoints: z.array(z.string()).default([]),
  layer: z.string().optional(),
  patterns: z.array(z.string()).default([]),
  dependencies: z.array(z.string()).default([]),
  diagrams: z.array(DiagramSchema).default([]),
  risk: z
    .object({ level: z.enum(["low", "medium", "high"]), notes: z.string().optional() })
    .optional(),
  provenance: z.object({
    indexCommit: z.string().optional(),
    generatedAt: z.string().optional(),
  }),
});

// Base object (exposed as `.shape` for the MCP tool, which needs a raw ZodRawShape).
export const SubmitArchitectureUnitShape = z.object({
  projectKey: z.string().min(1),
  ruleKey: z.string().optional(),
  title: z.string().min(3),
  unitType: UnitTypeSchema,
  parentId: z.string().uuid().optional(),
  confidence: z.enum(["high", "medium", "low"]),
  roundId: z.string().uuid().optional(),
  sources: z.array(SourceSchema).default([]),
  content: ArchitectureContentSchema,
  entityLinks: z
    .array(
      z.object({
        key: z.string().min(1),
        role: z.enum(["applies_to", "excludes", "requires", "modifies"]).default("applies_to"),
      })
    )
    .default([]),
});

// Refined schema for parsing/validation (layer units must declare a parent).
export const SubmitArchitectureUnitSchema = SubmitArchitectureUnitShape.refine(
  (d) => d.unitType !== "layer" || !!d.parentId,
  { message: "parentId is required when unitType is 'layer'", path: ["parentId"] }
);

export const ListStaleUnitsSchema = z.object({
  projectKey: z.string().min(1),
  ref: z.string().optional(),
});

export type SubmitArchitectureUnitInput = z.infer<typeof SubmitArchitectureUnitSchema>;
export type ListStaleUnitsInput = z.infer<typeof ListStaleUnitsSchema>;
