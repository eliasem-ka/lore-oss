import { relations } from "drizzle-orm";
import {
  projects,
  rounds,
  knowledgeUnits,
  unitVersions,
  feedback,
  entities,
  unitEntities,
  unitExternalLinks,
  users,
  workspaces,
  workspaceMembers,
} from "./schema.js";

export const usersRelations = relations(users, ({ many }) => ({
  workspaceMembers: many(workspaceMembers),
}));

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  members: many(workspaceMembers),
  projects: many(projects),
  rounds: many(rounds),
  knowledgeUnits: many(knowledgeUnits),
}));

export const workspaceMembersRelations = relations(workspaceMembers, ({ one }) => ({
  workspace: one(workspaces, { fields: [workspaceMembers.workspaceId], references: [workspaces.id] }),
  user: one(users, { fields: [workspaceMembers.userId], references: [users.id] }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [projects.workspaceId], references: [workspaces.id] }),
  rounds: many(rounds),
  knowledgeUnits: many(knowledgeUnits),
}));

export const roundsRelations = relations(rounds, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [rounds.workspaceId], references: [workspaces.id] }),
  project: one(projects, { fields: [rounds.projectId], references: [projects.id] }),
  knowledgeUnits: many(knowledgeUnits),
}));

export const knowledgeUnitsRelations = relations(knowledgeUnits, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [knowledgeUnits.workspaceId], references: [workspaces.id] }),
  project: one(projects, { fields: [knowledgeUnits.projectId], references: [projects.id] }),
  round: one(rounds, { fields: [knowledgeUnits.roundId], references: [rounds.id] }),
  parent: one(knowledgeUnits, { fields: [knowledgeUnits.parentId], references: [knowledgeUnits.id], relationName: "unit_hierarchy" }),
  children: many(knowledgeUnits, { relationName: "unit_hierarchy" }),
  unitVersions: many(unitVersions),
  feedback: many(feedback),
  unitEntities: many(unitEntities),
}));

export const unitVersionsRelations = relations(unitVersions, ({ one }) => ({
  unit: one(knowledgeUnits, { fields: [unitVersions.unitId], references: [knowledgeUnits.id] }),
}));

export const feedbackRelations = relations(feedback, ({ one }) => ({
  unit: one(knowledgeUnits, { fields: [feedback.unitId], references: [knowledgeUnits.id] }),
}));

export const entitiesRelations = relations(entities, ({ many }) => ({
  unitEntities: many(unitEntities),
}));

export const unitEntitiesRelations = relations(unitEntities, ({ one }) => ({
  unit: one(knowledgeUnits, { fields: [unitEntities.unitId], references: [knowledgeUnits.id] }),
  entity: one(entities, { fields: [unitEntities.entityKey], references: [entities.key] }),
}));

export const unitExternalLinksRelations = relations(unitExternalLinks, ({ one }) => ({
  unit: one(knowledgeUnits, { fields: [unitExternalLinks.unitId], references: [knowledgeUnits.id] }),
}));
