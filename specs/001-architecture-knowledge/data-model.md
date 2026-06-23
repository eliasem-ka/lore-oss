# Phase 1 — Data Model: Architecture Knowledge

Drizzle schema changes in `server/src/db/schema.ts` + `relations.ts`, shipped as migration
`0004_architecture_knowledge.sql` (Principle IV). Reused tables (`ruleVersions`, `feedback`,
`entities`, `ruleEntities`) are unchanged.

## New table: `projects`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | `defaultRandom()` |
| `key` | text UNIQUE NOT NULL | stable slug, e.g. `acme-shop-web` |
| `name` | text NOT NULL | display name |
| `platform` | text NOT NULL | `android \| ios \| web \| backend \| other` |
| `repoUrl` | text NULL | source location |
| `gitnexusRepoId` | text NULL | link to the GitNexus index |
| `defaultRef` | text NULL | reference revision for staleness (e.g. branch HEAD sha) |
| `createdAt` | timestamp NOT NULL | `defaultNow()` |
| `updatedAt` | timestamp NOT NULL | `defaultNow()` |

`platform` type: `export type Platform = "android" | "ios" | "web" | "backend" | "other";`

## Changed table: `rules` (now a multi-kind **knowledge unit**)

New columns (all additive):

| Column | Type | Notes |
|--------|------|-------|
| `projectId` | uuid FK→`projects.id` | **NOT NULL after backfill**; every unit belongs to a project |
| `kind` | text NOT NULL default `business_rule` | `business_rule \| architecture` |
| `parentId` | uuid NULL FK→`rules.id` | hierarchy: a layer's feature; null for feature/business_rule |
| `unitType` | text NULL | `feature \| layer \| component` (architecture only) |
| `content` | jsonb NULL | architecture content (see shape below); null for business_rule |

Nullability changes (were `NOT NULL`, now nullable — required-per-kind in service/Zod):

| Column | Before | After | Required for |
|--------|--------|-------|--------------|
| `flow` | NOT NULL | NULL | business_rule (architecture may omit; grouped by project + unitType) |
| `productDescription` | NOT NULL | NULL | business_rule |
| `technicalDescription` | NOT NULL | NULL | business_rule |

Type changes:

```ts
export type Kind = "business_rule" | "architecture";
export type UnitType = "feature" | "layer" | "component";
export type RuleStatus = "in_review" | "approved" | "rejected" | "refining" | "published"; // +published
```

Unchanged reused columns: `id`, `ruleKey` (unique; architecture keys namespaced
`arch:<projectKey>:<slug>`), `title`, `status`, `confidence`, `decisionLogic`, `sources`,
`openQuestions`, `currentVersion`, `roundId`, `embedding`, `embeddingModel`, timestamps.

Indexes: add `rules_project_idx (projectId)`, `rules_kind_idx (kind)`, `rules_parent_idx (parentId)`.

## Changed table: `rounds`

| Column | Type | Notes |
|--------|------|-------|
| `projectId` | uuid FK→`projects.id` | **NOT NULL after backfill** |

`scope` and conflict detection stay, but conflicts are evaluated **within** `projectId` (FR-003).

## `content` shape (kind=architecture)

```jsonc
{
  "overview": "string",                                   // required; feeds embedding
  "techStack": { "endpoints": ["string"], "libraries": ["string"], "persistence": ["string"] },
  "entryPoints": ["string"],
  "layer": "ui|domain|data|...",                          // sub-units (unitType=layer) only
  "patterns": ["string"],
  "dependencies": ["projectFeatureKey"],                  // other feature keys (same project)
  "diagrams": [
    { "type": "c4_context|c4_container|c4_component|sequence|call_graph",
      "format": "mermaid", "source": "string" }
  ],
  "risk": { "level": "low|medium|high", "notes": "string" },
  "provenance": { "indexCommit": "sha", "generatedAt": "ISO-8601" }   // required
}
```

`sources[]` (existing `Source` type) carries the "Key files" evidence: `{ path, lines, symbol, sha }`.

## Relations (`relations.ts`)

- `projects` → many `rounds`, many `rules`.
- `rounds.projectId` → one `projects`; `rules.projectId` → one `projects`.
- `rules` self-relation: `parent` (one, via `parentId`) and `children` (many).
- Existing `rules` ↔ `ruleVersions` / `feedback` / `ruleEntities` unchanged.

## Lifecycle (state machine)

States: `in_review`, `published`*(new)*, `approved`, `rejected`, `refining`.

```
                          submit (business_rule, any confidence)
                          submit (architecture, confidence ∈ {medium, low})
   [submit] ───────────────────────────────────────────────►  in_review
                                                                  │
   submit (architecture, confidence = high,                      │ submitVerdict(approved)   ── human only ──►  approved
           AND no prior human verdict)                           │ submitVerdict(rejected|needs_clarification + COMMENT) ─► rejected
        │                                                        │
        ▼                                                        ▼
    published ──── submitVerdict(approved) ── human only ──►  approved
        │      └── submitVerdict(rejected|clarify + COMMENT) ─► rejected
        │
   rejected ── submitRefinement ──► in_review   (addressed feedback marked resolved)
```

Guards (all in `services/loop.ts`):

| Guard | Rule | Source |
|-------|------|--------|
| **Auto-publish** | `architecture` + `high` + no prior human verdict → `published`; else `in_review` | FR-013/014, D3 |
| **Business-rule unchanged** | `business_rule` → always `in_review` | FR-006 |
| **Human-only approval** | `approved` written **only** by `submitVerdict` | FR-016, Principle III |
| **Verdict status guard** | `submitVerdict` accepts `in_review` **or** `published` (was `in_review` only) | FR-017 |
| **Comment required** | reject / needs_clarification require non-empty comment | FR-018 (reused) |
| **Human-verdict precedence** | resubmission of a unit with existing human feedback → `in_review`, never `published`/`approved` | FR-020, D3 |
| **Versioning** | resubmit by `ruleKey` → new version, not duplicate | FR-021 (reused) |
| **Project-scoped conflicts** | round conflict detection filtered by `projectId` | FR-003 |

## Migration `0004_architecture_knowledge.sql`

1. `CREATE TABLE projects (...)`.
2. `ALTER TABLE rules ADD COLUMN ...` (projectId nullable, kind default, parentId, unitType, content);
   alter `flow`/`productDescription`/`technicalDescription` to drop NOT NULL.
3. `ALTER TABLE rounds ADD COLUMN project_id ...` (nullable).
4. **Backfill**: `INSERT INTO projects (key, name, platform) VALUES ('default', 'Default', 'other')`;
   `UPDATE rules SET project_id = <default>; UPDATE rounds SET project_id = <default>;`
5. `ALTER TABLE rules ALTER COLUMN project_id SET NOT NULL;`
   `ALTER TABLE rounds ALTER COLUMN project_id SET NOT NULL;`
6. Add indexes; add FKs.

> Generated via `npm run db:generate` after editing `schema.ts`; the backfill (steps 4) is added to
> the generated SQL by hand-editing the migration **before** committing (the only sanctioned inline
> SQL — a data backfill inside a migration, not runtime DDL).

## Validation rules (Zod + service)

- `business_rule` submit: `flow`, `productDescription`, `technicalDescription` required (as today).
- `architecture` submit: `projectKey`, `unitType`, `content.overview`, `content.provenance` required;
  `parentId` required when `unitType=layer`; `confidence` drives publish/review.
- `platform` ∈ enum; `kind` ∈ enum; `unitType` ∈ enum.
- `diagrams[].format` currently must be `"mermaid"`.
