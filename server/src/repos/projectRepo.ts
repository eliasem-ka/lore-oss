import { and, eq, sql } from "drizzle-orm";
import { projects } from "../db/schema.js";
import type { DB } from "../db/index.js";
import type { RegisterProjectInput } from "../schemas/project.js";

export type Project = typeof projects.$inferSelect;

export async function upsertProject(input: RegisterProjectInput, workspaceId: string, db: DB): Promise<Project> {
  const [project] = await db
    .insert(projects)
    .values({
      workspaceId,
      key: input.key,
      name: input.name,
      platform: input.platform,
      repoUrl: input.repoUrl,
      gitnexusRepoId: input.gitnexusRepoId,
      defaultRef: input.defaultRef,
    })
    .onConflictDoUpdate({
      // Per-workspace key uniqueness (0014). A conflict matches only the same
      // (workspace, key) pair, so an upsert can never reassign another workspace's
      // project — a foreign key collides on nothing and INSERTs a fresh row.
      target: [projects.workspaceId, projects.key],
      set: {
        name: input.name,
        platform: input.platform,
        repoUrl: input.repoUrl ?? sql`excluded.repo_url`,
        gitnexusRepoId: input.gitnexusRepoId ?? sql`excluded.gitnexus_repo_id`,
        defaultRef: input.defaultRef ?? sql`excluded.default_ref`,
        updatedAt: sql`now()`,
      },
    })
    .returning();
  return project;
}

export async function findProjectByKey(key: string, workspaceId: string, db: DB): Promise<Project | undefined> {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.key, key), eq(projects.workspaceId, workspaceId)));
  return project;
}

export async function listAllProjects(workspaceId: string, db: DB): Promise<Project[]> {
  return db.select().from(projects)
    .where(eq(projects.workspaceId, workspaceId))
    .orderBy(projects.key);
}
