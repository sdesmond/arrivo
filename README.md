# Arrivo

[![Sponsor on GitHub](https://img.shields.io/badge/Sponsor-GitHub-ea4aaa?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/sdesmond)

A travel itinerary planning app built with Next.js (App Router), TypeScript, Tailwind CSS v4, PostgreSQL, and Drizzle ORM.

## Quick start

```bash
npm run setup:dev
npm run dev
```

Sign in at [http://localhost:3000](http://localhost:3000) with username `demo` / password `demo1234` (four more seed accounts, including the `admin` app administrator, same password, are described in **[docs/dev-seed-data.md](./docs/dev-seed-data.md)**).

`npm run setup:dev` installs dependencies, configures `.env`, links the shared AI tools folders, prepares the dev and E2E databases, applies the database migrations, seeds demo data, and installs the Playwright Chromium browser.

To force a database mode:

```bash
npm run setup:dev -- --db=docker
npm run setup:dev -- --db=local
```

Native wrappers are also available as `./setup-dev.sh [auto|docker|local]` and `./setup-dev.ps1 -Db auto|docker|local`.

For prerequisites, manual fallback steps, and reset instructions see **[SETUP.md](./SETUP.md)**.
For how schema changes and migrations work (generate, review, commit `drizzle/`), see **[docs/drizzle-workflow.md](./docs/drizzle-workflow.md)**.

## AI Skills & Agents Setup

`.agents/` is the tracked source of truth for shared AI assets: skills in `.agents/skills`, agents in `.agents/agents`, and project memories in `.agents/memories`. `npm run setup:dev` also configures the compatibility links under `.claude/` (`skills` and `agents`) described in [ai-tools-setup.md](./ai-tools-setup/ai-tools-setup.md) without duplicating files.

## Self-hosting

Arrivo ships as one prebuilt image plus PostgreSQL and runs on any host with Docker: a Linux server, a NAS or a Raspberry Pi. Download one compose file and run `docker compose up -d`; nothing else to configure. **Guide: [docs/self-hosting.md](./docs/self-hosting.md)** (quick start, configuration, HTTPS, updates, backups, troubleshooting). Publishing new images: [docs/releasing.md](./docs/releasing.md).

To build from source instead, see [Building from source](./docs/building-from-source.md).

## Storage

Arrivo stores uploaded documents and trip cover images through a pluggable `StorageAdapter` port (`src/lib/storage/storage-adapter.ts`) instead of calling any storage backend SDK directly. The active backend is chosen by environment variable and is swappable without code changes.

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

Files are written under `STORAGE_LOCAL_ROOT_DIR` and served back through `/api/storage/...`. Under Docker, the image sets `STORAGE_LOCAL_ROOT_DIR=/app/storage` and `docker-compose.yml` bind-mounts the host folder `./data/storage` at that path so uploads survive container rebuilds and restarts and are visible to host backups.

The container starts as root only to re-own that folder to `PUID`/`PGID` (default `1000`/`1000`), then runs the app as that user. If you instead set a non-root `user:` in compose, the re-owning step is skipped, so match the host folder's owner to that UID/GID yourself. An ownership mismatch surfaces as an `EACCES`/`EPERM` error naming the failing path on the next write.

### Adding a provider

Implement the `StorageAdapter` interface (`put`/`del`/`read`) in a new file under `src/lib/storage/`, register it in `createAdapterFromEnv()`'s provider switch in `storage-adapter.ts`, and validate that provider's required env vars there. `read()` must throw `StorageNotFoundError` for a missing key so the proxy route can return 404 instead of 500.

## Tech stack

- [Next.js 16](https://nextjs.org/docs) — App Router, Server Components, Server Actions
- [NextAuth v5](https://authjs.dev) — Credentials provider, session management
- [Drizzle ORM](https://orm.drizzle.team) — schema management and type-safe queries
- [PostgreSQL](https://www.postgresql.org) — primary database
- [Tailwind CSS v4](https://tailwindcss.com) — utility-first styling
- [Base UI](https://base-ui.com) / [shadcn](https://ui.shadcn.com) — unstyled UI primitives

## Support Arrivo

Arrivo is free, open-source software built by an independent developer. If it's useful to you, you can
[sponsor its development on GitHub](https://github.com/sponsors/sdesmond), either once or monthly. Sponsorships fund
new features, fixes and maintenance; Arrivo stays free and open source either way.

## Security

To report a vulnerability, see [SECURITY.md](./SECURITY.md). Please don't open a public issue.

## License

Arrivo is licensed under the [GNU Affero General Public License v3.0](./LICENSE). You may self-host, modify and
redistribute it. If you run a modified version as a network service, you must make your modified source available to
its users.
