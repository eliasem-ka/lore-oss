# Phase 0 — Research & Decisions: Architecture Knowledge

All "NEEDS CLARIFICATION" were resolved with the user before drafting (hybrid-by-confidence
lifecycle, feature→layer hierarchy, onboarding scope). The remaining decisions below are
implementation choices grounded in the existing codebase (`server/src/services/loop.ts`,
`db/schema.ts`, `api/router.ts`, `mcp/server.ts`).

---

## D1 — Generalize `rules` in place vs. a new `architecture_units` table

**Decision**: Extend the existing `rules` table into a multi-kind **knowledge unit** by adding
nullable columns (`projectId`, `kind`, `parentId`, `unitType`, `content`). Keep the physical table
named `rules` for this phase.

**Rationale**: The loop machinery — versioning (`ruleVersions`), feedback (`feedback`), embeddings,
source-overlap detection, and the FSM in `loop.ts` — is entirely kind-agnostic. A new table would
force duplicating all of that wiring and would split the single FSM the constitution mandates
(Principle I). Extending in place keeps one lifecycle, one feedback queue, one search path.

**Alternatives considered**:
- *Separate `architecture_units` table* — rejected: duplicates versioning/feedback/embedding wiring;
  two FSMs to keep in sync; breaks "one shared place" for invariants.
- *Rename `rules` → `knowledge_units` now* — rejected for this phase: high churn across `loop.ts`,
  `relations.ts`, `router.ts`, `mcp/server.ts`, tests, and the client, with no behavioral benefit.
  Recorded as an optional cosmetic follow-up. The table keeps the name `rules` but conceptually stores
  knowledge units of multiple kinds.

**Consequence — nullability**: `flow`, `productDescription`, `technicalDescription` are currently
`NOT NULL` and are business-rule-shaped. They become **nullable**; per-kind required-field validation
moves to Zod + the service layer (`business_rule` requires them; `architecture` requires `content`).
This is a migration-first change (Principle IV).

---

## D2 — Architecture content storage shape

**Decision**: Store architecture-specific fields in a single typed `content` jsonb column; reuse the
existing `sources[]` jsonb for source-linked "Key files" evidence; store diagrams as Mermaid **text**.

`content` (kind=architecture):
```jsonc
{
  "overview": "string",
  "techStack": { "endpoints": [], "libraries": [], "persistence": [] },
  "entryPoints": ["string"],
  "layer": "ui|domain|data|...",          // sub-units only
  "patterns": ["MVI", "Repository"],
  "dependencies": ["featureKeyA", "featureKeyB"],
  "diagrams": [{ "type": "c4_context|c4_container|c4_component|sequence|call_graph",
                 "format": "mermaid", "source": "..." }],
  "risk": { "level": "low|medium|high", "notes": "string" },
  "provenance": { "indexCommit": "sha", "generatedAt": "ISO-8601" }
}
```

**Rationale**: `sources[]` already powers non-blocking source-overlap warnings (`detectSourceOverlaps`)
— reusing it gives architecture units that behavior for free and matches the "Key files" data (path,
lines, symbol, sha) verbatim. Diagrams as text are versionable/diff-able and re-renderable; storing
rendered HTML would be opaque and un-diffable. A single jsonb column avoids premature normalization
while Postgres jsonb operators still allow querying.

**Alternatives considered**:
- *Fully normalized tables* (endpoints, files, diagrams, deps) — rejected for MVP: 4–6 new tables for
  data that is read as a whole; normalize hot paths later if needed.
- *Store rendered HTML* — rejected: not queryable, not diff-able; defeats "structured in the backend".

---

## D3 — `published` lifecycle state (hybrid by confidence) without violating Principle III

**Decision**: Add a new status `published` to the status enum, distinct from `approved`.

- `kind=architecture` + `confidence=high` → `published` (auto-surfaced, searchable immediately)
- `kind=architecture` + `confidence∈{medium,low}` → `in_review`
- `kind=business_rule` → always `in_review` (unchanged)
- `approved` is written **only** by `submitVerdict` (human). No agent path writes `approved`.
- A reviewer may act on a `published` unit: approve → `approved`, or reject/clarify (+comment) →
  `rejected`.
- **Human-verdict precedence**: if a unit already has any human feedback row (i.e. a human has judged
  it), a later agent resubmission creates a new version in `in_review`, never `published` and never
  `approved`.

**Rationale**: Principle III forbids any path that auto-approves agent output. `published` is a
clearly separate machine-surfaced state, so the human gate to `approved` is intact while
high-confidence architecture is still useful immediately. This is exactly the user-chosen
hybrid-by-confidence model.

**Status enum becomes**: `in_review | approved | rejected | refining | published`.
(`refining` remains declared and used by `listPendingFeedback`/`submitRefinement` queries as today;
this plan does not change the existing `rejected` vs `refining` behavior.)

**Default search visibility**: architecture queries return `published` + `approved` by default; an
explicit `status=approved` query excludes unreviewed `published` units (satisfies FR-025).

---

## D4 — Project as a first-class dimension + migration backfill

**Decision**: Add a `projects` table (`id`, `key` unique, `name`, `platform`, `repoUrl`,
`gitnexusRepoId`, `defaultRef`, timestamps). Add `projectId` FK to both `rounds` and `rules`.
`start_round` and `submit_architecture_unit` accept a `projectKey`; projects are created/upserted via
`register_project`. The migration creates a `default` project and backfills all existing rows to it,
then `projectId` is `NOT NULL`.

**Rationale**: FR-001/002 require projects as the top-level grouping and the agnostic backbone for
multi-repo/platform. Backfilling a default project preserves all existing business-rule data (SC-006,
Principle IV) with no loss.

**Conflict detection**: `detectRoundConflicts` currently scans **all** open rounds globally. It will
filter to the same `projectId`, so two projects never falsely conflict (FR-003).

**Identity/dedup**: `ruleKey` uniqueness becomes effectively per-project for architecture units.
Decision: keep the global-unique `ruleKey` but namespace architecture keys by project
(e.g. `arch:acme-shop-web:checkout`) so the existing unique-key dedup path is reused unchanged and
cross-project name collisions (FR-004, edge case) cannot merge.

**Alternatives considered**:
- *Auto-create project on `start_round`* — rejected: explicit `register_project` keeps project
  metadata (platform, repo, ref) intentional and is what the future onboarding CLI will call.

---

## D5 — Hierarchy (feature → layer)

**Decision**: Self-referential `parentId` on `rules` (nullable FK → `rules.id`) plus `unitType`
(`feature | layer | component`). A feature unit has `parentId = null`; layer sub-units point to it.
Add a Drizzle self-relation (`parent`/`children`) so `get_rule` can return children.

**Rationale**: Two-level hierarchy is all this phase needs (assumption in spec). A self-reference is
the minimal, query-friendly representation and avoids a join table. Orphaned children (parent removed)
are tolerated: retrieval returns the child with a null parent (edge case).

---

## D6 — Architecture-aware embeddings

**Decision**: Generalize the embedding-text builder. For `business_rule`, embed
`title + productDescription + technicalDescription` (unchanged). For `architecture`, embed
`title + content.overview + tech-stack summary`. Best-effort as today (null embedding if the model is
down; `EMBEDDING_PROVIDER=none` in tests).

**Rationale**: Keeps semantic search useful for architecture ("which feature initializes currency
conversion?") while reusing the existing dense+sparse RRF hybrid search in `searchCatalog`. No vector
ever crosses the MCP/REST boundary (existing constraint preserved).

---

## D7 — Staleness detection

**Decision**: Add `listStaleUnits(projectKey, ref?)` comparing each architecture unit's
`content.provenance.indexCommit` against the project's `defaultRef` (or a supplied `ref`). Units whose
recorded commit differs from the reference are flagged. Exposed as `GET /api/projects/:key/stale` and
MCP `list_stale_units`.

**Rationale**: FR-012/SC-009 require *detection* only; how the reference ref is updated and any
auto-re-extraction are explicitly out of scope. String inequality of commit shas is sufficient for
"potentially stale"; ancestry/`git`-distance is unnecessary for the flag.

---

## D8 — `extract_architecture` MCP prompt

**Decision**: Add an `extract_architecture` MCP prompt mirroring the existing tool-aware
`extract_rules` methodology: detect tools (GitNexus-first), enumerate modules/features, emit a feature
root unit + layer sub-units, attach source-linked evidence and provenance, submit via
`submit_architecture_unit`, then handle rejection feedback via the existing refine path.

**Rationale**: Methodology stays server-side (centrally updatable), keeping repos thin — consistent
with the product direction. This is a prompt (guidance), not a new transition, so it carries no FSM
risk.

---

## Open questions for later phases (not blocking)

- Rename `rules` → `knowledge_units` (cosmetic; deferred).
- `unit_edges` table for a queryable dependency/parity graph (explicitly out of scope).
- The `acme-docs` HTML → unit importer (writes to this phase's storage target).
- Whether `submit_verdict` should ever gain an MCP surface (currently human/REST-only by design).
