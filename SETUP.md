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

Creates one demo user and two fully populated sample trips (Tokyo 2026, Lisbon 2026).

**Demo credentials:**

```
Email:    demo@packt.local
Password: demo1234
```

The seed is idempotent — safe to run multiple times; exits early if the demo user already exists.

---

## 3. Environment variables

`npm run setup:dev` creates `.env` from `.env.example`, preserves existing non-empty values, generates `NEXTAUTH_SECRET` when needed, and sets database URLs for the selected backend.

| Variable                 | Description                                    | Example default                                   |
| ------------------------ | ---------------------------------------------- | ------------------------------------------------- |
| `DATABASE_URL`           | PostgreSQL connection string                   | `postgres://packt:packt@localhost:5432/packt`     |
| `E2E_DATABASE_URL`       | Dedicated PostgreSQL connection string for E2E | `postgres://packt:packt@localhost:5432/packt_e2e` |
| `NEXTAUTH_URL`           | Full URL of the app                            | `http://localhost:3000`                           |
| `NEXTAUTH_SECRET`        | Random secret ≥ 32 bytes                       | generated automatically                           |
| `ALLOW_SIGNUP`           | Expose the sign-up page                        | `true`                                            |
| `E2E_EMAIL`              | E2E login email                                | `e2e@packt.local`                                 |
| `E2E_PASSWORD`           | E2E login password                             | `e2e1234`                                         |
| `HIDE_OVERLAY`           | Hides the Next.js dev overlay indicator        | `true`                                            |
| `STORAGE_PROVIDER`       | Active file-storage adapter                    | `local`                                           |
| `STORAGE_LOCAL_ROOT_DIR` | Local adapter root directory                   | `./.dev-storage`                                  |

Local uploads are written under `STORAGE_LOCAL_ROOT_DIR` and served through `/api/storage/...`.

---

## 4. Manual fallback

If you prefer to run the steps yourself instead of using the bootstrap script:

```bash
npm install
cp .env.example .env
```

If using local PostgreSQL and the default connection string:

```bash
psql -d postgres -c "CREATE ROLE packt LOGIN PASSWORD 'packt';"
psql -d postgres -c "CREATE DATABASE packt OWNER packt;"
psql -d postgres -c "CREATE DATABASE packt_e2e OWNER packt;"
```

If using Docker:

```bash
docker compose up -d db
```

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

| Script               | What it does                                                  |
| -------------------- | ------------------------------------------------------------- |
| `npm run db:push`    | Push schema to DB from `src/db/schema.ts`                     |
| `npm run db:migrate` | Temporary alias for `db:push` until tracked migrations return |
| `npm run db:seed`    | Insert demo user and sample trip data                         |
| `npm run db:studio`  | Open Drizzle Studio GUI at port 4983                          |

---

## Schema overview

Defined in `src/db/schema.ts`.

**Auth tables** (required by NextAuth v5): `users`, `accounts`, `sessions`, `verification_tokens`

**App tables**: `trips`, `days`, `events`, `documents`, `collaborators`, `packing_items`

All child tables cascade-delete from `trips`.

---

## Resetting to a clean state

```bash
psql -d postgres -c "DROP DATABASE packt;"
psql -d postgres -c "CREATE DATABASE packt OWNER packt;"
npm run db:push
npm run db:seed
```
