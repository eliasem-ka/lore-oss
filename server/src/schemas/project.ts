import { z } from "zod";

export const PlatformSchema = z.enum(["android", "ios", "web", "backend", "other"]);

export const RegisterProjectSchema = z.object({
  key: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, {
    message: "key must be a lowercase slug (e.g. acme-shop-web)",
  }),
  name: z.string().min(1),
  platform: PlatformSchema,
  repoUrl: z.string().optional(),
  gitnexusRepoId: z.string().optional(),
  defaultRef: z.string().optional(),
});

export type RegisterProjectInput = z.infer<typeof RegisterProjectSchema>;
