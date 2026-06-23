# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Demo seed script (`npm run seed:demo`) that populates an e-commerce workspace, plus
  catalog / review-queue screenshots in the README.

## [0.1.0] — 2026-06-23

Initial public release.

### Added

- **Converging human-in-the-loop catalog** — AI agents extract business rules from code via MCP;
  reviewers approve/reject in a web UI; rejected rules feed back to the agent for refinement.
- **Two knowledge kinds** — `business_rule` and `architecture`, behind per-kind policies.
- **Capability registry** — a single declaration per capability generates both the REST and MCP
  transports, with a parity test that fails on drift.
- **FSM lifecycle** — state transitions as a guarded transition table in the pure domain layer.
- **Hybrid search** — local multilingual embeddings (`multilingual-e5-small`, pgvector) fused with
  Postgres full-text search via Reciprocal Rank Fusion; graceful degradation to lexical-only.
- **Event bus + subscribers** — webhook, Jira, and audit-log side-effects attach without touching
  core logic.
- **Authentication & roles** — JWT (HS256) identity; role hierarchy (`reviewer < senior < admin`);
  per-flow minimum-role gates on approval.
- **Multi-tenant workspaces** — every tenant query scoped by `workspace_id`, with a cross-tenant
  isolation test; per-request workspace resolution over REST and MCP.

[Unreleased]: https://github.com/eliasem-ka/lore-oss/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/eliasem-ka/lore-oss/releases/tag/v0.1.0
