# Drizzle Workflow

Arrivo is currently on a pre-release Drizzle workflow.

## Current default

- `src/db/schema.ts` is the only tracked schema source of truth.
- `npm run db:push` is the active setup and local development command.
- `npm run db:migrate` is a temporary alias to `db:push` to avoid churn in scripts and docs.
- Generated `drizzle/` artifacts are intentionally not tracked in Git during this phase.

## Self-hosting during pre-release

- Local setup and Docker/self-hosting bootstrap from schema code alone.
- The container entrypoint runs a schema `push` on boot.
- This boot-time `push` is acceptable only for controlled pre-release environments.

## Production-ready cutover

Before general production rollout:

1. Freeze schema changes for the cutover PR.
2. Generate the first migration baseline from the current schema.
3. Commit the `drizzle/` artifacts.
4. Change `db:migrate` to run real tracked migrations.
5. Stop applying schema changes automatically during container startup.
6. Run migrations as an explicit deploy step for staging and production.

## Post-cutover split

- Local/dev can keep using `npm run db:push` for fast bootstrap and resets.
- Shared, persistent, staging, and production databases should use `npm run db:migrate`.
