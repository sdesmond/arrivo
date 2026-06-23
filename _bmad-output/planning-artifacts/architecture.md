---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
status: "complete"
completedAt: "2026-06-21"
inputDocuments:
  - "_bmad-output/planning-artifacts/prds/prd-packt-2026-06-20/prd.md"
  - "_bmad-output/planning-artifacts/prds/prd-packt-2026-06-20/addendum.md"
  - "_bmad-output/planning-artifacts/ux-designs/ux-packt-2026-06-20/DESIGN.md"
  - "_bmad-output/planning-artifacts/ux-designs/ux-packt-2026-06-20/EXPERIENCE.md"
  - "docs/drizzle-workflow.md"
  - "_bmad-output/project-context.md"
workflowType: "architecture"
project_name: "Packt"
user_name: "Spencer"
date: "2026-06-21"
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**

12 FRs across 3 categories (FR12 — offline search — was descoped during UX design):

- **Sync & Conflict Resolution** (FR1–FR4): automatic background sync on reconnect; per-entity-tier conflict resolution (packing list = last-write-wins, itinerary = prompt-merge, documents = silent auto-merge except deletions, which prompt-merge); document upload queue with visible status/progress; connection-adaptive sync comparing local `last_synced_at` against server `updated_at` to decide silent push vs. review prompt.
- **Offline UX & User Control** (FR5–FR9): pin-for-offline (downloads itinerary/days/events/documents); Smart Pin global auto-pin by configurable lead-time window (with Wi-Fi-only restriction); stable local identity + pending-sync badge for offline-created items; dedicated conflict review screen before server changes apply; full read/write parity offline (only map/address lookup and third-party API calls stay online-only).
- **Storage & Lifecycle** (FR10, FR11, FR13): swappable storage backend (local-folder vs. cloud blob) via config, no fork required; auto-eviction of offline trip data after a grace period post-trip-end (default 7 days, configurable); graceful failure with no partial/corrupted local state when storage can't fit a pin/sync.

**Non-Functional Requirements:**

- **NFR1** — no sync/conflict path may silently discard user data → drives the tiered conflict-resolution model (auto-safe by tier vs. user-confirmed).
- **NFR2** — storage backend swap requires no schema/entity-model changes → drives a `StorageProvider` interface with interchangeable implementations behind a factory/config switch.
- **NFR3** — local storage read/write/search runs off the main thread → drives async/Web Worker access patterns for IndexedDB, never blocking UI rendering.
- **NFR4** — reconnect detection and sync trigger within seconds of connectivity returning → drives active health-check polling, not reliance on `navigator.onLine` alone.

**UX-driven architectural implications:**

- New icon-state vocabulary spans 3 surfaces (`TripCover` pin icon, connectivity indicator across 3 slots, `DocRow` family across 3 components) — no new visual system, but real wiring into 8+ existing component files (`trip-card.tsx`, `trip-hero.tsx`, `trips-topbar.tsx`, `trip-detail-crumb.tsx`, `trips-mobile-layout.tsx`, `doc-row.tsx`, `event-doc-row.tsx`, `reservation-doc-row.tsx`).
- New full-takeover Conflict Review dialog extending `Dialog`/`DialogContent` beyond its default small-popup sizing, with per-item Accept/Decline and mutually-exclusive same-item conflict pairs.
- Two behaviorally distinct interrupt patterns that must not be conflated: conflict-detected (blocking toast/modal, no dismissal of the underlying state) vs. storage-failure (non-blocking toast with Retry).
- Real-percentage progress rings (not indeterminate spinners) imply `StorageProvider` must expose granular byte/item progress, not just a boolean complete/incomplete signal.

**Scale & Complexity:**

- Primary domain: full-stack web — Next.js/Postgres backend plus a net-new PWA/IndexedDB client persistence layer.
- Complexity level: medium-high — introduces a genuinely new architectural layer (client-side persistence + sync engine) into an app with none today, alongside DB schema growth and an unusually broad UI-wiring footprint.
- Estimated architectural components: service worker registration/lifecycle, IndexedDB relational mirror + access layer, sync engine (queue, reconnect detection, conflict resolution per tier, replay-on-reconnect upload), `StorageProvider` abstraction (2 implementations), Smart Pin background job, auto-eviction background job, Conflict Review UI, pending-sync badge state, connectivity indicator state.

### Technical Constraints & Dependencies

- Drizzle is pre-release (`db:push`, no tracked migrations yet, per `docs/drizzle-workflow.md`) — this feature adds schema (`offline_settings` table; `pinned_at` and `offline_cleanup_at` on `trips`) while the project is still in its pre-cutover phase, so no migration-baseline concerns block this work yet.
- No existing PWA/service-worker infrastructure in the app today — this is a net-new client architecture layer, not an extension of one.
- Existing `@vercel/blob` calls in `actions.ts`/`queries.ts` must move behind the new `StorageProvider` abstraction without breaking the existing `UPLOAD_STUB` E2E guard pattern (`playwright.config.ts` webServer env).
- v1 has exactly one real conflict source (single-user-multi-device); the data model and sync mechanism must stay collaborator-ready (per the addendum) without any collaboration UI existing yet — attribution copy is the only place this shows up today.
- Three PRD/UX deviations are already logged and treated as final, not open questions: documents narrowed to auto-merge-except-deletion (not full review-merge), Smart Pin narrowed to global-only (no per-trip override), offline search fully descoped to a future initiative.

### Cross-Cutting Concerns Identified

- **IndexedDB relational mirror** — touches every synced entity (trips, days, events, documents, packing list); chosen over a document-store for sync simplicity (per addendum).
- **Sync engine** — queue management, reconnect detection (`navigator.onLine` + health-check ping), per-tier conflict resolution, replay-on-reconnect for offline-created documents through the standard upload API pipeline.
- **Background lifecycle jobs** — Smart Pin auto-download check and auto-eviction check both run on app startup; eviction also runs on trip deletion.
- **Offline-aware E2E testing** — no existing pattern in the repo for simulating offline/reconnect/conflict; needs a strategy compatible with Playwright's `context.setOffline()` and the existing `packt_e2e` DB/seed conventions (object mothers, scenario-owned fixtures).

## Offline-Layer Library Evaluation

_Packt is a brownfield project — its core stack (Next.js 16, React 19, TypeScript, Tailwind v4, Base UI, Drizzle/Postgres, Auth.js v5) is already established. This section replaces a greenfield "starter template" choice with the equivalent decision for this feature: which libraries anchor the new client-side offline layer (service worker + IndexedDB), since the app has no existing PWA/offline infrastructure to extend._

### Primary Technology Domain

Full-stack web — adding a PWA/offline client layer to the existing Next.js App Router app. No new form factor (per EXPERIENCE.md, this is responsive web only — no native client).

### Options Considered

**Service worker tooling:**

| Option | Verdict |
| --- | --- |
| `next-pwa` | Rejected — requires the `--webpack` flag on every command under Next.js 16 (Turbopack is now default), which fights the rest of the app's build tooling. |
| Hand-rolled service worker | Viable but reimplements caching-strategy plumbing (precache, runtime cache strategies, update/activate lifecycle) that a maintained library already provides. |
| **Serwist** (`@serwist/next`, latest 9.5.11) | **Selected** — `next-pwa` successor, natively Turbopack-compatible, actively maintained, ported Workbox caching strategies. |

**IndexedDB access layer:**

| Option | Verdict |
| --- | --- |
| Raw IndexedDB | Rejected — callback/event-based API is a poor fit for the relational-mirror + typed-schema requirement (NFR2, FR10). |
| `idb` | Viable, but it's a thin promise wrapper intended for building a custom abstraction from scratch — Packt needs the higher-level model `idb` deliberately omits. |
| Dexie Cloud (managed sync SaaS) | Rejected — Packt syncs to its own Postgres backend via the `StorageProvider`/server-action pipeline (per addendum), not to a hosted Dexie backend. |
| **Dexie.js** (v4.4.2, actively maintained, ~1.5M weekly downloads) | **Selected** — typed tables, indexed queries, transactions, and schema versioning for the local relational mirror; used purely as an IndexedDB access library, not as a sync/backend service. |

### Selected Approach: Serwist + Dexie.js + hand-rolled sync engine

**Rationale for Selection:**

- Serwist owns the app-shell layer only (precaching static assets/HTML/JS/CSS so the app *loads* offline) — it has no opinion about application data.
- Dexie owns the local data layer only (typed tables mirroring `trips`/`days`/`events`/`documents`/packing-list entities) — purely an ergonomic wrapper over the same browser IndexedDB API, not a hosted sync service.
- The sync engine itself (queue management, reconnect detection, `last_synced_at` vs. server `updated_at` comparison, per-entity-tier conflict resolution, replay-on-reconnect upload) is bespoke code built on top of Dexie's local tables, per the addendum's already-specified design — no managed sync product fits Packt's custom Postgres backend and tiered conflict model.

**Packages:**

```bash
npm install @serwist/next dexie
```

**Architectural Decisions Provided:**

**Service Worker / App Shell:**
Serwist handles SW compilation, manifest injection, Turbopack-compatible build integration, and pre-built caching strategies (`NetworkFirst`, `CacheFirst`, `StaleWhileRevalidate`) for static assets — replacing what would otherwise be hand-written SW lifecycle/caching code.

**Local Data Layer:**
Dexie provides typed table schemas with versioned migrations (mirroring the role Drizzle plays for Postgres), a query API for the local relational mirror, and promise-based transactions — no raw IndexedDB cursor/event code needed.

**Sync Engine:**
Not provided by either library — built in-app per the addendum's design (staged upload + replay, connection-adaptive sync, tiered conflict resolution). This is first-class application logic, not infrastructure delegated to a dependency.

**Note:** Installing these packages and scaffolding the Serwist Next.js config + Dexie database schema should be an early implementation story, before any feature-specific sync logic is built.

## Core Architectural Decisions

_Packt's core stack (Postgres/Drizzle, Auth.js v5, Server Actions, App Router, plain React Context for client state) is already established and not re-decided here. Decisions below cover only what this feature introduces._

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- Client-generated UUIDs for all entity creation (online and offline)
- Outbox + per-row `syncStatus`/`updatedAt` hybrid for the sync queue
- Shared-core-function pattern so Server Actions and the sync Route Handler enforce identical auth checks
- `StorageProvider` singleton factory keyed by `STORAGE_PROVIDER`

**Important Decisions (Shape Architecture):**
- Row-level (not field-level) conflict diffing
- Session re-validation before sync replay, with graceful "pending until signed in" fallback
- Per-user-keyed Dexie database name, cleared on sign-out/sign-in
- `OfflineProvider` Context + `useLiveQuery` for reactive local-data reads
- Offline orchestration hooks isolated to `src/lib/offline/`

**Deferred Decisions (Post-MVP):**
- None identified — all five categories resolved decisions needed to start implementation; no category required deferral.

### Data Architecture

- **Local ID strategy:** every entity create (trips, days, events, documents, packing items) generates its ID client-side via `crypto.randomUUID()`, online and offline alike — server accepts the supplied ID rather than defaulting it. Eliminates the two-ID/remapping problem entirely; satisfies FR7's "stable local identity" by construction rather than via a replace-after-sync step. *Affects:* every create action in `actions.ts`, Drizzle schema's `.default(sql\`gen_random_uuid()\`)` becomes a fallback rather than the primary ID source for client-initiated creates.
- **Sync queue model:** each Dexie-mirrored entity table carries `syncStatus: "pending" | "syncing" | "synced"` and `updatedAt` (mirrors server `updated_at`, used for the addendum's `last_synced_at` comparison), plus a separate `outbox` table recording ordered pending mutations (create/update/delete) for replay. Per-row status drives the FR7 pending-sync badge; the outbox drives ordered replay and FR3's queue/progress display. *Affects:* Dexie schema design, `OfflineProvider`, DocRow/TripCover badge rendering.
- **Conflict diff granularity:** whole-record (row-level), not field-level — matches the conflict review screen's "Local vs. Online" whole-item Accept/Decline rows exactly (EXPERIENCE.md). No field-merge engine is built. *Affects:* sync Route Handler's conflict-detection comparison, conflict review screen data shape.
- **Per-tier resolution rule (explicit):** the sync engine applies tier behavior, not just tier labeling — packing-list conflicts auto-resolve last-write-wins and never produce a `conflicts` array entry (no review surface exists for them); document conflicts auto-merge silently except a deletion conflict, which produces a `conflicts` entry with `kind: "deletion"`; itinerary (event) conflicts always produce a `conflicts` entry. This is why the conflict object shape's `entityType` enum is `"event" | "document"` only — packing items structurally cannot appear there. *Affects:* `src/lib/offline/conflict.ts`, `/api/sync` response logic.
- **NFR3 (off-main-thread storage):** plain Dexie calls on the main thread, not a dedicated Web Worker. IndexedDB's API is inherently async/non-blocking for transactions; NFR3 is satisfied by keeping every query indexed/narrow (no full-table scans) rather than by literally executing off-thread. A Worker (e.g. via Comlink) is deferred unless a real performance problem surfaces — not built speculatively. *Affects:* all `src/lib/offline/` Dexie query code; query authors must use indexed `.where()` lookups, not unindexed `.filter()` scans, over any table that can grow large (documents, events).

### Authentication & Security

- **Session re-validation on replay:** the sync Route Handler re-checks session validity before processing queued operations; on an expired session, queued items remain `pending` (not retried in a loop, not discarded) and the UI surfaces a "sign in to finish syncing" state. Preserves NFR1 across a session-expiry boundary. *Affects:* sync Route Handler, `OfflineProvider` state machine.
- **No parallel auth path:** the sync Route Handler and the existing Server Actions both call the same underlying guarded core function (`requireUser()` + `assertTripAccess()` runs once, shared) — refined from "reuse the same action" once it became clear Server Actions aren't directly callable from a non-page sync context. *Affects:* every mutation currently defined as a bare Server Action — each gets a shared core function extracted, with the Server Action and the new Route Handler as thin wrappers.
- **Per-user-keyed local storage:** Dexie database name includes the user ID (e.g. `packt-offline-{userId}`); non-active-user databases (and relevant SW caches) are cleared on sign-out/sign-in transitions, preventing cross-user data exposure on shared devices. *Affects:* Dexie initialization, sign-out flow.

### API & Communication Patterns

- **Sync transport:** a single `/api/sync` Route Handler accepts a batched set of outbox-queued operations per reconnect event, replays them in order through the shared core functions, and returns per-item success/failure plus server snapshots for conflict comparison. One round trip per reconnect rather than one per queued item. *Affects:* new route at `src/app/api/sync/route.ts`, outbox replay logic.
- **`StorageProvider` factory:** a singleton resolved at module load from the `STORAGE_PROVIDER` env var, mirroring the existing `src/db/index.ts` `globalThis.__pgClient` singleton pattern. `LocalFolderProvider` and `VercelBlobProvider` implement one shared interface matching today's `put`/`del` call shape. *Affects:* new `src/lib/storage/` module, existing `@vercel/blob` call sites in `actions.ts`.

### Frontend Architecture

- **Connectivity/sync state:** a new `OfflineProvider` React Context, mounted once in `layout.tsx`, following the existing `theme-provider.tsx`/`mock-date-provider.tsx` pattern — exposes `online | offline | conflict` state, pending-sync count, and action triggers (`retrySync`, `openConflictReview`). *Affects:* `layout.tsx`, connectivity-indicator components across all three surfaces.
- **Reactive local reads:** components reading Dexie state use `dexie-react-hooks`' `useLiveQuery` rather than manual subscriptions, since writes can originate from the service worker or another tab, not just the current component tree. *Affects:* `TripCover`, `DocRow` family, connectivity indicator.
- **Orchestration location:** hooks like `usePinTrip()` and `useOfflineSync()` live in `src/lib/offline/` (colocated tests per existing convention) — components stay thin consumers of state and dispatchers. *Affects:* file placement for all new offline logic.

### Infrastructure & Deployment

- **`LocalFolderProvider` mechanics:** root path configurable via `LOCAL_STORAGE_PATH`; documents write to `{LOCAL_STORAGE_PATH}/{tripId}/{documentId}`, mirroring how Vercel Blob URLs are already scoped per-trip, keeping the two `StorageProvider` implementations structurally interchangeable (NFR2). *Affects:* new `LocalFolderProvider` implementation, Docker volume-mount documentation.
- **Serwist build integration:** `next.config.js` wraps with `withSerwist`; emits `sw.js` into the existing build output. No separate infrastructure or deployment step — works under both current Vercel hosting and the self-hosted Docker path. *Affects:* `next.config.js`, build output.
- **Offline E2E strategy:** Playwright's `context.setOffline()` for connectivity toggling, combined with direct Dexie/outbox seeding via `page.evaluate()` for scenarios needing pre-queued state — consistent with the project's existing self-seeding fixture convention (object mothers, scenario-owned rows, no UI-driven chained setup). *Affects:* `tests/e2e/steps/`, new offline-scenario fixtures.

### Decision Impact Analysis

**Implementation Sequence:**
1. Serwist app-shell integration (prerequisite for any offline-capable page load — install `@serwist/next`, scaffold `next.config.js` + `sw.ts`)
2. `StorageProvider` interface + both implementations (unblocks document storage abstraction independent of sync)
3. Client-generated UUID switch across existing create actions (online-only change first, validates the approach before offline complexity is added)
4. Dexie schema + `OfflineProvider` scaffolding (per-user-keyed DB, `useLiveQuery` wiring)
5. Shared-core-function extraction for existing Server Actions + `/api/sync` Route Handler
6. Sync engine (outbox replay, conflict detection, tiered resolution)
7. UI wiring (TripCover, connectivity indicator, DocRow states, Conflict Review screen)
8. Smart Pin + auto-eviction background jobs
9. Offline E2E test infrastructure, built alongside each layer above rather than after

**Cross-Component Dependencies:**
- The UUID switch (step 2) must land before Dexie schema work (step 3), since the local mirror's primary keys depend on it.
- Shared-core-function extraction (step 4) is a prerequisite for both the sync Route Handler and any session-re-validation behavior — it cannot be retrofitted after the Route Handler exists without re-touching every action.
- `StorageProvider` (step 1) is independent of the sync engine and can proceed in parallel with steps 2–3.

## Implementation Patterns & Consistency Rules

_Most naming/structure conventions are already fixed project-wide (camelCase, ISO 8601 dates, `*.test.ts` colocation, `src/lib/**` vs. `src/components/packt/**` placement — see project-context.md). This section pins down only the shapes this feature introduces, since nothing in the existing codebase has precedent for them._

### Pattern Categories Defined

**Critical Conflict Points Identified:** 4 — Dexie/Drizzle table-naming alignment, outbox record shape, `/api/sync` request/response shape, conflict + progress object shapes, and `OfflineProvider`'s `pinFailure`/`conflict` field separation.

### Naming Patterns

**Dexie table naming:** mirrors Drizzle table names exactly — `trips`, `days`, `events`, `documents`, `packingItems`. Dexie operates on the already-camelCase objects returned by `db-mappers.ts`, never on raw snake_case DB columns.

**New module locations:** offline hooks/sync engine/Dexie schema → `src/lib/offline/`; storage abstraction → `src/lib/storage/`; sync transport → `src/app/api/sync/route.ts`. (Already established in Core Architectural Decisions; restated here as the binding file-placement rule for this feature.)

### Format Patterns

Fixed object shapes — every agent implementing sync/conflict/progress code uses these exact shapes, not an equivalent reinvention:

```ts
// Outbox record (Dexie outbox table)
{
  id: string;
  entityType: "trip" | "day" | "event" | "document" | "packingItem";
  entityId: string;
  operation: "create" | "update" | "delete";
  payload: unknown;
  createdAt: string; // ISO 8601
  attempts: number;
}

// /api/sync response, per outbox item
{
  outboxId: string;
  status: "applied" | "conflict" | "failed";
  serverSnapshot?: unknown;
}

// Conflict (consumed by Conflict Review screen)
{
  entityType: "event" | "document";
  entityId: string;
  kind: "update" | "deletion";
  tier: "itinerary" | "document";
  localSnapshot: unknown;
  serverSnapshot: unknown;
}

// Progress (shared by TripCover pin + DocRow upload — DESIGN.md's "real-percentage ring" requirement)
{
  status: "idle" | "downloading" | "uploading" | "complete" | "failed";
  progress: number; // 0-100
}
```

All timestamps in the above shapes are ISO 8601 strings — no new date format introduced.

### Communication Patterns

**`OfflineProvider` context value keeps `pinFailure` and `conflict` as separate, independently-nullable fields** — never collapsed into one generic `error` field. The UX spec treats them as behaviorally distinct (non-blocking toast+Retry for storage exhaustion vs. blocking full-takeover modal for data-integrity conflicts); a shared field would tempt an agent to render them identically, which would violate the EXPERIENCE.md State Patterns table directly.

### Enforcement Guidelines

**All AI agents implementing this feature MUST:**

- Use the exact object shapes above for outbox records, `/api/sync` payloads, conflicts, and progress — not a structurally-equivalent variant.
- Keep `pinFailure` and `conflict` as distinct fields on `OfflineProvider`'s context value.
- Name Dexie tables identically to their Drizzle counterparts.
- Place new offline/storage logic only in `src/lib/offline/`, `src/lib/storage/`, and `src/app/api/sync/`.

**Pattern Enforcement:** code review against this document; any deviation gets reconciled back into this section rather than left as silent drift, the same way EXPERIENCE.md's "PRD Deviations Carried Forward" tracks intentional divergence from upstream specs.

## Project Structure & Boundaries

_Packt is a brownfield project — this section is a delta against the existing tree (documented in `AGENTS.md`'s Directory Structure section), not a full project tree. Only new and modified files are listed._

### New Files/Directories

```
src/
├── lib/
│   ├── offline/
│   │   ├── db.ts                      ← Dexie database init, per-user-keyed name
│   │   ├── schema.ts                  ← Dexie table schemas (trips, days, events, documents, packingItems, outbox)
│   │   ├── outbox.ts                  ← outbox enqueue/dequeue, replay ordering
│   │   ├── use-offline-sync.ts        ← reconnect detection, health-check ping, replay trigger
│   │   ├── use-pin-trip.ts            ← pin/unpin orchestration, Smart Pin auto-download check
│   │   ├── conflict.ts                ← conflict detection/comparison logic
│   │   ├── eviction.ts                ← offline_cleanup_at check/evict, run on app startup + trip deletion
│   │   └── *.test.ts                  ← colocated tests for each module above
│   └── storage/
│       ├── index.ts                   ← StorageProvider singleton factory (STORAGE_PROVIDER env var)
│       ├── local-folder-provider.ts   ← fs-based implementation (LOCAL_STORAGE_PATH)
│       ├── vercel-blob-provider.ts    ← wraps existing @vercel/blob put/del calls
│       └── *.test.ts
├── components/
│   └── providers/
│       └── offline-provider.tsx       ← OfflineProvider context (connectivity, pendingCount, pinFailure, conflict)
├── components/packt/
│   └── conflict-review-dialog.tsx     ← full-takeover Dialog, extends sm:max-w-2xl per DESIGN.md
└── app/
    └── api/
        └── sync/
            └── route.ts               ← batched outbox replay endpoint

public/
└── sw.js                              ← generated by Serwist build (withSerwist in next.config.js)

tests/e2e/
├── features/offline-sync.feature
├── features/conflict-review.feature
├── features/smart-pin.feature
└── steps/offline-steps.ts             ← context.setOffline() + Dexie/outbox page.evaluate() seeding helpers
```

### Modified Existing Files

| File | Change |
| --- | --- |
| `src/db/schema.ts` | add `offline_settings` table; add `pinned_at`, `offline_cleanup_at` to `trips` |
| `next.config.js` | wrap with `withSerwist` |
| `src/app/layout.tsx` | mount `OfflineProvider`, which triggers Smart Pin auto-download check and eviction check on app startup |
| `src/app/(app)/trips/[tripId]/actions.ts` (trip deletion action) | call `eviction.ts`'s evict-on-delete path before/alongside the cascade delete |
| `src/components/packt/trip-card.tsx`, `trip-hero.tsx` | wire TripCover pin icon; `trip-hero.tsx` drops the `· OFFLINE` `metaTag` stub |
| `src/components/packt/trips-topbar.tsx` | swap unused `Bell` icon for connectivity indicator |
| `src/components/packt/trip-detail-crumb.tsx` | relabel existing `Download`-icon button; wire into trip detail layout (not currently rendered anywhere) |
| `src/components/packt/trips-mobile-layout.tsx` | replace static "Synced offline" dot/text with state-driven connectivity indicator |
| `src/components/packt/doc-row.tsx`, `event-doc-row.tsx`, `reservation-doc-row.tsx` | swap `doc.offline` boolean indicator for the new sync-state icon vocabulary |
| `src/app/(app)/profile/preferences-section.tsx` | add Smart Pin fields (ToggleGroup lead-time, Checkbox Wi-Fi-only) |
| every create/update/delete action in `src/app/(app)/**/actions.ts` | extract guarded core logic into a shared function callable by both the Server Action and `/api/sync` |
| `playwright.config.ts` | `UPLOAD_STUB` env still gates blob calls; no change needed since `StorageProvider` wraps the same guard |

### Architectural Boundaries

- **API boundary:** `/api/sync` is the only new HTTP entry point; everything else stays Server Actions. The Route Handler and Server Actions both call into the same per-entity core functions — neither bypasses `requireUser()`/`assertTripAccess()`.
- **Data boundary:** Dexie (`src/lib/offline/`) never talks to Postgres directly — it only exchanges data with the server through `/api/sync` and the existing Server Actions' responses. `StorageProvider` (`src/lib/storage/`) is the only code path that touches blob/filesystem storage; no component or action calls `@vercel/blob` or `fs` directly anymore.
- **Component boundary:** `OfflineProvider` is the single source of truth for connectivity/sync/conflict state; no component reads `navigator.onLine` or queries Dexie's outbox table directly — they consume the provider's context or `useLiveQuery` against entity tables only.

### Requirements to Structure Mapping

- **Sync & Conflict Resolution** (FR1–FR4) → `src/lib/offline/outbox.ts`, `conflict.ts`, `use-offline-sync.ts`, `src/app/api/sync/route.ts`
- **Offline UX & User Control** (FR5–FR9) → `use-pin-trip.ts`, `offline-provider.tsx`, `conflict-review-dialog.tsx`, TripCover/connectivity-indicator/DocRow wiring
- **Storage & Lifecycle** (FR10, FR11, FR13) → `src/lib/storage/`, `offline_settings`/`pinned_at`/`offline_cleanup_at` schema additions

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:** Serwist (Turbopack-compatible) and Dexie introduce no conflicts with the existing Next.js 16/React 19 stack; both are additive dependencies with no overlap with existing libraries. The shared-core-function pattern (Category 2/3) resolves the one real incompatibility found during decision-making — Server Actions cannot be invoked from a non-page sync context — before it became a structural defect.

**Pattern Consistency:** Dexie table names mirror Drizzle table names; new code follows the existing `src/lib/**` vs. `src/components/packt/**` split; ISO 8601 timestamps used throughout, consistent with project-wide convention. No new naming scheme was introduced where an existing one already applied.

**Structure Alignment:** Every new file maps to a decision made in Categories 1–5; every modified file maps to a UX-spec requirement (DESIGN.md component states, EXPERIENCE.md surfaces). No structural element exists without a decision backing it, and no decision lacks a file to implement it — confirmed by cross-checking the Requirements to Structure Mapping above against the Decision sections.

### Requirements Coverage Validation ✅

**Functional Requirements Coverage** (FR1–FR11, FR13 — FR12 descoped):

| FR | Covered by |
| --- | --- |
| FR1 | `use-offline-sync.ts`, `/api/sync/route.ts` |
| FR2 | `conflict.ts`'s explicit per-tier resolution rule |
| FR3 | `outbox.ts`, progress object shape |
| FR4 | `/api/sync` server-side comparison of incoming base state vs. current `updated_at`, returned as `applied`/`conflict` status |
| FR5 | `use-pin-trip.ts` |
| FR6 | `offline_settings` table, `preferences-section.tsx`, Smart Pin check triggered on `OfflineProvider` mount |
| FR7 | client-generated UUIDs + `syncStatus` field |
| FR8 | `conflict-review-dialog.tsx`, `OfflineProvider.conflict` |
| FR9 | outbox/Dexie mirror covers every create/update/delete action uniformly — no online-only code path for any in-scope entity |
| FR10 | `src/lib/storage/` `StorageProvider` interface |
| FR11 | `eviction.ts`, wired to app startup and trip-deletion action |
| FR13 | `OfflineProvider.pinFailure`, progress shape's `"failed"` status |

**Non-Functional Requirements Coverage:**

| NFR | Covered by |
| --- | --- |
| NFR1 | tiered resolution (auto-safe vs. user-confirmed by entity type) + conflict review screen as the only override path |
| NFR2 | `StorageProvider` interface — swapping `STORAGE_PROVIDER` requires no schema change |
| NFR3 | plain Dexie on main thread + indexed-query discipline (resolved during this validation pass) |
| NFR4 | `navigator.onLine` + health-check ping in `use-offline-sync.ts` |

### Implementation Readiness Validation ✅

**Decision Completeness:** all critical/important decisions from Categories 1–5 are documented with rationale and affected files; library versions verified via web search (Serwist 9.5.11, Dexie 4.4.2) rather than assumed.

**Structure Completeness:** every new file has a stated purpose; every modified file has a stated change. No placeholder or generic "etc." entries remain.

**Pattern Completeness:** object shapes fixed for outbox records, sync responses, conflicts, and progress; `pinFailure`/`conflict` field separation enforced; per-tier resolution behavior made explicit (closed during this validation pass, see Gap Analysis).

### Gap Analysis Results

**Critical Gaps:** none remaining.

**Important Gaps — found and resolved during this validation pass:**
- NFR3's "off main thread" requirement had no concrete decision — resolved: plain Dexie on main thread with indexed-query discipline, Web Worker deferred until a real performance problem appears.
- FR11's auto-eviction had no implementing module — resolved: added `src/lib/offline/eviction.ts`, wired to app startup (via `OfflineProvider` mount) and the trip-deletion action.
- Per-tier conflict resolution was only implied via the conflict object's `entityType` enum, not stated as an explicit rule — resolved: added an explicit per-tier resolution rule to the Data Architecture decisions.

**Nice-to-Have Gaps:** none identified — five decision categories and the structure/pattern sections fully cover this feature's scope as specified in the PRD/UX docs.

### Validation Issues Addressed

All three Important Gaps above were resolved in-place in the Core Architectural Decisions and Project Structure sections before this validation section was written — see those sections for the final, corrected content (not a separate patch list).

### Architecture Completeness Checklist

**Requirements Analysis**

- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped

**Architectural Decisions**

- [x] Critical decisions documented with versions
- [x] Technology stack fully specified
- [x] Integration patterns defined
- [x] Performance considerations addressed

**Implementation Patterns**

- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Communication patterns specified
- [x] Process patterns documented

**Project Structure**

- [x] Complete directory structure defined
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** high

**Key Strengths:**
- Every FR/NFR traces to a specific file and decision, not a general capability claim.
- The shared-core-function refinement caught a real Server-Action-vs-sync-context defect before implementation, not after.
- Fixed object shapes (outbox, sync response, conflict, progress) remove an entire class of agent-to-agent inconsistency risk.
- Client-generated UUIDs eliminate the two-ID problem structurally rather than papering over it with a remap step.

**Areas for Future Enhancement:**
- Revisit the plain-Dexie-on-main-thread NFR3 decision if profiling later shows real jank on large pinned trips (many documents/events) — the Web Worker option was deferred, not rejected.
- True multi-collaborator UI (out of scope here) will need the attribution-string swap noted in the addendum once it exists — no architectural change required, just a copy change.
- Offline search (FR12) was descoped to a future initiative — when picked up, it's a separate client-side filtering feature, not an extension of this offline-storage architecture.

### Implementation Handoff

**AI Agent Guidelines:**

- Follow all architectural decisions exactly as documented in this file.
- Use the fixed object shapes (outbox, sync response, conflict, progress) consistently — do not invent structurally-equivalent variants.
- Respect the `src/lib/offline/`, `src/lib/storage/`, `src/app/api/sync/` boundaries; no component reads `navigator.onLine` or Dexie's outbox table directly.
- Refer to this document for all architectural questions before improvising.

**First Implementation Priority:**
Install `@serwist/next` and `dexie`, then implement the `StorageProvider` interface (Category 3, Decision 2) — it has no dependency on the sync engine or Dexie schema and unblocks document-storage work independently, per the Implementation Sequence in Core Architectural Decisions.
