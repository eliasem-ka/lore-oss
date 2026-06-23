<!--
Sync Impact Report
==================
Version change: 1.5.0 → 1.6.0 (MINOR: S6·2 multi-tenant workspace isolation landed
(PR merge `010-s6-workspaces`), closing S6. New "Tenancy / workspace isolation"
constraint — `projects`/`knowledge_units`/`rounds` carry `workspace_id` and EVERY
tenant read/write is scoped by `ctx.workspaceId`; a cross-tenant by-id op is
indistinguishable from not-found. The active workspace is resolved per-request:
REST from a JWT user + `X-Workspace-Id` header, membership-gated (non-member → 403);
MCP per-session via `X-Workspace-Id` > `MCP_WORKSPACE` env > `default` (the shared
`MCP_API_KEY` is the trust boundary — selection, not authz). `unit_key` and project
`key` are unique per workspace. `users`/`entities`/`flow_policies` stay global. The
Role-enforcement note's "per-project policy scoping arrives later" caveat is now
resolved as out-of-scope (workspace membership is binary; flow policies stay global).
No principle removed.)
Prior: 1.4.0 → 1.5.0 (MINOR: S6·3 role-based verdicts landed (PR merge
`009-s6-role-verdicts`). The Authentication & identity constraint now ENFORCES role
claims — a flow may require a minimum approver role (`flow_policies`); insufficient
role → FORBIDDEN/403, checked before any write. Replaces the 1.4.0 "carried but not
enforced" note. No principle removed.)
Prior: 1.3.1 → 1.4.0 (MINOR: S6·1 JWT reviewer identity landed (PR merge
`008-s6-jwt-identity`). New "Authentication & identity" constraint — `/api` is
default-deny JWT auth (`rest.public` opt-out), production MUST set `JWT_SECRET`,
HS256 pinned, `/mcp` keeps `MCP_API_KEY`. Principle III strengthened: the reviewer
identity is token-derived, never self-asserted. Role enforcement + workspace
isolation remain later S6 sub-pieces. No principle removed.)
Prior: 1.3.0 → 1.3.1 (PATCH: Principle I wording tightened — `ingestUnit`
is now fully kind-agnostic, so the structural-kind-dispatch carve-out is narrowed
to only the `searchCatalog` read-layer default. No principle added/removed.)
Prior: 1.2.0 → 1.3.0
Bump rationale (MINOR): Phase 3/4 landed (PR merge `005-content-unification`),
closing the re-architecture master spec. The knowledge-unit storage is unified
(flat business-rule columns folded into a typed `content` jsonb; kind-agnostic
`search_text`; tables renamed to `knowledge_units`/`unit_versions`/`unit_entities`,
dedup key `rule_key → unit_key`); `ingestUnit` is the single ingestion flow with
content assembly behind `policyFor(kind).buildContent`. Principle I & the
Deduplication / a new Knowledge-unit-storage constraint are updated; Principle IV
gains an explicit hand-authored-migration clause. No principle is removed or made
backward-incompatible.

Amended in 1.3.0:
  I. Per-kind behavior now includes `content` shape (via `policy.buildContent`);
     the "no kind-dispatch" rule is stated truthfully — kind-specific DOMAIN rules
     live in policies, while the single ingestion orchestrator (`ingestUnit`) and
     the read-layer status default may do minimal STRUCTURAL kind-dispatch
     (architecture-only columns, embedding/snapshot wiring).
  IV. Renames and data backfills are hand-authored (db:generate emits drop+add =
      data loss); the backfill MUST precede any DROP in the same migration.
  + Technology constraints: Deduplication key `rule_key → unit_key`; new
    "Knowledge-unit storage" constraint (typed `content` per kind + `search_text`).

Earlier history below. No principle removed or made backward-incompatible.

Amended in 1.2.0:
  II. Dual-Interface Parity — REST and MCP are now GENERATED from one capability
      registry (`app/registry.ts` + `app/capabilities/*`); single-transport
      capabilities are an explicit `rest:false`/`mcp:false` allow-list enforced by
      `app/parity.test.ts`. Replaces "wire it twice + record gaps in ROADMAP".
  + Technology & Architecture Constraints: "Layering" updated to include `app/` and
    `transport/` (generated); new "Domain events" constraint for the in-process bus.

Unchanged: I (Service Layer Owns Invariants — handlers in `app/` remain thin and
add no invariants), III (Human-in-the-Loop Convergence — `submitVerdict` stays
human/REST-only), IV (Migration-First Schema — no schema change this phase),
V (Test the State Machine).

Deferred to a later amendment: the `content` jsonb unification and the `ingestUnit`
facade (master spec §5b/§5c) — not yet shipped, so not described here.

Templates reviewed for alignment:
  ✅ .specify/templates/plan-template.md   (Constitution Check gate references this file generically — no change)
  ✅ .specify/templates/spec-template.md   (no mandatory-section conflicts — no change)
  ✅ .specify/templates/tasks-template.md  (task categories compatible — no change)

Follow-up TODOs: ratify the `content` unification + `ingestUnit` facade when they land.

History:
  1.0.0 (2026-06-15) — Initial ratification from README.md + ROADMAP.md.
  1.1.0 (2026-06-22) — Phase 0–1 layering reflected in Principles I & V.
  1.2.0 (2026-06-22) — Phase 2 capability registry (Principle II) + event bus.
  1.3.0 (2026-06-22) — Phase 3/4 content unification + ingestUnit + rename (closes re-arch).

Authored with assistance from Claude (Anthropic Opus 4.8).
-->

# Lore Constitution

Lore is a business-rules knowledge base built on an agent-extraction loop, human review, and
iterative refinement. These principles govern how the system is changed so the convergence loop
stays correct, the two agent/human interfaces stay in step, and the data model stays trustworthy.

## Core Principles

### I. Service Layer Owns All Invariants

All domain state transitions and invariants MUST live in the domain and service layers
(`server/src/domain/` and `server/src/services/`) — never in a route handler, MCP tool, React
component, or SQL trigger. Specifically:

- The rule lifecycle FSM (`in_review`/`published → approved | rejected`; `rejected → in_review` via
  refine) is an **explicit transition table** in `server/src/domain/fsm.ts`. It is the single source
  of truth for legal transitions and for transition-time guards (e.g. comment-required-on-reject).
- Per-kind DOMAIN behavior — initial status (including high-confidence architecture auto-`published`
  and human-verdict precedence), hierarchy rules, indexing text, and **`content` shape**
  (`policy.buildContent`) — lives in **kind policies** under `server/src/domain/kinds/`. Kind-specific
  domain rules MUST NOT be reimplemented elsewhere. `ingestUnit` is kind-agnostic — it dispatches every
  per-kind concern (content, indexing, structural columns, snapshot, prior-verdict gate) through
  `policyFor(kind)` methods, with zero `kind === "…"` branching. The only sanctioned residual structural
  kind-check outside `domain/kinds/` is the read-layer status default in `searchCatalog` (architecture
  surfaces `published`+`approved`); a new `kind === "…"` anywhere else is a defect, not a carve-out.
- Ingestion is unified: `submitCandidate`/`submitArchitectureUnit` are thin facades over `ingestUnit`,
  which owns dedup→version, source-overlap, `relatedApproved`, snapshot, status, and indexing. Remaining
  orchestration and guards (`unit_key` merge, scope-conflict detection) live in `server/src/services/`,
  which composes the domain with the repositories.
- Persistence is isolated in `server/src/repos/`. Repositories are **persistence-only**: they return
  rows or `undefined` and MUST NOT carry domain rules or throw domain (`LoopError`) errors.

Rationale: REST and MCP are both thin callers. Centralizing invariants in a pure, testable domain
layer — with persistence behind a repository boundary — is the only way to keep the two interfaces'
behavior identical and prevent one entry point from corrupting state the other relies on.

### II. Dual-Interface Parity (REST + MCP)

Every domain capability MUST be declared ONCE in the capability registry (`server/src/app/registry.ts`
+ `server/src/app/capabilities/*`), from which BOTH transports are generated: `transport/rest.ts`
builds the Express routes and `transport/mcp.ts` builds the MCP tools by iterating `ALL_CAPABILITIES`.
A capability MUST expose at least one transport; a capability deliberately limited to one transport
(e.g. `submitVerdict` is human/REST-only by Principle III) MUST set the other to `rest:false`/`mcp:false`
and appear on the allow-list checked by `server/src/app/parity.test.ts`. New capabilities therefore
reach parity by construction; a new single-transport gap that is not on the documented allow-list
fails the build. Transport layers MUST only translate transport/shape and errors — they MUST NOT add
or relax domain rules; the capability `handler` is the one place that calls the service/domain layer.

Rationale: The product is a loop between agents and reviewers. Generating both surfaces from one
declaration — and testing the allow-list — makes drift a build failure rather than a latent gap one
side cannot observe or correct.

### III. Human-in-the-Loop Convergence (NON-NEGOTIABLE)

The agent MUST NOT be the final authority on catalog content. A rule becomes `approved` only through
an explicit reviewer verdict. Every `rejected` or `clarify` verdict MUST carry a reviewer comment,
and that feedback MUST be retrievable by the agent (`list_pending_feedback`) so refinement can close
the loop. Changes MUST NOT introduce a path that auto-approves agent output or discards rejection
feedback. The reviewer's identity (`reviewerName`/`reviewerRole`) MUST be derived from the
authenticated session (the JWT), never self-asserted in the request payload — the human verdict is an
*authenticated* act.

Rationale: The system's value is a *converging* catalog. Removing the human gate or losing feedback
turns it into an unreviewed dump and defeats the entire design.

### IV. Migration-First, Type-Safe Schema

Schema changes MUST go through Drizzle: edit `server/src/db/schema.ts`, generate a migration
(`npm run db:generate`), and commit the SQL under `server/migrations/`. **Renames and data backfills
MUST be hand-authored** — `db:generate` emits drop+add for a rename, which loses data; use
`ALTER … RENAME`, and any backfill `UPDATE` MUST precede the corresponding `DROP COLUMN` in the same
migration. Runtime `CREATE/ALTER` outside a migration is prohibited. Code MUST consume the typed
Drizzle schema rather than untyped raw queries, except where a documented capability (e.g. full-text
search via `to_tsvector`) genuinely requires inline SQL.

Rationale: Migration-first keeps every environment reproducible and the type layer honest; silent
schema drift is the fastest way to break the loop's persistence guarantees.

### V. Test the State Machine

The FSM is an explicit transition table (`server/src/domain/fsm.ts`) and MUST be covered by exhaustive
table tests (`server/src/domain/fsm.test.ts`) — every legal and illegal `(status × action)` pair plus
the named guards. Per-kind behavior MUST be covered by policy unit tests
(`server/src/domain/kinds/*.test.ts`), and end-to-end lifecycle behavior by service-layer integration
tests (`server/src/services/loop.test.ts`). A change that adds a transition, a verdict type, a guard,
or a kind MUST add or update tests asserting both the happy path and the rejected/invalid path.
`npm test` MUST pass before a change is considered done.

Rationale: The FSM is the heart of correctness. Making it explicit and pure means it can finally be
tested as a table rather than inferred from scattered guards; bugs there silently mis-state the
catalog, and tests are the only cheap defense.

## Technology & Architecture Constraints

- **Stack (fixed):** Node/Express · Drizzle ORM + postgres-js · Postgres · MCP SDK (Streamable HTTP)
  · React/Vite. Swapping a load-bearing component (ORM, transport, DB) is a constitutional amendment,
  not a routine change.
- **MCP transport:** Streamable HTTP on `/mcp` with a per-session `McpServer` instance created by a
  factory per request. Servers MUST NOT be reused across transports.
- **Authentication & identity (human `/api`):** every `/api` capability requires a valid JWT unless it
  declares `rest.public` (which defaults to **false** — auth is default-deny, enforced once in the
  generated transport before parse/handler). Reviewer identity comes from the token (`ctx.user`), never
  the payload (see Principle III). Passwords are bcrypt; tokens are signed HS256 and verified with the
  algorithm pinned. **Production MUST set `JWT_SECRET`** — the server hard-fails when `NODE_ENV=production`
  and it is unset (the dev fallback is dev/test only). `/mcp` keeps `MCP_API_KEY` as a separate
  agent-identity boundary.
- **Role enforcement:** role claims from the token are enforced for the `approve` verdict — a flow may
  declare a minimum approver role via `flow_policies` (`reviewer < senior < admin`; unknown/absent role
  ranks 0, default-deny). Insufficient role → `FORBIDDEN`/403, checked in `submitVerdict` after the FSM
  transition and before any write/emit. Reject/needs_clarification, null-flow (architecture), and
  policyless flows are not gated. Policies are CLI-managed; there is no public write endpoint. (Flow
  policies stay global — workspace membership is binary, not per-policy.)
- **Tenancy / workspace isolation (NON-NEGOTIABLE):** `projects`, `knowledge_units`, and `rounds` carry a
  `workspace_id`, and EVERY query on them — read or write — MUST filter `workspace_id = ctx.workspaceId`.
  `ctx.workspaceId` is server-resolved, never taken from a request payload; a cross-tenant by-id operation
  MUST be indistinguishable from not-found (`RULE_NOT_FOUND`/`ROUND_NOT_FOUND`/`PROJECT_NOT_FOUND`), never
  leaking existence. The active workspace is resolved per request: `/api` from the JWT user plus an
  `X-Workspace-Id` header validated against membership (non-member → 403; absent → the user's first
  membership); `/mcp` per session via `X-Workspace-Id` > `MCP_WORKSPACE` env > the `default` workspace (the
  shared `MCP_API_KEY` is the trust boundary, so this is selection, not authorization). `unit_key` and
  project `key` are unique **per workspace** (composite uniques), so the same key may exist independently in
  two workspaces. `users`, `entities`, and `flow_policies` are intentionally global. The unscoped by-id
  fetch (`findUnitByIdInternal`) is confined to post-commit event subscribers, which have no workspace
  context. The cross-tenant proof lives in `services/tenantIsolation.test.ts`.
- **Deduplication:** `unit_key` (a semantic, agent-controlled slug) is the dedup key, unique per workspace.
  Re-submitting an existing `unit_key` within a workspace MUST create a new version, never a duplicate row.
  Source overlap is a non-blocking warning, never a hard block.
- **Knowledge-unit storage:** the `knowledge_units` table stores all kinds; the per-kind payload lives in
  a typed `content` jsonb (`BusinessRuleContent | ArchitectureContent`), NOT in flat per-kind columns.
  Shared/queryable fields (flow, status, confidence, sources, kind, unit_type, parent_id, …) stay as
  columns. A denormalized `search_text` (filled by `policy.searchText`, computed in the service and passed
  to the repo) drives a kind-agnostic FTS — the search SQL MUST NOT reference kind-specific fields. The
  agent write-input may stay flat (the facade maps it into `content`); historical version snapshots are
  immutable and read defensively.
- **Styling:** Token-based CSS, no UI framework. New UI MUST use the existing design tokens rather than
  introducing a framework or one-off inline styles.
- **Layering (server):** generated transport (`transport/rest.ts`, `transport/mcp.ts`) → application
  capabilities (`app/` — the registry + thin handlers) → services (orchestration) → domain (FSM + kind
  policies, pure, no DB access) → repositories (persistence-only Drizzle access). Each layer knows only
  the layer below it. Capability handlers MUST stay thin (translate + call the service/domain layer +
  emit events); they MUST NOT hold invariants. Domain modules MUST NOT import the DB client; repositories
  MUST NOT contain domain rules. Each repository function takes the Drizzle handle as an explicit parameter.
- **Domain events:** state-change side-effects (notifications, audit, future integrations) attach via the
  in-process event bus (`domain/events.ts` interface + `infra/eventBus.ts`), NOT by editing service or
  handler logic. Handlers emit typed `DomainEvent`s after the state change succeeds; subscriber exceptions
  MUST be isolated so a side-effect cannot fail a request. Emission MUST NOT change a handler's return
  value (transport output stays identical).

## Development Workflow & Quality Gates

- **Definition of done:** `npm test` (server) passes, `npm run build` (server, `tsc`) is clean, and any
  schema change ships with its generated migration.
- **Spec-driven flow:** Non-trivial features SHOULD pass through `/speckit-specify` → `/speckit-plan` →
  `/speckit-tasks` → `/speckit-implement`. The plan's Constitution Check gate MUST be satisfied against
  this document before implementation begins.
- **ROADMAP as ledger:** Completed work and deferred scope MUST be reflected in `ROADMAP.md`, including
  the Architecture Decisions Log when a load-bearing decision is made or reversed.
- **Parity check:** Any PR adding or changing a capability MUST go through the registry (`app/capabilities/*`);
  `app/parity.test.ts` MUST stay green. A new single-transport capability MUST update the allow-list with a
  one-line rationale, or the build fails.

## Governance

This constitution supersedes ad-hoc practice. When guidance here conflicts with convenience, this
document wins or it must be amended first.

- **Amendments** require: a written rationale, the version bump below, an updated Sync Impact Report at
  the top of this file, and review of the dependent templates in `.specify/templates/`.
- **Versioning policy (semantic):**
  - MAJOR — a principle is removed or redefined in a backward-incompatible way.
  - MINOR — a new principle or section is added, or guidance is materially expanded.
  - PATCH — clarifications, wording, or non-semantic refinements.
- **Compliance review:** Every change is reviewed against these principles. Complexity that violates a
  principle MUST be justified in the plan's Complexity Tracking section or removed. Use `CLAUDE.md` and
  the active feature plan for runtime development guidance.

**Version**: 1.6.0 | **Ratified**: 2026-06-15 | **Last Amended**: 2026-06-22
