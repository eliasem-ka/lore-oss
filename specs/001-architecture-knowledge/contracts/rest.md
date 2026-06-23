# REST Contract — Architecture Knowledge

Base: `/api`. Errors keep the existing envelope: `400` Zod validation
(`{error, issues}`), `404` not-found (`RULE_NOT_FOUND`/`ROUND_NOT_FOUND`/`PROJECT_NOT_FOUND`),
`422` other `LoopError` (`{error, code}`). New code: `PROJECT_NOT_FOUND`.

## NEW — Projects

### `POST /api/projects` — register/upsert a project
Body:
```jsonc
{ "key": "acme-shop-web", "name": "Acme Shop Web", "platform": "web",
  "repoUrl": "https://…", "gitnexusRepoId": "…", "defaultRef": "d8d4688" }
```
`200` → the project row. Upserts by `key` (idempotent).

### `GET /api/projects` — list projects
`200` → `Project[]`.

### `GET /api/projects/:key/stale` — list potentially-stale architecture units
Query: `?ref=<sha>` (optional; defaults to the project's `defaultRef`).
`200` → architecture units whose `content.provenance.indexCommit` ≠ the reference. `404` if unknown key.

## CHANGED — Rounds

### `POST /api/rounds`
Body gains **required** `projectKey`:
```jsonc
{ "projectKey": "acme-shop-web", "sourceLabel": "acme_shop_web",
  "sourceKind": "gitnexus", "toolsDetected": ["gitnexus"], "scope": { "flows": ["Checkout"] },
  "ownerName": "arch-team" }
```
`200` → `{ round, conflicts }`. Conflicts are detected **only against open rounds of the same project**.
`404 PROJECT_NOT_FOUND` if `projectKey` is unregistered.

## NEW — Architecture units

### `POST /api/architecture-units` — submit an architecture unit
Body:
```jsonc
{
  "projectKey": "acme-shop-web",
  "ruleKey": "arch:acme-shop-web:checkout",      // optional; resubmit → new version
  "title": "Checkout",
  "unitType": "feature",                            // feature | layer | component
  "parentId": null,                                 // required when unitType = "layer"
  "confidence": "high",                             // high → published; med/low → in_review
  "roundId": "…",                                   // optional
  "sources": [{ "path": "features/checkout/.../CheckoutScreen.ts", "lines": "169",
                "symbol": "CheckoutScreen, CheckoutContent", "sha": "d8d4688" }],
  "content": {
    "overview": "…", "techStack": { "endpoints": [], "libraries": [], "persistence": [] },
    "entryPoints": [], "patterns": ["MVI"], "dependencies": ["payment"],
    "diagrams": [{ "type": "c4_component", "format": "mermaid", "source": "flowchart TD…" }],
    "risk": { "level": "low", "notes": "" },
    "provenance": { "indexCommit": "d8d4688", "generatedAt": "2026-05-28T20:13:11Z" }
  },
  "entityLinks": []
}
```
`200`:
```jsonc
{ "unit": { … }, "merged": false, "version": 1,
  "status": "published",                            // computed by the hybrid FSM
  "warnings": [ /* source_overlap */ ], "relatedApproved": [ … ] }
```
Behavior (service-layer): `architecture` + `high` + no prior human verdict → `published`; otherwise
`in_review`. Resubmit by `ruleKey` → new version; if a human verdict already exists → forced
`in_review` (never auto-`published`, never `approved`). Source-overlap warnings reused.

## CHANGED — Search & get

### `GET /api/rules`
New optional query params: `projectKey`, `kind` (`business_rule|architecture`),
`unitType` (`feature|layer|component`). `status` enum gains `published`.
- **`kind` defaults to `business_rule`** when omitted — the legacy catalog/review-queue (which
  never sends `kind`) keeps returning only business rules unchanged; architecture is opt-in via
  `kind=architecture`. (This prevents architecture units, whose business-rule columns are null,
  from leaking into the business-rules UI.)
- Default for `kind=architecture`: returns `published` **and** `approved`.
- `status=approved` excludes unreviewed `published` units (FR-025).
- Business-rule default behavior unchanged (`approved`).

### `GET /api/rules/:id`
For `kind=architecture`, the response additionally includes `content`, `parent` (if any), and
`children[]` (layer sub-units). Existing `ruleVersions`, `feedback`, `entities` unchanged.

## UNCHANGED behavior, extended scope — Verdicts

### `POST /api/rules/:id/feedback`
`submitVerdict` now accepts a unit in `in_review` **or** `published`. `approved` → `approved`
(human-only); `rejected`/`needs_clarification` require a comment → `rejected`. No other change.

### `POST /api/rules/:id/refine`, `POST /api/rules/bulk-feedback`, `/feedback/pending`, `/progress`
Unchanged; operate over knowledge units of any kind. `progress`/`pending` continue to work; counts now
include `published` in the status tallies.
