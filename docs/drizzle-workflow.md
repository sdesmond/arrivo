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

The `arrivo-migrate` image runs `drizzle-kit migrate` on every `docker compose up`. It applies only the
migrations not yet recorded, then exits; `app` starts only after it succeeds. A failed migration leaves
the app stopped and the error in `docker compose logs migrate`.

## Safety checks

- `.github/workflows/ci.yml` runs `drizzle-kit generate` and fails if it writes anything, so a
  `schema.ts` change without a migration cannot merge.
- CI applies the migrations to an empty Postgres 17 twice (first boot, re-run), both from source and
  from the built `arrivo-migrate` image.
- `scripts/migrations.test.mjs` checks the journal, SQL files and snapshots agree.
- `scripts/docker-config.test.mjs` checks the image runs `migrate` and that `drizzle/` is neither
  git-ignored nor docker-ignored.
