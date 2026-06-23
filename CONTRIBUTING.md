# Contributing to Lore

Thanks for your interest! Lore is open source under **AGPL-3.0** — contributions are
accepted under the same license.

## Getting started

See the [README](README.md) for local setup. In short:

```bash
docker compose up postgres -d
cd server && npm install && npm run db:migrate && npm run dev
cd client && npm install && npm run dev
```

## The architecture is a contract

Before changing structure, read **[docs/CONSTITUTION.md](docs/CONSTITUTION.md)**. It is not
decoration — several invariants are enforced by tests and must stay green:

- State transitions and invariants live **only** in `domain/` + `services/` — never in a
  transport, an MCP tool, a React component, or SQL. No `kind === "…"` branching outside
  `domain/kinds/`.
- A new or changed capability goes through the **registry** (`server/src/app/capabilities/*`);
  both transports are generated from it. `app/parity.test.ts` must stay green.
- Repos are **persistence-only** (rows in, rows out — no domain rules).
- Side-effects attach via the **event bus**, never by editing service/handler logic.
- Every tenant query (`projects` / `knowledge_units` / `rounds`) is scoped by `ctx.workspaceId`.
- Schema changes go through **Drizzle migrations**, never ad-hoc DDL.

## Before opening a PR

From `server/`:

```bash
npm test         # vitest (needs the Postgres from docker compose)
npm run build    # tsc
```

From `client/`: `npm run build`. Both must pass.

New or changed FSM transitions need table tests in `domain/fsm.test.ts`; kind policies in
`domain/kinds/*.test.ts`; lifecycle in `services/loop.test.ts`.

## Commit messages

Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`). Keep PRs focused.

## Reporting security issues

Please do **not** open a public issue for security vulnerabilities. Open a private
advisory via GitHub Security, or contact the maintainer directly.
