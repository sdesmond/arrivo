# Local Development Setup

> For Docker / self-hosting setup, see the **Self-hosting** section in [README.md](./README.md).

## Prerequisites

- Node.js 20+
- PostgreSQL 15+ running locally (or a hosted connection string)

---

## 1. Install dependencies

```bash
npm install
```

---

## 2. Configure environment variables

```bash
cp .env.example .env
```

| Variable | Description | Example default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://packt:packt@localhost:5432/packt` |
| `NEXTAUTH_URL` | Full URL of the app | `http://localhost:3000` |
| `NEXTAUTH_SECRET` | Random secret ≥ 32 bytes | run `openssl rand -base64 32` |
| `ALLOW_SIGNUP` | Expose the sign-up page | `true` |

---

## 3. Create the PostgreSQL database

If using the default connection string, create the role and database first:

```bash
psql -U postgres -c "CREATE USER packt WITH PASSWORD 'packt';"
psql -U postgres -c "CREATE DATABASE packt OWNER packt;"
```

---

## 4. Apply the schema

Push the Drizzle schema directly to the database (recommended for local dev):

```bash
npm run db:push
```

For tracked migration files (recommended for production or team environments):

```bash
npm run db:generate   # generates SQL files into ./drizzle/
npm run db:migrate    # applies pending migrations
```

---

## 5. Seed demo data

```bash
npm run db:seed
```

Creates one demo user and two fully populated sample trips (Tokyo 2026, Lisbon 2026).

**Demo credentials:**

```
Email:    demo@packt.local
Password: demo1234
```

The seed is idempotent — safe to run multiple times; exits early if the demo user already exists.

---

## 6. Start the dev server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) and sign in with the demo credentials.

---

## Database scripts

| Script | What it does |
|---|---|
| `npm run db:push` | Push schema to DB (no migration files, dev shortcut) |
| `npm run db:generate` | Generate SQL migration files from schema changes |
| `npm run db:migrate` | Apply pending migration files |
| `npm run db:seed` | Insert demo user and sample trip data |
| `npm run db:studio` | Open Drizzle Studio GUI at port 4983 |

---

## Schema overview

Defined in `src/db/schema.ts`.

**Auth tables** (required by NextAuth v5): `users`, `accounts`, `sessions`, `verification_tokens`

**App tables**: `trips`, `days`, `events`, `documents`, `collaborators`, `packing_items`

All child tables cascade-delete from `trips`.

---

## Resetting to a clean state

```bash
psql -U postgres -c "DROP DATABASE packt;"
psql -U postgres -c "CREATE DATABASE packt OWNER packt;"
npm run db:push
npm run db:seed
```
