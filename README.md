# Lore — Business Rules Knowledge Base

[![CI](https://github.com/eliasem-ka/lore-oss/actions/workflows/ci.yml/badge.svg)](https://github.com/eliasem-ka/lore-oss/actions/workflows/ci.yml)
[![License: AGPL v3](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)

Agent-driven knowledge base for extracting, reviewing, and refining business rules from code.

- **Agents** connect via MCP (Streamable HTTP) to extract rules from any codebase
- **Reviewers** approve or reject via the web UI
- **Rejected rules** feed back to the agent for refinement — creating a converging loop

## Stack

Node/Express · Drizzle ORM · Postgres · MCP SDK · React/Vite

---

## Local setup

**Prerequisites:** Node 20+, Docker (for Postgres)

```bash
# 1. Start Postgres
docker compose up postgres -d

# 2. Server — install, migrate, run
cd server
npm install
cp ../.env.example .env          # edit DATABASE_URL if needed
npm run db:migrate
npm run dev                       # Express on http://localhost:3000

# 3. Client — in a second terminal
cd client
npm install
npm run dev                       # Vite on http://localhost:5173
```

Open **http://localhost:5173** — the UI proxies `/api` and `/mcp` to port 3000.

---

## Connect an MCP client

Add to your `.mcp.json` (Claude Code, Cursor, etc.):

```json
{
  "mcpServers": {
    "lore": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

Then prompt the agent:

> Use the `extract_rules` prompt from the `lore` MCP server and run a full extraction round against the Checkout flow.

---

## Rule lifecycle

```
agent extracts → in_review → reviewer approves → approved (catalog)
                     ↑              ↓
              agent refines ← reviewer rejects (with comment)
```

## MCP tools

| Tool | Description |
|---|---|
| `start_round` | Begin an extraction session |
| `submit_candidate` | Submit a discovered rule (merges if `rule_key` exists) |
| `list_pending_feedback` | Get rejected rules awaiting agent refinement |
| `submit_refinement` | Submit an updated version, mark feedback resolved |
| `search_catalog` | Search approved rules |
| `get_rule` | Full rule with version history and feedback |
| `complete_round` | Close an extraction session |

Prompt: `extract_rules` — ships the full tool-aware extraction methodology to the agent.

---

## Architecture

Lore is a layered monolith — each layer knows only the one below:

```
transport/ (REST + MCP, generated)  →  app/ (capability registry)  →
services/ (orchestration)  →  domain/ (pure: FSM, kind policies, roles, events)  →
repos/ (persistence-only)  →  db/ (Drizzle + Postgres)        +  infra/ (event bus + subscribers)
```

Highlights worth a look:

- **One capability registry → two transports.** Each capability is declared once; the REST router and the MCP tools are *generated* from it, with a parity test that fails if they drift.
- **The lifecycle is a data table.** State transitions live in `domain/fsm.ts` as a transition table, not scattered `if`s.
- **Hybrid search.** Local multilingual embeddings (`multilingual-e5-small`, 384-dim, no external API) fused with Postgres full-text via Reciprocal Rank Fusion.
- **Multi-tenant isolation.** Every tenant query is scoped by `workspace_id`; a cross-tenant read is indistinguishable from not-found.

The architectural rules are written down and enforced by tests — see **[docs/CONSTITUTION.md](docs/CONSTITUTION.md)**.

A non-technical, self-contained walkthrough (product tour + concept deep-dives on MCP,
the modules, the FSM, the event bus, multi-tenancy and embeddings) lives in
**[docs/recorrido-lore.html](docs/recorrido-lore.html)** — open it in a browser.

---

## License

Licensed under the **GNU Affero General Public License v3.0** ([AGPL-3.0](LICENSE)).

Lore is free and open source. You may use, study, modify and self-host it. The AGPL adds
one obligation that matters here: **if you run a modified version as a network service,
you must publish your modified source under the same license.** This keeps the project
open and prevents it from being taken closed and resold as a proprietary hosted product.

© 2026 Elias Eguizabal. Contributions are accepted under the same license.
