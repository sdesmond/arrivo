# Drizzle Workflow

Schema changes are tracked as committed SQL migrations in `drizzle/`. `src/db/schema.ts` is the source
the migrations are generated from; the `drizzle/` folder is what databases are built from.

## Changing the schema

1. Edit `src/db/schema.ts`.
2. `npm run db:generate` — writes the next `drizzle/NNNN_*.sql` plus its snapshot and journal entry.
3. Read the SQL. A column or table rename is generated as drop + add, which loses data: hand-edit the
   file to `ALTER ... RENAME` before anything has applied it.
4. `npm run db:migrate` (dev) and `npm run db:migrate:e2e` (E2E) to apply it.
5. Commit `src/db/schema.ts` and `drizzle/` together.

Never edit or delete a migration once it has merged; add a new one instead.

## Commands

| Command                  | Use                                                                       |
| ------------------------ | ------------------------------------------------------------------------- |
| `npm run db:generate`    | Create a migration from `schema.ts` changes                               |
| `npm run db:migrate`     | Apply pending migrations to `DATABASE_URL`                                |
| `npm run db:migrate:e2e` | Apply pending migrations to `E2E_DATABASE_URL`                            |
| `npm run db:push`        | Sync a throwaway local DB straight from `schema.ts`, bypassing migrations |

Don't use `db:push` on a database you later run `db:migrate` against: it creates tables without recording
them in `drizzle.__drizzle_migrations`, so the baseline migration then fails with "already exists". Reset
the database instead (see [SETUP.md](../SETUP.md#resetting-to-a-clean-state)). The same applies to the E2E
database: if it was ever built with `push`, run `npm run db:reset:e2e` before `npm run db:migrate:e2e`
(`npm run test:e2e` does this for you).

## Self-hosting

The app image applies migrations each time it starts, before the server listens
(`docker/entrypoint.sh` runs `src/db/migrate.ts`, bundled to `/app/migrate.mjs`). It uses drizzle-orm's
migrator under a Postgres advisory lock, so two containers starting together don't race. It writes the same
`drizzle.__drizzle_migrations` journal as `drizzle-kit migrate` and applies only migrations not yet recorded.
A failed migration stops the container before it serves anything, and the error is in `docker logs arrivo`.

## Safety checks

- `.github/workflows/ci.yml` runs `drizzle-kit generate` and fails if it writes anything, so a
  `schema.ts` change without a migration cannot merge.
- CI applies the migrations to an empty Postgres 17 twice from source (first boot, re-run). Its
  `docker-smoke` job then boots the compose stack on the built image, restarts it, and checks the
  app is healthy both times.
- `scripts/migrations.test.mjs` checks the journal, SQL files and snapshots agree.
- `scripts/docker-config.test.mjs` checks the image bundles the migrator, ships `drizzle/`, and
  migrates before starting the server, and that `drizzle/` is neither git-ignored nor docker-ignored.
