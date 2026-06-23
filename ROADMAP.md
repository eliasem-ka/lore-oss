# Lore — Roadmap

> Business rules knowledge base with agent extraction loop, human review, and iterative refinement.
> Stack: Node/Express · Drizzle/Postgres · MCP (Streamable HTTP) · React/Vite

---

## ✅ Done

### F1 — Core scaffold
- Postgres schema: `rounds`, `rules`, `rule_versions`, `feedback`
- Rule lifecycle FSM: `in_review → approved | rejected → (refine) → in_review`
- Service layer (`loop.ts`) owns all state transitions
- Integration tests (approve, reject→refine, comment-required invariant)

### F2 — REST API + Web UI
- Express `/api/*` over the service layer
- React pages: Catalog, Review Queue, Iterations, Progress
- Verdict submission with comment enforcement on reject/clarify

### F3 — MCP server
- Streamable HTTP on `/mcp`, per-session `McpServer` instances
- 7 tools: `start_round`, `submit_candidate`, `list_pending_feedback`, `submit_refinement`, `search_catalog`, `get_rule`, `complete_round`
- `extract_rules` prompt with tool-aware methodology (GitNexus → grep/glob fallback)
- `catalog://approved` resource

### F3.5 — UI redesign
- Pastel dashboard (mint/yellow/pink/lavender per status) matching design reference
- Floating white card, icon-only sidebar, 72px strip with circle active state
- Review Queue grouped by subflow, tech-description as monospace code block
- Source pills truncated to `module/File.kt · symbol · lines`

---

## ✅ Done (continued)

### S1 — Multi-team deduplication
**Goal:** Multiple teams can extract from overlapping code without creating duplicate rules.

- [x] `rule_key` unique constraint already in schema
- [x] **`rule_key` merge on submit** — if `submit_candidate` receives an existing `rule_key`, creates a new version instead of a duplicate row; returns `{merged: true, rule_id, version}`
- [x] **Source overlap detection** — before inserting, checks existing rules for same `path + symbol`; returns `warnings[]` (non-blocking)
- [x] **UI overlap badge** — amber `⚠ source overlap` pill on Review Queue cards computed client-side from the current queue
- [x] **MCP tool response** formats `merged`/`version`/`warnings` as human-readable text so the agent knows when to reuse a `rule_key`

---

## 📋 Backlog

### F4 — Iteration loop (full cycle) ✅
- [x] `submit_refinement` end-to-end cycle verified: reject → agent refines → new version in_review → feedback resolved
- [x] Version diff UI in Iterations page — side-by-side v(N-1) vs vN with strikethrough prev, change note, lazy-loaded on expand
- [x] `list_pending_feedback` verified via REST; MCP tool surfaces same data
- [x] Agent hint bar: `rule_id` displayed and copyable so agent can call `submit_refinement` directly

### F5 — Docs + local setup ✅
- [x] `.env.example` with `DATABASE_URL`, `MCP_API_KEY`, `PORT`
- [x] `README.md`: local quick-start (docker compose postgres + npm run dev), MCP connection snippet, tool reference
- [ ] Multi-stage Dockerfile (deferred — local dev workflow is sufficient for now)

### S2 — Round scoping + conflict detection ✅
- [x] `start_round` accepts optional `scope: { flows[], paths[] }` and `owner_name`
- [x] `POST /api/rounds` returns `{ round, conflicts[] }` — warns when scope overlaps an open round
- [x] Global rounds (no scope) conflict with everything; scoped rounds report `overlapFlows[]`
- [x] UI "Active Rounds" panel on Progress page: scope chips, owner, elapsed time, live/closed status

### S3 — Search & catalog quality ✅
- [x] Full-text search via Postgres `to_tsvector + plainto_tsquery` inline (no migration needed)
- [x] Catalog confidence filter chips: All / High / Medium / Low
- [x] Bulk approve/reject from the Review Queue: checkbox per card, select-all, batch verdict + comment

### S4 — Agent memory between rounds ✅
- [x] `submit_candidate` returns `relatedApproved[]` — already-approved rules in the same flow
- [x] MCP `submit_candidate` tool formats `related_approved[]` as a hint so agent avoids duplicating known rules
- [x] `extract_rules` prompt updated with Step 1: "check catalog before starting" — agent searches first

### S5 — Notifications + integrations
> Built on the Phase-2 event bus + capability registry. See `docs/superpowers/specs/2026-06-22-s5-webhook-export-design.md`.
- [x] **Webhook on human verdict** (approved/rejected/clarify) — `infra/subscribers/webhook.ts` POSTs a
  generic+Slack `{text,event}` body to `LORE_WEBHOOK_URL`; non-blocking, best-effort, no-op when unset (`004`).
- [x] **Export catalog as JSON / Markdown** — `export_catalog` capability at REST↔MCP parity
  (`GET /api/export`, MCP `export_catalog`); approved-only default, project/kind/flow/status filters; markdown
  renders business rules + architecture overviews. Added an opt-in `rest.respond` hook for raw content-typed
  output (`004`).
- [x] Jira integration: approved rule auto-creates a documentation ticket or links to an existing one — `unit_external_links` table, subscriber POSTs to Jira on approval, `getRule` returns `externalLinks`, client shows clickable Jira badge on RuleDetail page (S5·C)
- [x] Markdown escaping of titles/descriptions in export (inline-only metachars) — clean Confluence/Notion paste (`007`).
- [ ] Follow-up: email/SMTP transport (a separate subscriber).

### S6 — Auth + multi-tenant ✅
- [x] Reviewer identity via JWT — `users` table, bcrypt passwords, JWT-signed sessions; server derives reviewer identity from token (tasks 1–4: user repo → auth service → REST enforcement → client login flow + verdict identity)
- [x] Workspaces / multi-tenant isolation (#2): `workspaces` + `workspace_members` tables; every request scoped by `X-Workspace-Id` (validated against membership, falls back to the user's first workspace); all reads/writes scoped by `ctx.workspaceId`; cross-tenant isolation test; client fetches `GET /api/workspaces` on login, persists the active workspace (`localStorage["lore_ws"]`), sends the header on every request, and offers a sidebar switcher that clears the query cache so all data refetches (tasks 1–5)
- [x] Role-based verdicts (#3): `flow_policies` table + server gate (403) + client Approve disable with role hint; role hierarchy reviewer < senior < admin (tasks 1–3)
- **S6 (auth + roles + workspaces) is now COMPLETE.**

---

## Architecture Knowledge (spec 001) — Phase 1 ✅

Generalized the catalog from business-rules-only into a **project-agnostic knowledge base** that also
captures architecture documentation, reusing the same review/refine loop. See
`specs/001-architecture-knowledge/`.

- [x] `projects` table — first-class top-level grouping (key, platform, repo, defaultRef); every round + unit belongs to a project. Existing data backfilled to a `default` project (migration `0004`).
- [x] Generalized `rules` into multi-kind **knowledge units** (`kind`, `unitType`, `parentId`, `content`); business-rule columns made nullable, per-kind validation in the service layer.
- [x] New `published` lifecycle state — high-confidence architecture is auto-surfaced (searchable) but **distinct from** human `approved` (Principle III preserved; `approved` stays human-only).
- [x] Hybrid-by-confidence FSM + human-verdict precedence (a human-judged unit never auto-publishes on resubmit).
- [x] `submit_architecture_unit`, `register_project`, `list_stale_units` at REST↔MCP parity; `start_round`/`search_catalog`/`get_rule` extended (project/kind/unitType, feature→layer hierarchy, staleness via `provenance.indexCommit`).
- [x] `extract_architecture` MCP prompt (GitNexus-first methodology).
- [x] 14 new state-machine integration tests in `loop.test.ts` (18 total green).

### Deferred (later phases, recorded for parity/ledger)
- [ ] `npx kl init` onboarding CLI (installs MCP + skills + GitNexus, registers project).
- [ ] Multi-project review UI + Mermaid diagram rendering.
- [ ] Importer: `acme-docs` HTML → architecture units (this phase defined the storage target).
- [ ] `unit_edges` table for a queryable dependency / cross-platform-parity graph.
- [ ] Optional rename of physical table `rules` → `knowledge_units` (cosmetic).
- [ ] Parity note: `submit_verdict` remains human/REST-only by design (no MCP verdict tool).

---

## Re-architecture (Phases 0–2) ✅

Layered the server without changing behavior — the original `loop.test.ts` oracle stayed green
throughout. Specs/plans under `docs/superpowers/`. Constitution amended to **1.2.0**.

### Phase 0 — Repository layer (`002`, constitution 1.1.0)
- [x] Extracted all Drizzle access out of the 1037-line `loop.ts` into `repos/*` (project, round,
  feedback, entity, knowledgeUnit, search). `loop.ts` is now a Drizzle-free orchestration facade.

### Phase 1 — Explicit domain (`002`, constitution 1.1.0)
- [x] `domain/fsm.ts` — lifecycle as an explicit transition table + named guards (Principle V finally
  testable as a table). `domain/kinds/*` — segregated per-kind policies (ISP): status, hierarchy,
  indexing. Verdict/refinement/architecture rewired onto the domain; `computeArchStatus` removed.
- [x] Dropped the vestigial `refining` status (no producer) — migration `0005`.

### Phase 2 — Capability registry + event bus (`003`, constitution 1.2.0)
- [x] `app/registry.ts` + `app/capabilities/*` — one `defineCapability` per capability;
  `transport/rest.ts` + `transport/mcp.ts` **generate** both surfaces from `ALL_CAPABILITIES`.
  Hand-written `api/router.ts` and `mcp/server.ts` deleted.
- [x] `app/parity.test.ts` — structural REST↔MCP parity (Principle II) with a documented allow-list.
- [x] In-process event bus (`domain/events.ts` + `infra/eventBus.ts`); handlers emit domain events;
  `infra/subscribers/auditLog.ts` ships. Seam ready for S5.

### Deferred (next phases)
- [x] **Phase 3/4:** fold business-rule flat columns into typed `content` jsonb + `ingestUnit` facade
  (LSP) + kind-agnostic `search_text`; rename `rules → knowledge_units` (master spec §5b/§5c). ✅
  Client updated to read `content.*` (defensive snapshot reads in Iterations). Master re-arch spec complete.
- [ ] Derive MCP tool shapes from the Zod schemas (kill the inline-shape second source of truth).
- [ ] Pay down `as any` handler casts with a typed registry pass.

---

## Architecture decisions log

| Decision | Chosen | Why |
|---|---|---|
| Agent interface | MCP Streamable HTTP | Claude/Cursor native; tool-aware; works with any MCP client |
| ORM | Drizzle + postgres-js | Type-safe, zero-overhead, migration-first |
| State machine location | `domain/fsm.ts` (explicit table) + `services/` | Single source of transition truth; testable as a table (was scattered guards in `loop.ts`) |
| Persistence boundary | Persistence-only `repos/*`, one per aggregate | Domain/services depend on row-returning repos, not the DB client |
| Interface parity mechanism | One capability registry → generated REST + MCP | Parity by construction + `parity.test.ts`; replaces wiring each capability twice by hand |
| Side-effects | In-process event bus, handlers emit after success | S5 (Slack/Jira/export) = new subscriber, zero handler edits; emission can't change responses |
| Per-session McpServer | Yes, factory per request | SDK doesn't allow reuse across transports |
| Deduplication key | `rule_key` (semantic slug) | Deterministic, agent-controlled, human-readable |
| Source overlap | Warning, not block | Same code can legitimately be referenced by two rules |
| CSS | Token-based (no framework) | Full control, zero runtime cost, scalable to design system |
| Knowledge kinds | One generalized `rules` table + `kind` discriminator | Reuse one FSM/feedback/versioning loop; avoid a second state machine |
| Architecture auto-surfacing | New `published` state, separate from `approved` | High-confidence arch is useful immediately without breaking the human-only `approved` gate (Principle III) |
| Architecture content | `content` jsonb + reused `sources[]`; diagrams as Mermaid text | Queryable/diff-able/versionable; HTML is a projection, not the source of truth |
| Multi-repo scoping | First-class `projects` dimension | Agnostic backbone (Android/iOS/web); round conflicts + search scoped per project |
