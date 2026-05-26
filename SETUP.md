# Local Development Setup

> For Docker / self-hosting setup, see the **Self-hosting** section in [README.md](./README.md).
>
> For the current pre-release Drizzle policy and the later migration cutover, see [docs/drizzle-workflow.md](./docs/drizzle-workflow.md).

## Prerequisites

- Node.js 20.12+
- npm
- Git
- Internet access for `npm`/`npx` package downloads and BMad module fetches
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
- restores the repo's BMad modules and tool integration from `_bmad/_config/manifest.yaml`
- installs the Playwright Chromium browser used by E2E
- creates or updates `.env`
- configures `.claude/skills` and `.claude/agents` to point at `.agents/*`
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

| Variable                | Description                                      | Example default                                   |
| ----------------------- | ------------------------------------------------ | ------------------------------------------------- |
| `DATABASE_URL`          | PostgreSQL connection string                     | `postgres://packt:packt@localhost:5432/packt`     |
| `E2E_DATABASE_URL`      | Dedicated PostgreSQL connection string for E2E   | `postgres://packt:packt@localhost:5432/packt_e2e` |
| `NEXTAUTH_URL`          | Full URL of the app                              | `http://localhost:3000`                           |
| `NEXTAUTH_SECRET`       | Random secret ≥ 32 bytes                         | generated automatically                           |
| `ALLOW_SIGNUP`          | Expose the sign-up page                          | `true`                                            |
| `E2E_EMAIL`             | E2E login email                                  | `e2e@packt.local`                                 |
| `E2E_PASSWORD`          | E2E login password                               | `e2e1234`                                         |
| `HIDE_OVERLAY`          | Hides the Next.js dev overlay indicator          | `true`                                            |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token for real uploads               | blank                                             |
| `UPLOAD_STUB`           | Local file upload fallback when blob token blank | `true`                                            |

If `BLOB_READ_WRITE_TOKEN` is blank, local uploads are written under `public/uploads`.

---

## 4. BMad setup

This repo tracks its BMad installation manifest at `_bmad/_config/manifest.yaml`.

`npm run setup:dev` uses that manifest to reconstruct the installed BMad state by:

- using the recorded installer version for bundled `core` and `bmm`
- installing the recorded module set
- pinning external modules to the exact versions from the manifest
- applying the recorded IDE/tool integration, currently `claude-code`

That keeps bootstrap reproducible instead of floating to newer stable BMad module releases.

---

## 5. Manual fallback

If you prefer to run the steps yourself instead of using the bootstrap script:

```bash
npm install
cp .env.example .env
npx -y bmad-method@6.6.0 install --yes --action update --modules bmm,bmb,tea,baut,cis --tools claude-code --pin bmb=v1.8.0 --pin tea=v1.17.0 --pin baut=v1.14.2 --pin cis=v0.2.0
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
