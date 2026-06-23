import {
  pgTable,
  uuid,
  text,
  jsonb,
  integer,
  timestamp,
  index,
  primaryKey,
  unique,
  vector,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

export type EntityRole = "applies_to" | "excludes" | "requires" | "modifies";
export type SourceKind = "gitnexus" | "repo" | "docs" | "generic";
// `published` (new): high-confidence architecture auto-surfaced by the agent. It is
// searchable but DISTINCT from `approved` — only a human verdict reaches `approved`.
// FSM states: in_review → approved | rejected; rejected → in_review (refine); published → approved.
export type RuleStatus =
  | "in_review"
  | "approved"
  | "rejected"
  | "published";
export type Confidence = "high" | "medium" | "low";
export type Verdict = "approved" | "rejected" | "needs_clarification";
export type RoundStatus = "open" | "completed";
export type FeedbackStatus = "pending" | "resolved";

// ── Knowledge-unit generalization ────────────────────────────────────────────
export type Platform = "android" | "ios" | "web" | "backend" | "other";
export type Kind = "business_rule" | "architecture";
export type UnitType = "feature" | "layer" | "component";

export type Source = {
  path?: string;
  symbol?: string;
  lines?: string;
  sha?: string;
  tool?: string;
  note?: string;
};

export type RoundScope = { flows?: string[]; paths?: string[] };

// Structured content for kind=business_rule units (stored in `content` jsonb).
export type BusinessRuleContent = {
  productDescription: string;
  technicalDescription: string;
  decisionLogic?: Record<string, unknown>;
  openQuestions?: string[];
};

// Structured content for kind=architecture units. Diagrams are stored as Mermaid
// TEXT (never rendered HTML); provenance.indexCommit drives staleness detection.
export type DiagramType =
  | "c4_context"
  | "c4_container"
  | "c4_component"
  | "sequence"
  | "call_graph";

export type ArchitectureContent = {
  overview: string;
  techStack?: { endpoints?: string[]; libraries?: string[]; persistence?: string[] };
  entryPoints?: string[];
  layer?: string;
  patterns?: string[];
  dependencies?: string[];
  diagrams?: { type: DiagramType; format: "mermaid"; source: string }[];
  risk?: { level: "low" | "medium" | "high"; notes?: string };
  provenance: { indexCommit?: string; generatedAt?: string };
};

// Discriminated union of all possible `content` shapes.
export type UnitContent = BusinessRuleContent | ArchitectureContent;

// ── Users (declared early so workspaceMembers can reference it) ────────────────
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").unique().notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("reviewer"),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Workspaces (multi-tenant) ──────────────────────────────────────────────────
export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").unique().notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })]
);

// Top-level grouping: one row per repository/codebase. The agnostic backbone —
// every round and every knowledge unit belongs to exactly one project.
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    key: text("key").notNull(),
    name: text("name").notNull(),
    platform: text("platform").notNull().$type<Platform>(),
    repoUrl: text("repo_url"),
    gitnexusRepoId: text("gitnexus_repo_id"),
    defaultRef: text("default_ref"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("projects_ws_idx").on(t.workspaceId),
    // Project keys are unique PER WORKSPACE, never globally (mirrors unit_key).
    unique("projects_ws_key_unique").on(t.workspaceId, t.key),
  ]
);

export const rounds = pgTable(
  "rounds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    sourceLabel: text("source_label").notNull(),
    sourceKind: text("source_kind").notNull().$type<SourceKind>(),
    toolsDetected: jsonb("tools_detected").$type<string[]>().default([]),
    scope: jsonb("scope").$type<RoundScope>(),
    ownerName: text("owner_name"),
    status: text("status").notNull().default("open").$type<RoundStatus>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
  },
  (t) => [
    index("rounds_ws_idx").on(t.workspaceId),
  ]
);

// `knowledgeUnits` stores **knowledge units** of multiple kinds (business_rule | architecture).
// All kind-specific payload lives in `content` (typed UnitContent). Flow/subflow are
// business-rule-specific but retained as top-level columns for filtering.
// Per-kind required fields are enforced in the service layer + Zod, not the DB.
export const knowledgeUnits = pgTable(
  "knowledge_units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    kind: text("kind").notNull().default("business_rule").$type<Kind>(),
    unitType: text("unit_type").$type<UnitType>(),
    parentId: uuid("parent_id").references((): AnyPgColumn => knowledgeUnits.id),
    unitKey: text("unit_key"),
    title: text("title").notNull(),
    flow: text("flow"),
    subflow: text("subflow"),
    status: text("status").notNull().default("in_review").$type<RuleStatus>(),
    confidence: text("confidence").notNull().$type<Confidence>(),
    content: jsonb("content").$type<UnitContent>(),
    sources: jsonb("sources").$type<Source[]>().default([]),
    currentVersion: integer("current_version").notNull().default(1),
    roundId: uuid("round_id").references(() => rounds.id),
    embedding: vector("embedding", { dimensions: 384 }),
    embeddingModel: text("embedding_model"),
    searchText: text("search_text"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("knowledge_units_status_idx").on(t.status),
    index("knowledge_units_flow_idx").on(t.flow),
    index("knowledge_units_project_idx").on(t.projectId),
    index("knowledge_units_kind_idx").on(t.kind),
    index("knowledge_units_parent_idx").on(t.parentId),
    index("knowledge_units_ws_idx").on(t.workspaceId),
    unique("knowledge_units_ws_unit_key_unique").on(t.workspaceId, t.unitKey),
  ]
);

export const unitVersions = pgTable("unit_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  unitId: uuid("unit_id")
    .notNull()
    .references(() => knowledgeUnits.id),
  version: integer("version").notNull(),
  snapshot: jsonb("snapshot").notNull().$type<Record<string, unknown>>(),
  createdBy: text("created_by").notNull(),
  changeNote: text("change_note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const feedback = pgTable("feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  unitId: uuid("unit_id")
    .notNull()
    .references(() => knowledgeUnits.id),
  unitVersion: integer("unit_version").notNull(),
  verdict: text("verdict").notNull().$type<Verdict>(),
  comment: text("comment"),
  reviewerName: text("reviewer_name").notNull(),
  reviewerRole: text("reviewer_role"),
  status: text("status").notNull().default("pending").$type<FeedbackStatus>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

// ── Domain Entities ────────────────────────────────────────────────────────────

export const entities = pgTable("entities", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").unique().notNull(),
  category: text("category").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  attributes: jsonb("attributes").$type<Record<string, unknown>>(),
  source: text("source").notNull().default("manual"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const unitEntities = pgTable(
  "unit_entities",
  {
    unitId: uuid("unit_id")
      .notNull()
      .references(() => knowledgeUnits.id, { onDelete: "cascade" }),
    entityKey: text("entity_key")
      .notNull()
      .references(() => entities.key, { onDelete: "cascade" }),
    role: text("role").notNull().default("applies_to").$type<EntityRole>(),
  },
  (t) => [primaryKey({ columns: [t.unitId, t.entityKey] })]
);

export const flowPolicies = pgTable("flow_policies", {
  flow: text("flow").primaryKey(),
  minApproveRole: text("min_approve_role").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const unitExternalLinks = pgTable(
  "unit_external_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    unitId: uuid("unit_id").notNull().references(() => knowledgeUnits.id, { onDelete: "cascade" }),
    system: text("system").notNull(),
    externalKey: text("external_key").notNull(),
    url: text("url").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("unit_external_links_unit_system_unique").on(t.unitId, t.system),
    index("unit_external_links_unit_idx").on(t.unitId),
  ]
);
