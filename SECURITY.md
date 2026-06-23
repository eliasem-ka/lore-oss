# Security Policy

## Supported versions

Lore is pre-1.0. Security fixes land on `main`; please track the latest commit.

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Instead, report privately via one of:

- GitHub's [private security advisories](https://github.com/eliasem-ka/lore-oss/security/advisories/new) (preferred), or
- email **elias.eguizabal@gmail.com** with the subject `SECURITY: lore-oss`.

Please include: a description, reproduction steps or a proof of concept, the affected
component, and the impact you foresee. You'll get an acknowledgement within a few days.

## Scope notes

Lore's most safety-critical property is **tenant isolation**: every tenant query is scoped
by `workspace_id`, and a cross-tenant read must be indistinguishable from not-found. A way to
read or write across workspace boundaries is a high-severity issue — please report it.

Authentication uses JWT (HS256); production **requires** `JWT_SECRET` (the server hard-fails
without it). Never commit secrets — `.env` is git-ignored; only `.env.example` ships.
