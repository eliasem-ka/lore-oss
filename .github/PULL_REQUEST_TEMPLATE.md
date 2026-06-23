<!-- Thanks for contributing to Lore! Keep PRs focused. -->

## What & why

<!-- What does this change and why? Link any related issue (e.g. Closes #12). -->

## Type of change

- [ ] Bug fix
- [ ] New feature / capability
- [ ] Refactor (no behavior change)
- [ ] Docs
- [ ] Chore / tooling

## Checklist

- [ ] `npm run build` passes (server **and** client)
- [ ] `npm test` passes (server)
- [ ] I read [`docs/CONSTITUTION.md`](../docs/CONSTITUTION.md) and did not violate its invariants
      (state/invariants stay in `domain/` + `services/`; new capabilities go through the registry;
      repos stay persistence-only; side-effects via the event bus; tenant queries scoped by `workspace_id`)
- [ ] New/changed FSM transitions, kind policies, or lifecycle have tests
- [ ] Schema changes go through a Drizzle migration (no ad-hoc DDL)

## Notes for reviewers

<!-- Anything worth calling out: tradeoffs, follow-ups, screenshots, etc. -->
