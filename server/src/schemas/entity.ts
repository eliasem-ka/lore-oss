import { z } from "zod";

export const EntityRoleSchema = z.enum(["applies_to", "excludes", "requires", "modifies"]);

export const DefineEntitySchema = z.object({
  key: z.string().regex(/^[a-z_]+\.[a-z0-9_]+$/, {
    message: "key must be in format category.name (e.g. customer_type.vip)",
  }),
  category: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  attributes: z.record(z.unknown()).optional(),
  source: z.string().optional(),
});

export const UpdateEntitySchema = DefineEntitySchema.omit({ key: true }).partial();

export const LinkRuleEntitySchema = z.object({
  ruleId: z.string().uuid(),
  entityKey: z.string().min(1),
  role: EntityRoleSchema.default("applies_to"),
});

export const ListEntitiesSchema = z.object({
  category: z.string().optional(),
  includeDeleted: z.coerce.boolean().default(false),
});

export type DefineEntityInput = z.infer<typeof DefineEntitySchema>;
export type UpdateEntityInput = z.infer<typeof UpdateEntitySchema>;
export type LinkRuleEntityInput = z.infer<typeof LinkRuleEntitySchema>;
export type ListEntitiesInput = z.infer<typeof ListEntitiesSchema>;
