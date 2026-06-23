# Implementation Plan: Architecture Knowledge

**Branch**: `001-architecture-knowledge` | **Date**: 2026-06-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-architecture-knowledge/spec.md`

## Summary

Extend Lore so the existing extraction → human-review → refine loop also captures **architecture
documentation**, and organize all knowledge by **project** so the catalog spans multiple repositories
and platforms. Technically: generalize the existing `rules` table into a multi-kind **knowledge unit**
(adding `projectId`, `kind`, `parentId`, `unitType`, `content`), add a `projects` table, introduce a
`published` lifecycle state for high-confidence architecture (auto-surfaced but **distinct from**
human `approved`), and expose a `submit_architecture_unit` capability plus project scoping at full
REST↔MCP parity. All new transitions and guards live in the service layer and are covered by
integration tests. Out of scope this phase: the onboarding CLI, the UI, the `acme-docs` importer,
and a queryable dependency graph.

## Technical Context

**Language/Version**: TypeScript (Node 20+, ESM), `tsx` for dev, `tsc` for build

**Primary Dependencies**: Express · Drizzle ORM + postgres-js · `@modelcontextprotocol/sdk`
(Streamable HTTP) · Zod · pgvector (`vector` column) · React/Vite (client, untouched this phase)

**Storage**: PostgreSQL (pgvector extension for 384-dim embeddings); schema via Drizzle migrations
under `server/migrations/`

**Testing**: Vitest, integration tests in `server/src/services/loop.test.ts` running against a real
Postgres with `migrate()`; `EMBEDDING_PROVIDER=none` in test (embeddings degrade to null)

**Target Platform**: Linux server (single Node process; per-session MCP `McpServer` over `/mcp`)

**Project Type**: Web service (server) with a separate React/Vite client. **This feature is
server-only.**

**Performance Goals**: MVP scale — interactive (sub-second) catalog reads; extraction is batch/async
from the agent's side. No new hot path introduced.

**Constraints**: Service-layer-owned invariants; REST↔MCP parity; migration-first schema; human-only
approval. Vectors never cross the MCP/REST boundary (existing rule).

**Scale/Scope**: Multiple projects; ~62 feature units + child layer units per project (Acme Shop Web
is the first real corpus); low write volume, human-review-paced.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Requirement | How this plan complies | Verdict |
|-----------|-------------|------------------------|---------|
| **I. Service Layer Owns All Invariants** | All transitions/guards in `server/src/services/` | Hybrid-by-confidence logic, `published`→`approved`/`refine`, human-verdict precedence, comment-required, project-scoped conflict detection all added to `loop.ts`. No FSM logic in router/MCP/React. | ✅ PASS |
| **II. Dual-Interface Parity (REST + MCP)** | Every capability on both surfaces, identical invariants | `register_project`, `start_round` (project arg), `submit_architecture_unit`, extended `submit_verdict` (accepts `published`), extended `search_catalog`/`get_rule` (project/kind/unitType) added to **both** `api/router.ts` and `mcp/server.ts`. No deferral. | ✅ PASS |
| **III. Human-in-the-Loop Convergence (NON-NEGOTIABLE)** | `approved` only via explicit human verdict; reject/clarify need a comment; feedback agent-retrievable | New `published` state is **separate** from `approved`; no agent path sets `approved`. `submitVerdict` remains the only writer of `approved`. Resubmission over a human verdict never auto-surfaces. Comment guard reused. | ✅ PASS |
| **IV. Migration-First, Type-Safe Schema** | Drizzle migration, no ad-hoc DDL | Edit `schema.ts` → `npm run db:generate` → commit SQL under `server/migrations/0004_*`. Backfill default project in the same migration. | ✅ PASS |
| **V. Test the State Machine** | New transitions/guards covered in `loop.test.ts`; `npm test` green | New tests: auto-publish (high), in_review (med/low), business_rule-always-review, published→approved, published→reject(+comment), human-verdict precedence, project-scoped conflict, hierarchy retrieval, staleness. | ✅ PASS |

**Result**: No violations. **Complexity Tracking is empty** (no deviations to justify).

### Parity Check (Principle II — required statement)

Every domain capability added or changed is delivered on REST and MCP in the same change:

| Capability | REST | MCP |
|------------|------|-----|
| Register/upsert project | `POST /api/projects` | `register_project` |
| Start round (project-scoped) | `POST /api/rounds` (+`projectKey`) | `start_round` (+`projectKey`) |
| Submit architecture unit | `POST /api/architecture-units` | `submit_architecture_unit` |
| Review verdict (now accepts `published`) | `POST /api/rules/:id/feedback` | *(verdict is human-only; no MCP write — see note)* |
| Search (project/kind/unitType/status) | `GET /api/rules` | `search_catalog` |
| Get unit (with children/content) | `GET /api/rules/:id` | `get_rule` |
| List stale units | `GET /api/projects/:key/stale` | `list_stale_units` |

> **Verdict-is-human-only note**: `submit_verdict` is intentionally REST-only today (reviewers are
> humans; the MCP surface has no verdict tool). This is the *existing* parity stance for the human
> gate and is consistent with Principle III — agents extract/refine, humans judge. This plan does not
> change it; it only extends the existing verdict path to accept `published` units. Recorded here so
> the parity stance is explicit, not accidental.

## Project Structure

### Documentation (this feature)

```text
specs/001-architecture-knowledge/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions & rationale
├── data-model.md        # Phase 1 — schema, states, content shape
├── quickstart.md        # Phase 1 — how to exercise the loop end-to-end
├── contracts/           # Phase 1 — REST + MCP contracts
│   ├── rest.md
│   └── mcp.md
└── tasks.md             # Phase 2 — created by /speckit-tasks (NOT here)
```

### Source Code (repository root)

```text
server/
├── src/
│   ├── db/
│   │   ├── schema.ts            # + projects table; generalize rules (projectId, kind,
│   │   │                        #   parentId, unitType, content); + 'published' status
│   │   └── relations.ts         # + projects↔rounds/rules; rules self-relation (parent/children)
│   ├── schemas/
│   │   ├── project.ts           # NEW — RegisterProjectSchema, platform enum
│   │   ├── round.ts             # + projectKey on StartRoundSchema
│   │   ├── architecture.ts      # NEW — SubmitArchitectureUnitSchema, ArchitectureContentSchema
│   │   └── rule.ts              # + projectKey/kind/unitType filters on SearchCatalogSchema
│   ├── services/
│   │   ├── loop.ts              # + projects CRUD, submitArchitectureUnit, hybrid FSM,
│   │   │                        #   extended submitVerdict, project-scoped conflicts,
│   │   │                        #   listStaleUnits, arch-aware embedding text
│   │   └── loop.test.ts         # + architecture FSM tests (Principle V)
│   ├── api/
│   │   └── router.ts            # + /projects, /architecture-units, /projects/:key/stale; extend /rules
│   └── mcp/
│       └── server.ts            # + register_project, submit_architecture_unit, list_stale_units;
│                                #   extend start_round, search_catalog, get_rule; + extract_architecture prompt
└── migrations/
    └── 0004_architecture_knowledge.sql   # generated; includes default-project backfill

client/                          # untouched this phase
```

**Structure Decision**: Single web-service backend (`server/`). The change is localized to the
server's db / schemas / services / api / mcp layers. The React client is deliberately not modified
(UI is a later phase). This matches the constitution's fixed stack and the service-layer-owns-invariants
principle: every new rule lands in `services/loop.ts`, with thin REST and MCP callers.

## Complexity Tracking

> No constitutional violations. No entries.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
