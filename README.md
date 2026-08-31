# Packt

A travel itinerary planning app built with Next.js (App Router), TypeScript, Tailwind CSS v4, PostgreSQL, and Drizzle ORM.

## Quick start

```bash
npm run setup:dev
npm run dev
```

Sign in at [http://localhost:3000](http://localhost:3000) with `demo@packt.local` / `demo1234`.

`npm run setup:dev` installs dependencies, configures `.env`, links the shared AI tools folders, prepares the dev and E2E databases, applies the schema, seeds demo data, and installs the Playwright Chromium browser.

To force a database mode:

```bash
npm run setup:dev -- --db=docker
npm run setup:dev -- --db=local
```

Native wrappers are also available as `./setup-dev.sh [auto|docker|local]` and `./setup-dev.ps1 -Db auto|docker|local`.

For prerequisites, manual fallback steps, and reset instructions see **[SETUP.md](./SETUP.md)**.
For the current Drizzle schema workflow and the planned migration cutover, see **[docs/drizzle-workflow.md](./docs/drizzle-workflow.md)**.

## AI Skills & Agents Setup

`.agents/` is the tracked source of truth for shared AI assets: skills in `.agents/skills`, agents in `.agents/agents`, and project memories in `.agents/memories`. `npm run setup:dev` also configures the compatibility links under `.claude/` (`skills`, `agents`, and `memory`) described in [ai-tools-setup.md](./ai-tools-setup/ai-tools-setup.md) without duplicating files.

## Self-hosting

**Prerequisites:** Docker, Docker Compose, `curl`, `openssl`

A prebuilt image publishes to [GHCR](https://github.com/sdesmond/packt/pkgs/container/packt) on every release, so no clone or local build is required.

1. Grab the compose file and env template into a new folder:

   ```sh
   mkdir packt && cd packt
   curl -O https://raw.githubusercontent.com/sdesmond/packt/main/docker-compose.yml
   curl -o .env https://raw.githubusercontent.com/sdesmond/packt/main/.env.example
   echo "NEXTAUTH_SECRET=$(openssl rand -base64 32)" >> .env
   ```

2. Pull and start:

   ```sh
   docker compose up -d
   ```

   This pulls `ghcr.io/sdesmond/packt:latest` — no build step. (Building from source instead: clone the repo and run `docker compose up -d --build`.)

   The app pushes the current Drizzle schema automatically at boot.
   This is an intentional pre-release workflow and will switch to explicit tracked migrations before general production rollout.

   Uploaded documents and cover images persist in the `packt-storage` volume (see [Storage](#storage)).

3. (Optional) Seed demo data:

   ```sh
   docker compose exec app npm run db:seed
   ```

   Signs in as `demo@packt.local` / `demo1234`.

4. Open [http://localhost:3000](http://localhost:3000).

**Updating:** `docker compose pull && docker compose up -d` — your database and uploads live in named volumes, untouched by the image update.

For a Synology NAS walkthrough (Container Manager, no CLI Docker experience required), see
**[docs/synology-install.md](./docs/synology-install.md)**.

**Session revocation:** this app uses JWT sessions. To invalidate all active sessions, rotate `NEXTAUTH_SECRET` and restart the container.

## Storage

Packt stores uploaded documents and trip cover images through a pluggable `StorageAdapter` port (`src/lib/storage/storage-adapter.ts`) instead of calling any storage backend SDK directly. The active backend is chosen by environment variable and is swappable without code changes.

### Providers

| `STORAGE_PROVIDER` | Adapter                                                               | Required env vars        |
| ------------------ | --------------------------------------------------------------------- | ------------------------ |
| `local` (default)  | `local-filesystem-adapter.ts` — writes to disk under a root directory | `STORAGE_LOCAL_ROOT_DIR` |

`local` is the only provider implemented today. Object-storage backends (e.g. S3-compatible) are a future addition, not yet built.

### How it works

- `getStorageAdapter()` resolves the active adapter once per process. It validates `STORAGE_PROVIDER` and that provider's required env vars on first use, so misconfiguration fails fast with a clear "missing X env var" error instead of surfacing deep inside an upload.
- `put(key, file)` writes the file and returns a ready-to-render URL, stored as-is in `documents.url` / `trips.coverImageUrl` — there's no separate key column or key-to-URL resolution at render time.
- Reads never expose a raw filesystem path or storage URL to the browser. Every read goes through the authenticated proxy route `GET /api/storage/[...path]`, which calls `requireUser()`, resolves and authorizes the owning trip (`resolveOwningTripId()` + `assertTripAccess()`), and only then streams bytes.
- `del(url)` is safe to call unconditionally at any call site — each adapter recognizes only its own produced-URL shape and no-ops on anything else, including URLs left over from a prior backend after a migration. Deletion failures are best-effort/logged, never thrown.
- Storage keys (e.g. `trip-document/<tripId>/<uuid>.pdf`) are generated exclusively by `createUploadStorageName()` in `src/lib/upload-policy.ts`; adapters treat them as opaque path strings and never construct or interpret their meaning.

### Switching providers

Set `STORAGE_PROVIDER` and that provider's required env vars, then redeploy — no code changes needed. Live mid-process switching isn't supported; a provider change takes effect on restart.

### Local provider

Files are written under `STORAGE_LOCAL_ROOT_DIR` and served back through `/api/storage/...`. Under Docker, `docker-compose.yml` sets `STORAGE_LOCAL_ROOT_DIR=/app/storage` and mounts a named volume (`packt-storage`) at that path so uploads survive container rebuilds and restarts.

If you swap that named volume for a host bind mount, match the bind-mounted directory's owner to the container process's UID/GID (the app container runs as root by default) — an ownership mismatch surfaces as an `EACCES`/`EPERM` error naming the failing path on the next write.

### Adding a provider

Implement the `StorageAdapter` interface (`put`/`del`/`read`) in a new file under `src/lib/storage/`, register it in `createAdapterFromEnv()`'s provider switch in `storage-adapter.ts`, and validate that provider's required env vars there. `read()` must throw `StorageNotFoundError` for a missing key so the proxy route can return 404 instead of 500.

## Tech stack

- [Next.js 16](https://nextjs.org/docs) — App Router, Server Components, Server Actions
- [NextAuth v5](https://authjs.dev) — Credentials provider, session management
- [Drizzle ORM](https://orm.drizzle.team) — schema management and type-safe queries
- [PostgreSQL](https://www.postgresql.org) — primary database
- [Tailwind CSS v4](https://tailwindcss.com) — utility-first styling
- [Base UI](https://base-ui.com) / [shadcn](https://ui.shadcn.com) — unstyled UI primitives
