# Local Development Setup

> For Docker / self-hosting setup, see the **Self-hosting** section in [README.md](./README.md).
>
> For the current pre-release Drizzle policy and the later migration cutover, see [docs/drizzle-workflow.md](./docs/drizzle-workflow.md).

## Prerequisites

- Node.js 20+
- npm
- One of:
  - Docker with `docker compose`
  - PostgreSQL 15+ with `psql`

---

## 1. Bootstrap the repo

```bash
npm run setup:dev
```

The script:

- installs npm dependencies
- installs the Playwright Chromium browser used by E2E
- creates or updates `.env`
- configures `.claude/skills`, `.claude/agents`, and `.claude/memory` to point at `.agents/*`
- prepares the main and E2E databases
- runs `npm run db:push`
- runs `npm run db:seed`
- runs `npm run db:migrate:e2e`

By default the script auto-detects the database backend:

- prefers Docker when `docker compose` is available
- otherwise uses local PostgreSQL when `psql` is available

You can force the mode explicitly:

```bash
npm run setup:dev -- --db=docker
npm run setup:dev -- --db=local
```

Native wrappers:

```bash
./setup-dev.sh docker
./setup-dev.sh local
```

```powershell
.\setup-dev.ps1 -Db docker
.\setup-dev.ps1 -Db local
```

---

## 2. Start the dev server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) and sign in with the demo credentials.

Creates three accounts with six trips between them — an active trip, a past trip, a dateless "someday" trip,
an upcoming trip owned by a second account and shared back to the first, another second-account past trip,
and a second dateless trip — plus a cross-account share and a pending + a declined invitation, so the app has
realistic data to explore out of the box. Full breakdown, including exactly what each trip contains and why:
**[docs/dev-seed-data.md](./docs/dev-seed-data.md)**.

**Demo credentials** (all three accounts use the same password):

```
Email:    demo@arrivo.com
Password: demo1234
```

Two more accounts (`alex@arrivo.com`, `sam@arrivo.com`) exist for exercising sharing and a second profile —
see the doc above.

`db:seed` wipes and reseeds just these three seed accounts on every run — safe to run repeatedly, and it never
touches any other account in the database.

---

## 3. Environment variables

`npm run setup:dev` creates `.env` from `.env.example`, preserves existing non-empty values, generates `NEXTAUTH_SECRET` when needed, and sets database URLs for the selected backend.

| Variable                 | Description                                    | Example default                                      |
| ------------------------ | ---------------------------------------------- | ---------------------------------------------------- |
| `DATABASE_URL`           | PostgreSQL connection string                   | `postgres://arrivo:arrivo@localhost:5432/arrivo`     |
| `E2E_DATABASE_URL`       | Dedicated PostgreSQL connection string for E2E | `postgres://arrivo:arrivo@localhost:5432/arrivo_e2e` |
| `NEXTAUTH_URL`           | Full URL of the app                            | `http://localhost:3000`                              |
| `NEXTAUTH_SECRET`        | Random secret ≥ 32 bytes                       | generated automatically                              |
| `ALLOW_SIGNUP`           | Expose the sign-up page                        | `true`                                               |
| `E2E_EMAIL`              | E2E login email                                | `e2e@arrivo.com`                                     |
| `E2E_PASSWORD`           | E2E login password                             | `e2e1234`                                            |
| `HIDE_OVERLAY`           | Hides the Next.js dev overlay indicator        | `true`                                               |
| `STORAGE_PROVIDER`       | Active file-storage adapter                    | `local`                                              |
| `STORAGE_LOCAL_ROOT_DIR` | Local adapter root directory                   | `./.dev-storage`                                     |

Local uploads are written under `STORAGE_LOCAL_ROOT_DIR` and served through `/api/storage/...`. See the **[Storage](./README.md#storage)** section in README.md for how the adapter, providers, and Docker storage mount work.

The table shows the local PostgreSQL defaults (port `5432`). With `--db=docker`, `setup:dev` writes port `5433` instead.

### Which database am I using?

The port in `DATABASE_URL` tells you:

| Port   | Database                                                           |
| ------ | ------------------------------------------------------------------ |
| `5433` | Docker container `arrivo-dev-db-1` (from `docker-compose.dev.yml`) |
| `5432` | PostgreSQL installed on your machine                               |

Check it without printing the password:

```powershell
(Select-String .env -Pattern '^DATABASE_URL=').Line -replace ':[^:@/]*@',':***@'
```

The Docker container publishes `5433` on purpose. A host PostgreSQL normally owns `5432`, and both can listen on it at once on Windows, so `localhost:5432` may silently reach the host database instead of the container.

- **The container must be running.** Check with `docker ps`. If it's stopped (after a reboot, for example), start it with `docker compose -f docker-compose.dev.yml up -d db`. The app does not fall back to the host database.
- **The E2E database is created for you.** `--db=docker` creates `arrivo_e2e` in the container if it's missing, because the compose file only provisions `arrivo`.
- **Switching databases means signing in again.** Each database has its own user IDs, so a session from one database shows "trip not found" against the other. Sign out and back in, or clear the `localhost:3000` cookies.
- **Re-running `setup:dev` rewrites the URLs** to match the mode you pass (`--db=docker` or `--db=local`). With `--db=auto`, Docker is used when the daemon is reachable.

---

## 4. Manual fallback

If you prefer to run the steps yourself instead of using the bootstrap script:

```bash
npm install
cp .env.example .env
```

If using local PostgreSQL and the default connection string:

```bash
psql -d postgres -c "CREATE ROLE arrivo LOGIN PASSWORD 'arrivo';"
psql -d postgres -c "CREATE DATABASE arrivo OWNER arrivo;"
psql -d postgres -c "CREATE DATABASE arrivo_e2e OWNER arrivo;"
```

If using Docker (PostgreSQL 17 on `localhost:5433`, data in a named volume; `npm run setup:dev -- --db=docker` writes the matching `DATABASE_URL`/`E2E_DATABASE_URL` to `.env`, otherwise set them to port `5433` yourself):

```bash
docker compose -f docker-compose.dev.yml up -d db
docker compose -f docker-compose.dev.yml exec -T db psql -U arrivo -d postgres -c "CREATE DATABASE arrivo_e2e OWNER arrivo;"
```

`docker-compose.dev.yml` is the dev database only. `docker-compose.yml` is the self-hosting stack and doesn't expose the database to the host.

Then finish with:

```bash
npm run db:push
npm run db:seed
npm run db:migrate:e2e
```

This repo is intentionally using a pre-release `push` workflow right now.
Tracked `drizzle/` migrations return at production cutover, not during day-to-day local setup.

---

## Database scripts

| Script               | What it does                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| `npm run db:push`    | Push schema to DB from `src/db/schema.ts`                                                      |
| `npm run db:migrate` | Temporary alias for `db:push` until tracked migrations return                                  |
| `npm run db:seed`    | Wipe + reseed the three dev seed accounts and their trips ([details](./docs/dev-seed-data.md)) |
| `npm run db:studio`  | Open Drizzle Studio GUI at port 4983                                                           |

---

## Schema overview

Defined in `src/db/schema.ts`.

**Auth tables** (required by NextAuth v5): `users`, `accounts`, `sessions`, `verification_tokens`

**App tables**: `trips`, `days`, `events`, `documents`, `collaborators`, `packing_items`

All child tables cascade-delete from `trips`.

---

## Resetting to a clean state

```bash
psql -d postgres -c "DROP DATABASE arrivo;"
psql -d postgres -c "CREATE DATABASE arrivo OWNER arrivo;"
npm run db:push
npm run db:seed
```
