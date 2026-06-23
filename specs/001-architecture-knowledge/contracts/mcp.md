# MCP Contract — Architecture Knowledge

Tools on the per-session `McpServer` (`server/src/mcp/server.ts`). Parity with REST (Principle II):
each tool maps to a service-layer function shared with the REST router; invariants live in the service,
not the tool.

## NEW — `register_project`
Create/upsert a project (idempotent by `key`).
Args: `{ key, name, platform: "android"|"ios"|"web"|"backend"|"other", repoUrl?, gitnexusRepoId?, defaultRef? }`
Returns: confirmation with the project key/platform.

## CHANGED — `start_round`
Args gain **required** `projectKey`. Conflicts reported are scoped to that project only.
Existing `source_label`, `source_kind`, `tools_detected`, `scope`, `owner_name` unchanged.
Errors with a clear message if `projectKey` is unregistered.

## NEW — `submit_architecture_unit`
Submit one architecture unit (feature root or layer sub-unit).
Args:
```jsonc
{ "projectKey": "acme-shop-web", "ruleKey": "arch:acme-shop-web:checkout",
  "title": "Checkout", "unitType": "feature", "parentId": null,
  "confidence": "high", "roundId": "…",
  "sources": [{ "path": "…", "lines": "169", "symbol": "…", "sha": "…" }],
  "content": { "overview": "…", "techStack": {…}, "entryPoints": [], "patterns": [],
               "dependencies": [], "diagrams": [{ "type": "c4_component",
               "format": "mermaid", "source": "…" }], "risk": {…},
               "provenance": { "indexCommit": "…", "generatedAt": "…" } },
  "entityLinks": [] }
```
Returns text summarizing: created vs merged, version, **computed status** (`published` for high
confidence, else `in_review`), source-overlap warnings, and related approved units — mirroring the
existing `submit_candidate` response style. Same hybrid-FSM + human-verdict-precedence rules as REST.

## CHANGED — `search_catalog`
New optional args: `projectKey`, `kind` (`business_rule|architecture`), `unitType`. `status` enum
gains `published`. **`kind` defaults to `business_rule`** when omitted (legacy behavior unchanged);
pass `kind=architecture` to query architecture units, which return `published` + `approved` by default;
`status=approved` excludes unreviewed `published`. Existing `query`/`flow`/`confidence` unchanged.

## CHANGED — `get_rule`
For architecture units, returns `content`, `parent`, and `children[]` in addition to the existing
versions/feedback/entities payload.

## NEW — `list_stale_units`
Args: `{ projectKey, ref? }`. Returns architecture units whose `content.provenance.indexCommit`
differs from the reference (defaults to the project's `defaultRef`).

## NEW prompt — `extract_architecture`
Tool-aware methodology mirroring `extract_rules`: detect tools (GitNexus-first) → `register_project`
(or confirm) → `start_round` (project-scoped, `kind` architecture intent) → enumerate modules →
per feature emit a `feature` root unit + `layer` sub-units via `submit_architecture_unit`, attaching
source-linked evidence and `provenance` → on rejection, read `list_pending_feedback` and
`submit_refinement` (reused). Methodology stays server-side so repos remain thin.

## UNCHANGED — `submit_refinement`, `list_pending_feedback`, entity tools, `complete_round`, `catalog` resource
Operate over any knowledge kind. No verdict tool is added to MCP — verdicts remain human/REST-only by
design (see plan's Parity Check note; consistent with Principle III).
