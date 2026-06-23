# Quickstart — Architecture Knowledge (exercise the loop)

Prereqs: `docker compose up postgres -d`, then from `server/`: `npm run db:migrate && npm run dev`
(Express on :3000). Examples use REST; every step has an MCP equivalent (see `contracts/mcp.md`).

## 1. Register a project
```bash
curl -sX POST localhost:3000/api/projects -H 'content-type: application/json' -d '{
  "key": "acme-shop-web", "name": "Acme Shop Web", "platform": "web",
  "defaultRef": "d8d4688" }'
```

## 2. Start a project-scoped round
```bash
curl -sX POST localhost:3000/api/rounds -H 'content-type: application/json' -d '{
  "projectKey": "acme-shop-web", "sourceLabel": "acme_shop_web",
  "sourceKind": "gitnexus", "toolsDetected": ["gitnexus"],
  "scope": { "flows": ["Checkout"] }, "ownerName": "arch-team" }'
```

## 3a. Submit a HIGH-confidence architecture unit → auto-`published`
```bash
curl -sX POST localhost:3000/api/architecture-units -H 'content-type: application/json' -d '{
  "projectKey": "acme-shop-web", "ruleKey": "arch:acme-shop-web:checkout",
  "title": "Checkout", "unitType": "feature", "confidence": "high",
  "sources": [{ "path": "features/checkout/.../CheckoutScreen.ts", "lines": "169",
                "symbol": "CheckoutScreen", "sha": "d8d4688" }],
  "content": { "overview": "Central orchestrator for the order checkout funnel.",
    "techStack": { "endpoints": [], "libraries": ["Hilt"], "persistence": ["Room"] },
    "entryPoints": ["CheckoutScreen"], "patterns": ["MVI"], "dependencies": ["payment"],
    "diagrams": [{ "type": "c4_component", "format": "mermaid", "source": "flowchart TD\n A-->B" }],
    "risk": { "level": "low", "notes": "" },
    "provenance": { "indexCommit": "d8d4688", "generatedAt": "2026-05-28T20:13:11Z" } } }'
# → status: "published"  (searchable immediately, NOT human-approved)
```

## 3b. Submit a LOW-confidence layer sub-unit → `in_review`
```bash
# parentId = the id returned in 3a
curl -sX POST localhost:3000/api/architecture-units -H 'content-type: application/json' -d '{
  "projectKey": "acme-shop-web", "title": "Checkout · data layer",
  "unitType": "layer", "parentId": "<checkout-feature-id>", "confidence": "low",
  "content": { "overview": "Repository wiring for checkout.", "layer": "data",
    "provenance": { "indexCommit": "d8d4688", "generatedAt": "2026-05-28T20:13:11Z" } } }'
# → status: "in_review"  (enters the reviewer queue)
```

## 4. Search — published surfaces immediately
```bash
curl -s 'localhost:3000/api/rules?projectKey=acme-shop-web&kind=architecture'        # published + approved
curl -s 'localhost:3000/api/rules?projectKey=acme-shop-web&kind=architecture&status=approved'  # excludes unreviewed published
```

## 5. Human review (the gate to `approved`)
```bash
# approve the published feature → becomes human-approved
curl -sX POST localhost:3000/api/rules/<checkout-feature-id>/feedback -H 'content-type: application/json' -d '{
  "verdict": "approved", "reviewerName": "Ana" }'

# reject the low-confidence layer (comment REQUIRED)
curl -sX POST localhost:3000/api/rules/<layer-id>/feedback -H 'content-type: application/json' -d '{
  "verdict": "rejected", "comment": "Repository class names are wrong.", "reviewerName": "Ana" }'
```

## 6. Agent refines from feedback (loop closes)
```bash
curl -s 'localhost:3000/api/feedback/pending'                       # agent reads the rejection
curl -sX POST localhost:3000/api/rules/<layer-id>/refine -H 'content-type: application/json' -d '{
  "addressesFeedbackIds": ["<feedback-id>"], "changeNote": "Corrected repository names." }'
# → new version, back in_review, addressed feedback resolved
```

## 7. Staleness
```bash
curl -s 'localhost:3000/api/projects/acme-shop-web/stale?ref=NEWSHA'   # units whose indexCommit ≠ NEWSHA
```

## Acceptance smoke (maps to spec)
- 3a returns `published`, 3b returns `in_review` → **US1 / FR-013/014**.
- 4 `status=approved` excludes the unreviewed published unit → **FR-025 / SC-002**.
- 5 reject without `comment` is refused (422 `COMMENT_REQUIRED`) → **FR-018 / SC-003**.
- 6 produces a new version and resolves feedback → **US2 / SC-004**.
- A second project never appears in `projectKey=acme-shop-web` results → **US3 / SC-005**.

## Tests
From `server/`: `npm test` (vitest, `EMBEDDING_PROVIDER=none`). New cases live in
`src/services/loop.test.ts` covering every guard in `data-model.md` (Principle V). `npm run build`
must be clean before done.
