# Brainstorm Intent: Storage Backend for Images/Documents

## Goal

Replace Vercel-Blob-only storage with a backend that works self-hosted in any container (e.g. Synology NAS via Docker), while still optionally supporting external providers like S3-compatible services. Storage is currently faked/stubbed — no abstraction layer exists yet, and this design is a prerequisite blocker before containerized deployment can happen.

## Key Constraints

- Backend target is generic container/Docker volume storage, not Synology-specific — must be portable to any host.
- Must be trivially reconfigurable: swap storage provider via env vars/minimal config, changeable any time without code changes.
- Redeploy-to-switch is acceptable — no live-switching requirement.
- Config surface = env vars (a selector var + per-provider vars); secrets never baked into image or git.
- Migration path (when needed later) = one-time migration script: copy existing files to new backend, then flip config. No dual-read or per-file backend tracking.
- Container non-root UID vs. bind-mounted volume ownership is a real risk (EACCES on write, often invisible in dev) — must be handled explicitly, not discovered in production.

## Chosen Architecture Direction

- Introduce a `StorageAdapter` interface as the core abstraction (doesn't exist today; app likely calls Vercel-Blob-shaped APIs directly).
- Default/primary adapter: local filesystem, using the PUID/PGID env-var pattern + single bind-mounted volume + env-var config — the proven self-hosted-Docker convention (confirmed via the Spoolman-on-Synology reference guide, mariushosting.com).
- Access path: proxy-through-app (app mediates reads/writes; no direct external URLs required for local storage).
- Config selector: `STORAGE_PROVIDER` env var chooses the adapter; per-provider settings via their own env vars; secrets never committed.
- Resolution insight: front-load complexity into one `StorageAdapter` interface built for local disk anyway — each additional backend (e.g. S3-compatible) becomes one small adapter file behind that interface, not systemic complexity. This removes the simplicity-vs-multi-backend tradeoff.

## Scope (MoSCoW)

**Must**
- `StorageAdapter` interface
- Local filesystem adapter (default), with PUID/PGID + bind mount
- Proxy-through-app access path
- Env-var config (`STORAGE_PROVIDER` selector; secrets never in git/JSON)

**Should**
- S3-compatible adapter (covers AWS S3, MinIO, Backblaze B2, Cloudflare R2 — one adapter serves all)

**Won't (this round)**
- Migration script — no legacy data exists yet; verify-then-cutover approach deferred until it's actually needed
- Image resize/optimization — current no-processing behavior stays as-is

## Explicitly Out of Scope

- **Vercel Blob adapter** — dropped entirely; the S3-compatible adapter already covers this need, so a dedicated Vercel Blob adapter would be redundant.
- **Migration script** — deferred; not needed until real legacy data exists to migrate.
- **Image resize/optimization** — out of scope for this design; unrelated to the storage abstraction problem.
