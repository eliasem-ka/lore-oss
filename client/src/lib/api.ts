import { TOKEN_KEY } from "./auth";

const BASE = "/api";

// Active workspace id — written by WorkspaceProvider, read on every request.
// api.ts is not a React component, so (like the auth token) it can't read the
// hook; the provider pushes the current value here via setActiveWorkspaceId.
const WORKSPACE_KEY = "lore_ws";
let activeWorkspaceId: string | null = localStorage.getItem(WORKSPACE_KEY);

export function setActiveWorkspaceId(id: string | null): void {
  activeWorkspaceId = id;
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (activeWorkspaceId) headers["X-Workspace-Id"] = activeWorkspaceId;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.assign("/login");
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(new Error(err.error ?? "Request failed"), { code: err.code, status: res.status });
  }
  return res.json();
}

export const api = {
  workspaces: {
    list: () => req<Workspace[]>("GET", "/workspaces"),
  },
  flowPolicies: {
    list: () => req<FlowPolicy[]>("GET", "/flow-policies"),
  },
  rules: {
    list: (params?: { status?: string; flow?: string; query?: string; confidence?: string; kind?: string }) => {
      const qs = new URLSearchParams(
        Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v !== undefined)) as Record<string, string>
      ).toString();
      return req<Rule[]>("GET", `/rules${qs ? `?${qs}` : ""}`);
    },
    get: (id: string) => req<RuleDetail>("GET", `/rules/${id}`),
    submit: (body: unknown) => req<SubmitCandidateResult>("POST", "/rules", body),
    feedback: (id: string, body: unknown) => req<Rule>("POST", `/rules/${id}/feedback`, body),
    bulkFeedback: (body: unknown) => req<BulkFeedbackResult[]>("POST", "/rules/bulk-feedback", body),
    refine: (id: string, body: unknown) => req<Rule>("POST", `/rules/${id}/refine`, body),
  },
  entities: {
    list: (category?: string) =>
      req<Entity[]>("GET", `/entities${category ? `?category=${encodeURIComponent(category)}` : ""}`),
    get: (key: string) => req<EntityWithRules>("GET", `/entities/${key}`),
    create: (body: unknown) => req<Entity>("POST", "/entities", body),
    update: (key: string, body: unknown) => req<Entity>("PUT", `/entities/${key}`, body),
    delete: (key: string) => req<{ ok: boolean }>("DELETE", `/entities/${key}`),
    link: (body: { ruleId: string; entityKey: string; role: string }) =>
      req<{ ok: boolean }>("POST", "/entities/link", body),
    unlink: (body: { ruleId: string; entityKey: string }) =>
      req<{ ok: boolean }>("DELETE", "/entities/link", body),
  },
  progress: () => req<Progress>("GET", "/progress"),
  pendingFeedback: (flow?: string) =>
    req<Rule[]>("GET", `/feedback/pending${flow ? `?flow=${flow}` : ""}`),
  rounds: {
    list: () => req<Round[]>("GET", "/rounds"),
    create: (body: unknown) => req<CreateRoundResult>("POST", "/rounds", body),
    complete: (id: string) => req<Round>("POST", `/rounds/${id}/complete`),
  },
};

export type Workspace = {
  id: string;
  key: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type EntityRole = "applies_to" | "excludes" | "requires" | "modifies";

export type EntityLink = {
  key: string;
  name: string;
  category: string;
  role: EntityRole;
};

export type Entity = {
  id: string;
  key: string;
  category: string;
  name: string;
  description: string | null;
  attributes: Record<string, unknown> | null;
  source: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EntityWithRules = Entity & {
  rules: { id: string; title: string; flow: string; status: string; role: EntityRole }[];
};

export type Diagram = {
  type: "c4_context" | "c4_container" | "c4_component" | "sequence" | "call_graph" | string;
  format: "mermaid" | string;
  source: string;
};

export type ArchitectureContent = {
  layer?: string;
  overview?: string;
  techStack?: {
    endpoints?: string[];
    libraries?: string[];
    persistence?: string[];
    [k: string]: string[] | undefined;
  };
  entryPoints?: string[];
  patterns?: string[];
  dependencies?: string[];
  diagrams?: Diagram[];
  risk?: { level?: string; notes?: string };
  provenance?: { indexCommit?: string; generatedAt?: string };
};

export type BusinessRuleContent = {
  productDescription?: string;
  technicalDescription?: string;
  decisionLogic?: Record<string, unknown> | null;
  openQuestions?: string[];
};

export type UnitRef = { id: string; title: string; unitType: string | null; status: string };

export type Rule = {
  id: string;
  unitKey: string | null;
  kind?: "business_rule" | "architecture" | string;
  unitType?: "feature" | "layer" | "component" | null;
  parentId?: string | null;
  title: string;
  flow: string;
  subflow: string | null;
  status: "in_review" | "approved" | "rejected" | "refining" | "published";
  confidence: "high" | "medium" | "low";
  content?: ArchitectureContent & BusinessRuleContent | null;
  sources: Source[];
  currentVersion: number;
  roundId: string | null;
  createdAt: string;
  updatedAt: string;
  entities?: EntityLink[];
  feedback?: FeedbackItem[];
  unitVersions?: RuleVersion[];
};

export type ExternalLink = {
  system: string;
  externalKey: string;
  url: string;
};

export type RuleDetail = Rule & {
  feedback: FeedbackItem[];
  unitVersions: RuleVersion[];
  parent?: UnitRef | null;
  children?: UnitRef[];
  externalLinks?: ExternalLink[];
};

export type SubmitCandidateResult = {
  rule: Rule;
  merged: boolean;
  version: number;
  warnings: { type: string; existingRuleId: string; existingRuleTitle: string; overlapSource: string }[];
  relatedApproved: { id: string; title: string; unitKey: string | null }[];
};

export type BulkFeedbackResult = {
  ruleId: string;
  ok: boolean;
  error?: string;
};

export type FeedbackItem = {
  id: string;
  unitId: string;
  unitVersion: number;
  verdict: "approved" | "rejected" | "needs_clarification";
  comment: string | null;
  reviewerName: string;
  reviewerRole: string | null;
  status: "pending" | "resolved";
  createdAt: string;
  resolvedAt: string | null;
};

export type RuleVersion = {
  id: string;
  unitId: string;
  version: number;
  snapshot: Record<string, unknown>;
  createdBy: string;
  changeNote: string | null;
  createdAt: string;
};

export type Source = {
  path?: string;
  symbol?: string;
  lines?: string;
  sha?: string;
  tool?: string;
  note?: string;
};

export type RoundScope = { flows?: string[]; paths?: string[] };

export type Round = {
  id: string;
  sourceLabel: string;
  sourceKind: string;
  scope: RoundScope | null;
  ownerName: string | null;
  status: "open" | "completed";
  createdAt: string;
  completedAt: string | null;
};

export type RoundConflict = {
  type: "scope_overlap";
  conflictingRoundId: string;
  conflictingRoundLabel: string;
  conflictingOwner: string | null;
  overlapFlows?: string[];
};

export type CreateRoundResult = {
  round: Round;
  conflicts: RoundConflict[];
};

export type Progress = {
  totals: { in_review: number; approved: number; rejected: number; refining: number };
  byFlow: Record<string, { in_review: number; approved: number; rejected: number; refining: number }>;
  openRounds: Round[];
};

export type FlowPolicy = {
  flow: string;
  minApproveRole: string;
};
