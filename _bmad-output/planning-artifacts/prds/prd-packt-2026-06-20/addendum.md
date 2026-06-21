# Addendum — Offline Functionality for Packt

_Technical-how content volunteered during PRD Discovery that belongs in architecture/solution design, not the PRD body. Capabilities these support are in `prd.md` as FR1–FR13 (FR12 was descoped; see `prd.md` Out of Scope)._

## Architecture direction (informs FR1–FR4, FR7, FR9)

- Hybrid Service Worker + IndexedDB as the offline backbone.
- Relational mirror in IndexedDB (not a document-store) — chosen for sync simplicity over raw read speed.
- Offline = live degraded mode, not a static export — same app shell, different data source.

## Storage backend abstraction (informs FR10)

- `StorageProvider` interface with `LocalFolderProvider` and `VercelBlobProvider` implementations.
- `STORAGE_PROVIDER` env var selects implementation via factory.
- Self-hosted local folder runs as `fs` access inside a Docker volume mount — not a filesystem watcher.

## Sync mechanics (informs FR1, FR3, FR4, FR8)

- Staged upload with sync replay: offline-created documents blob-store in IndexedDB locally, replay through the standard upload API pipeline on reconnect.
- Connection-adaptive sync: on reconnect, compare local `last_synced_at` against server `updated_at`. No server-side changes → silent push. Server has changes → review prompt (FR8's conflict review page).
- Reconnect detection via `navigator.onLine` plus a health-check ping (not `navigator.onLine` alone, which is unreliable).

## Smart Pin (informs FR6)

- `offline_settings` table: scoped globally to the user (not `trip_id`-keyed) — `auto_lead_days`, plus per-trip `pinned_at` tracked separately on the trip itself.
- On app startup, check upcoming trips within the lead window and auto-download; skip re-download if already cached.
- User-facing toggle lives in Profile & Settings → Preferences, applied globally — no per-trip override surface (narrowed from per-trip-or-global during UX design, `ux-packt-2026-06-20`).

## Auto-cleanup (informs FR11)

- `offline_cleanup_at` derived from trip end date + grace period.
- Checked/evicted on app startup and on trip deletion.
- Default grace period: 7 days, configurable.

## Attribution copy (informs FR2, FR8)

- Single-device-multi-session and true-collaborator conflicts use the identical sync/resolution mechanism.
- Only the attribution string shown to the user differs: "you, on another device" vs. a named collaborator. This is a copy/UI decision for the conflict review page, not a branch in the underlying mechanism.
