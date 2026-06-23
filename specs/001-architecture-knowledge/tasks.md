---
description: "Task list for Architecture Knowledge"
---

# Tasks: Architecture Knowledge

**Input**: Design documents from `/specs/001-architecture-knowledge/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: REQUIRED for this feature — Constitution Principle V ("Test the State Machine") and
SC-008 mandate integration coverage of every new transition/guard in
`server/src/services/loop.test.ts`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US4 (maps to spec.md user stories)
- All paths are repo-relative from `/Users/elias-space/StudioProjects/knowledge-loop/`

> **Shared-file note**: `server/src/services/loop.ts`, `api/router.ts`, and `mcp/server.ts` are each
> touched by multiple stories. Tasks editing the **same file** are never marked `[P]` together.
> Across stories, coordinate edits to `loop.ts` (different functions, but one file).

---

## Phase 1: Setup

- [x] T001 Confirm dev/test Postgres+pgvector is up (`docker compose up postgres -d`) and capture a green baseline `npm test` / `npm run build` from `server/` on branch `001-architecture-knowledge` before any change.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema generalization + project dimension that ALL stories depend on.

**⚠️ CRITICAL**: No user story can begin until this phase is complete and the migration is applied.

- [x] T002 Add types + extend status enum in `server/src/db/schema.ts`: `Platform` (`android|ios|web|backend|other`), `Kind` (`business_rule|architecture`), `UnitType` (`feature|layer|component`); add `published` to `RuleStatus`.
- [x] T003 Add `projects` table in `server/src/db/schema.ts` (`id`, `key` unique, `name`, `platform`, `repoUrl?`, `gitnexusRepoId?`, `defaultRef?`, `createdAt`, `updatedAt`).
- [x] T004 Generalize `rules` in `server/src/db/schema.ts`: add `projectId` (FK→projects, nullable for now), `kind` (default `business_rule`), `parentId` (self FK→rules), `unitType`, `content` (jsonb); drop `NOT NULL` on `flow`/`productDescription`/`technicalDescription`; add indexes `rules_project_idx`, `rules_kind_idx`, `rules_parent_idx`.
- [x] T005 Add `projectId` (FK→projects, nullable for now) to `rounds` in `server/src/db/schema.ts`.
- [x] T006 Update `server/src/db/relations.ts`: `projects` ↔ many `rounds`/`rules`; `rounds.projectId`/`rules.projectId` → one `projects`; `rules` self-relation `parent`/`children` via `parentId`.
- [x] T007 Generate the migration: `npm run db:generate` → `server/migrations/0004_architecture_knowledge.sql`.
- [x] T008 Hand-edit `server/migrations/0004_architecture_knowledge.sql` to insert a `default` project and backfill `UPDATE rules/rounds SET project_id=<default>`, then `ALTER ... SET NOT NULL` on both `project_id` columns (sanctioned in-migration backfill per Principle IV).
- [x] T009 Apply with `npm run db:migrate`; verify `projects` exists and existing rows carry the default project.
- [x] T010 [P] Add `server/src/schemas/project.ts`: `RegisterProjectSchema` (+ platform enum), exported input type.
- [x] T011 Add project service fns in `server/src/services/loop.ts`: `registerProject` (upsert by key), `getProjectByKey` (throws `PROJECT_NOT_FOUND`), `listProjects`.
- [x] T012 Generalize embedding-text builder in `server/src/services/loop.ts`: make `ruleEmbeddingFields` kind-aware (business_rule → title+product+technical; architecture → title+`content.overview`+tech-stack summary).
- [x] T013 [P] Wire projects to REST in `server/src/api/router.ts`: `POST /api/projects` (register/upsert), `GET /api/projects` (list); map `PROJECT_NOT_FOUND`→404.
- [x] T014 [P] Wire `register_project` (+ list) MCP tool in `server/src/mcp/server.ts`.

**Checkpoint**: Schema migrated, default project backfilled, projects creatable on REST+MCP.

---

## Phase 3: User Story 1 - Capture architecture with confidence-aware surfacing (Priority: P1) 🎯 MVP

**Goal**: An agent submits architecture units; high-confidence → `published` (searchable now),
medium/low → `in_review`; business rules unchanged.

**Independent Test**: Submit one high- and one low-confidence architecture unit; first is `published`
and searchable, second is `in_review` in the reviewer queue.

### Tests for User Story 1 ⚠️ (write first, ensure they FAIL)

- [x] T015 [P] [US1] In `server/src/services/loop.test.ts`: architecture+high → `published`; architecture+medium/low → `in_review`; business_rule+any → `in_review` (FR-013/014/006).
- [x] T016 [P] [US1] In `server/src/services/loop.test.ts`: resubmit architecture by `ruleKey` → new version, no duplicate; status recomputed from new confidence (FR-021, US1-AS4).

### Implementation for User Story 1

- [x] T017 [P] [US1] Add `server/src/schemas/architecture.ts`: `ArchitectureContentSchema` (overview, techStack, entryPoints, layer, patterns, dependencies, diagrams[type,format=mermaid,source], risk, provenance) + `SubmitArchitectureUnitSchema` (projectKey, ruleKey?, title, unitType, parentId?, confidence, roundId?, sources, content, entityLinks).
- [x] T018 [US1] Implement `submitArchitectureUnit` in `server/src/services/loop.ts`: resolve projectKey→projectId; per-kind required-field validation (content.overview+provenance+unitType; parentId required when `unitType=layer`); hybrid status (high→`published`, else `in_review`); **human-verdict precedence** (if existing unit already has human feedback → force `in_review`, never `published`/`approved`); `ruleKey` namespacing `arch:<projectKey>:<slug>` with version-on-resubmit; reuse `detectSourceOverlaps` + `autoLinkEntities` + kind-aware embedding.
- [x] T019 [P] [US1] REST `POST /api/architecture-units` in `server/src/api/router.ts` (parse `SubmitArchitectureUnitSchema`, return `{unit, merged, version, status, warnings, relatedApproved}`).
- [x] T020 [P] [US1] MCP `submit_architecture_unit` tool in `server/src/mcp/server.ts` (mirror response summary incl. computed status + warnings).

**Checkpoint**: US1 fully functional — architecture capture with hybrid surfacing on REST+MCP.

---

## Phase 4: User Story 2 - Human review keeps the catalog trustworthy (Priority: P1)

**Goal**: Reviewers approve (human-only) / reject(+comment) architecture units incl. `published`;
rejections feed back to the agent; refine closes the loop.

**Independent Test**: Approve a `published` unit → becomes `approved`; reject another with a comment →
`rejected`, comment retrievable via pending feedback; refine → new version, feedback resolved.

### Tests for User Story 2 ⚠️

- [x] T021 [P] [US2] In `server/src/services/loop.test.ts`: `published`→`approved` (human verdict); `published`→`rejected` with comment; reject/clarify without comment → `COMMENT_REQUIRED`; agent resubmission of an already-human-judged unit does NOT auto-publish (FR-016/017/018/020, SC-002/003).
- [x] T022 [P] [US2] In `server/src/services/loop.test.ts`: reject architecture unit → `submitRefinement` → new version, `in_review`, addressed feedback `resolved` (US2-AS4, SC-004).

### Implementation for User Story 2

- [x] T023 [US2] Extend `submitVerdict` in `server/src/services/loop.ts`: accept current status `in_review` **or** `published` (was `in_review` only); keep `approved` reachable only here (human); reuse comment guard; no new status semantics for `rejected`/`refining`.

> No new REST endpoint (verdict reuses `POST /api/rules/:id/feedback`). No MCP verdict tool —
> verdicts remain human/REST-only by design (plan Parity Check). `submitRefinement` is reused as-is.

**Checkpoint**: US1+US2 — full architecture loop (capture → review → refine) works independently.

---

## Phase 5: User Story 3 - Organize & retrieve per project/platform (Priority: P2)

**Goal**: Project-scoped rounds, project/kind/unitType-filtered retrieval, feature→layer hierarchy,
no cross-project leakage, existing data preserved.

**Independent Test**: Two projects with same feature name stay distinct; project-scoped search returns
only that project; feature retrieval returns children; existing rules survived under default project.

### Tests for User Story 3 ⚠️

- [x] T024 [P] [US3] In `server/src/services/loop.test.ts`: cross-project isolation (search by `projectKey`; same feature name in two projects never merges, FR-004/SC-005); project-scoped round conflict (two projects do not conflict, FR-003); existing business rules preserved under default project post-migration (SC-006, US3-AS4).
- [x] T025 [P] [US3] In `server/src/services/loop.test.ts`: hierarchy — feature unit with layer children is retrievable via `getRule` (`children[]`); orphaned child returns null parent (US3-AS2, edge case).

### Implementation for User Story 3

- [x] T026 [US3] In `server/src/services/loop.ts`: `createRound` resolves `projectKey`→projectId and persists it; `detectRoundConflicts` filtered by `projectId`.
- [x] T027 [US3] In `server/src/services/loop.ts`: extend `searchCatalog` with `projectKey`/`kind`/`unitType` filters; architecture default status = {`published`,`approved`}; explicit `status=approved` excludes unreviewed `published` (FR-024/025); extend `getRule` to return `content`, `parent`, `children[]` for architecture.
- [x] T028 [P] [US3] Add `projectKey` to `StartRoundSchema` in `server/src/schemas/round.ts`.
- [x] T029 [P] [US3] Add `projectKey`/`kind`/`unitType` to `SearchCatalogSchema` in `server/src/schemas/rule.ts` (status enum already extended via schema types).
- [x] T030 [P] [US3] REST in `server/src/api/router.ts`: thread `projectKey` into `POST /api/rounds`; expose new filters on `GET /api/rules`; include children/content in `GET /api/rules/:id`.
- [x] T031 [P] [US3] MCP in `server/src/mcp/server.ts`: `projectKey` on `start_round`; `projectKey`/`kind`/`unitType` on `search_catalog`; children/content on `get_rule`.

**Checkpoint**: Multi-project organization + retrieval working; US1–US3 independently testable.

---

## Phase 6: User Story 4 - Detect stale architecture knowledge (Priority: P3)

**Goal**: Flag architecture units whose `content.provenance.indexCommit` is behind a reference revision.

**Independent Test**: Store a unit with a recorded commit; query with a newer ref → unit flagged.

### Tests for User Story 4 ⚠️

- [x] T032 [P] [US4] In `server/src/services/loop.test.ts`: `listStaleUnits` flags units whose `provenance.indexCommit` ≠ reference (defaults to project `defaultRef`); fresh units excluded (FR-012/SC-009).

### Implementation for User Story 4

- [x] T033 [US4] Implement `listStaleUnits(projectKey, ref?)` in `server/src/services/loop.ts`.
- [x] T034 [P] [US4] REST `GET /api/projects/:key/stale?ref=` in `server/src/api/router.ts`.
- [x] T035 [P] [US4] MCP `list_stale_units` tool in `server/src/mcp/server.ts`.

**Checkpoint**: All four stories independently functional.

---

## Phase 7: Polish & Cross-Cutting

- [x] T036 [P] Add `extract_architecture` MCP prompt in `server/src/mcp/server.ts` (tool-aware methodology mirroring `extract_rules`; GitNexus-first; feature root + layer sub-units; provenance + source evidence).
- [x] T037 [P] Update `ROADMAP.md`: Architecture Decisions Log entry (generalized `rules`, `published` state), parity statement, and deferred items (rename `rules`, `unit_edges` graph, importer, verdict-MCP).
- [x] T038 Run `quickstart.md` end-to-end against `npm run dev` (steps 1–7; verify the acceptance smoke mappings).
- [x] T039 Definition of done: `npm test` green and `npm run build` clean from `server/`.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)** → **Foundational (P2)** blocks everything → **US1 → US2 → US3 → US4** → **Polish**.
- Foundational MUST finish (migration applied) before any story.
- US2 depends on US1 (needs `published` units to review). US3 and US4 depend only on Foundational and
  can follow US1/US2 or run alongside if loop.ts edits are coordinated.

### Within stories

- Tests written first and failing, then implementation.
- In `loop.ts`: service fn before its REST/MCP wiring.
- Zod schema (separate file) can land in parallel with/just before the service fn that uses it.

### Parallel opportunities

- **Foundational**: T010 (project.ts) ∥ schema work after types exist; T013 (router.ts) ∥ T014 (server.ts) after T011.
- **US1**: T015 ∥ T016 (tests) ; then T017 (schema) ; T018 (service) ; then T019 (router) ∥ T020 (server).
- **US3**: T024 ∥ T025 (tests) ; T028 ∥ T029 (schemas) ; after T026/T027: T030 (router) ∥ T031 (server).
- **US4**: T034 (router) ∥ T035 (server) after T033.
- ❗ Never parallelize two tasks that both edit `loop.ts` (T011/T012/T018/T023/T026/T027/T033) or both edit `server.ts` / `router.ts`.

---

## Parallel Example: User Story 1

```bash
# Tests first (different concerns, same test file is appended — coordinate or split blocks):
Task: T015 architecture status-by-confidence tests
Task: T016 resubmit-version test
# After the service (T018) lands, wire both interfaces in parallel (different files):
Task: T019 REST POST /api/architecture-units (router.ts)
Task: T020 MCP submit_architecture_unit (server.ts)
```

---

## Implementation Strategy

### MVP (US1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational (migration applied) → 3. Phase 3 US1 →
**STOP & validate**: architecture capture with hybrid surfacing on REST+MCP. This alone delivers a
searchable architecture catalog.

### Incremental delivery

US1 (capture) → US2 (review loop / the human gate) → US3 (multi-project + retrieval) →
US4 (staleness) → Polish. Each story is an independently testable increment; the catalog stays correct
after each.

---

## Notes

- `[P]` = different files, no incomplete-task dependency.
- Tests are required (Principle V); verify they fail before implementing.
- Commit after each task or logical group; keep `npm test` green before moving on.
- Principle III is the load-bearing invariant: `approved` only via `submitVerdict` (human); `published`
  is separate and never presented as approved — re-verify in T021's assertions.
