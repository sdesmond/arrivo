---
stepsCompleted: [1, 2, 3]
inputDocuments:
  - "_bmad-output/planning-artifacts/prds/prd-packt-2026-06-20/prd.md"
  - "_bmad-output/planning-artifacts/prds/prd-packt-2026-06-20/addendum.md"
  - "_bmad-output/planning-artifacts/architecture.md"
  - "_bmad-output/planning-artifacts/ux-designs/ux-packt-2026-06-20/DESIGN.md"
  - "_bmad-output/planning-artifacts/ux-designs/ux-packt-2026-06-20/EXPERIENCE.md"
---

# Packt - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Packt's offline-storage feature, decomposing the requirements from the PRD, UX Design, and Architecture into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: System syncs offline writes to server automatically on reconnect, no user action required.
FR2: Conflicting changes between local and server state resolve per entity tier: packing list = last-write-wins (no prompt), itinerary = prompt-merge, documents = last-write-wins (silent auto-merge), except a document deletion conflict (deleted offline while changed/still present online, or vice versa), which prompt-merges. Itinerary conflicts and document-deletion conflicts surface on the same conflict review screen (FR8) as tagged rows.
FR3: Documents created/uploaded offline queue locally and upload automatically on reconnect; user can see queue status and progress.
FR4: Sync behavior adapts to what's waiting: on reconnect, compare the local last-synced timestamp against the server's last-updated timestamp per entity. No server-side changes since last sync → push silently. Server has changes → prompt for review (FR8).
FR5: User can pin a trip for offline availability; pinning downloads itinerary, days, events, and documents to the local device.
FR6: Trips within a configurable lead-time window before their start date auto-pin without user action (Smart Pin). User preferences control this globally — one configuration applies to every trip, no per-trip override: opt out of auto-pin entirely, adjust the lead-time window, and restrict auto-download to unmetered/Wi-Fi connections.
FR7: Items created or edited offline get a stable local identity and show a pending-sync badge until confirmed synced to server.
FR8: When server-side changes are detected on reconnect, user gets a change notification and reviews them on a dedicated conflict review page before they apply.
FR9: Every read and write action available online (view itinerary/reservations/documents, reorder events, create events, add documents, packing list activity) is available offline with no online-only blocking modal; the only online-required actions are address/map lookup and third-party API calls.
FR10: Document storage backend is swappable via configuration (e.g. self-hosted local folder vs. cloud blob storage) without forking the app.
FR11: Offline trip data auto-evicts from local storage after a grace period following trip end; defaults to 7 days, user-configurable.
FR13: When device storage cannot fit a pin or sync operation, the system fails gracefully and notifies the user; no partial or corrupted local state results.

_FR12 (offline search) was descoped during UX design — see Out of Scope in the PRD._

### NonFunctional Requirements

NFR1: No sync or conflict path may silently discard user data; every overwrite is either auto-safe by tier (packing list) or user-confirmed (itinerary, docs).
NFR2: Storage backend swap requires no schema or entity-model changes — config/adapter change only.
NFR3: Local storage operations (read, write, search) run off the main thread (async/Web Worker) and never block UI rendering.
NFR4: Reconnect detection and sync trigger within seconds of connectivity returning, not on next manual refresh.

### Additional Requirements

- Install and configure Serwist (`@serwist/next`) for service-worker/app-shell precaching, Turbopack-compatible, wrapped via `withSerwist` in `next.config.js`; emits `sw.js` into the existing build output.
- Install and configure Dexie.js for the local IndexedDB relational mirror — typed tables mirroring `trips`, `days`, `events`, `documents`, `packingItems` (named identically to their Drizzle counterparts), plus an `outbox` table; database name is per-user-keyed (e.g. `packt-offline-{userId}`) and cleared on sign-out/sign-in.
- Client-generated UUIDs (`crypto.randomUUID()`) for every entity create (trips, days, events, documents, packing items), online and offline alike — server accepts the supplied ID rather than defaulting it; Drizzle's `.default(sql\`gen_random_uuid()\`)` becomes a fallback, not the primary ID source for client-initiated creates.
- Outbox + per-row `syncStatus: "pending" | "syncing" | "synced"` and `updatedAt` model in the Dexie schema, driving the FR7 pending-sync badge and FR3's queue/progress display.
- Shared-core-function extraction for every create/update/delete Server Action in `src/app/(app)/**/actions.ts`, so the Server Action and the new `/api/sync` Route Handler both call the same guarded core (`requireUser()` + `assertTripAccess()`) — no parallel/duplicated auth path.
- New `/api/sync` Route Handler (`src/app/api/sync/route.ts`) accepting a batched set of outbox-queued operations per reconnect event, replaying them in order through the shared core functions, returning per-item `applied | conflict | failed` status plus server snapshots for conflict comparison.
- `StorageProvider` interface + singleton factory (`src/lib/storage/`) keyed by the `STORAGE_PROVIDER` env var, with `LocalFolderProvider` (root path via `LOCAL_STORAGE_PATH`, documents at `{LOCAL_STORAGE_PATH}/{tripId}/{documentId}`) and `VercelBlobProvider` (wraps existing `@vercel/blob` `put`/`del`) implementations sharing one interface; existing `UPLOAD_STUB` E2E guard pattern must keep working unchanged.
- DB schema additions: `offline_settings` table (scoped globally to the user, not `trip_id`-keyed — holds `auto_lead_days` etc.); `pinned_at` and `offline_cleanup_at` columns added to `trips`.
- `OfflineProvider` React Context, mounted once in `layout.tsx` (follows the existing `theme-provider.tsx`/`mock-date-provider.tsx` pattern) — exposes `online | offline | conflict` state, pending-sync count, and action triggers (`retrySync`, `openConflictReview`); keeps `pinFailure` and `conflict` as separate, independently-nullable fields (never collapsed into one generic `error` field).
- Reactive local reads via `dexie-react-hooks`' `useLiveQuery` (not manual subscriptions) in `TripCover`, `DocRow` family, and the connectivity indicator, since writes can originate from the service worker or another tab.
- Offline orchestration hooks/sync engine/Dexie schema isolated to `src/lib/offline/` (`db.ts`, `schema.ts`, `outbox.ts`, `use-offline-sync.ts`, `use-pin-trip.ts`, `conflict.ts`, `eviction.ts`, each with colocated `*.test.ts`) — components stay thin consumers of state/dispatchers.
- Row-level (not field-level) conflict diffing — matches the conflict review screen's whole-item Accept/Decline rows; no field-merge engine.
- Per-tier resolution is enforced behaviorally, not just labeled: packing-list conflicts auto-resolve last-write-wins and never produce a `conflicts` entry; document conflicts auto-merge silently except deletion conflicts (`kind: "deletion"`); itinerary/event conflicts always produce a `conflicts` entry. The conflict object's `entityType` enum is `"event" | "document"` only.
- Session re-validation in the sync Route Handler before replay: on an expired session, queued items remain `pending` (not retried in a loop, not discarded) and the UI surfaces a "sign in to finish syncing" state.
- NFR3 is satisfied via plain Dexie calls on the main thread using indexed `.where()` queries (no unindexed `.filter()` scans over tables that can grow large) — a dedicated Web Worker is explicitly deferred, not built speculatively.
- Eviction logic (`eviction.ts`) checked on app startup and on trip deletion, driven by `offline_cleanup_at`; trip-deletion action calls the evict-on-delete path before/alongside the cascade delete.
- Smart Pin auto-download check runs on app startup (via `OfflineProvider` mount): checks upcoming trips within the lead window, auto-downloads, skips re-download if already cached.
- Offline E2E test infrastructure: Playwright `context.setOffline()` for connectivity toggling, combined with direct Dexie/outbox seeding via `page.evaluate()` for pre-queued state, consistent with the project's existing self-seeding object-mother/scenario-owned-fixture convention. New feature files: `offline-sync.feature`, `conflict-review.feature`, `smart-pin.feature`. Built alongside each implementation layer, not after.
- Fixed object shapes (outbox record, `/api/sync` response, conflict object, progress object — all defined exactly in `architecture.md`) must be used as-is by every story touching sync/conflict/progress code; no structurally-equivalent reinvention.
- Implementation sequence dependency: the client-generated-UUID switch (online-only) must land before Dexie schema work, since the local mirror's primary keys depend on it; shared-core-function extraction must land before the `/api/sync` Route Handler exists; `StorageProvider` work is independent and can proceed in parallel with the UUID/Dexie work.

### UX Design Requirements

UX-DR1: Implement the TripCover pin icon as a new icon-only control with tooltip, top-right of `TripCover` (left of the `MoreHorizontal` trigger on `trip-card.tsx`, e.g. `right-11`; alone at top-right on `trip-hero.tsx`). Four states, direct-toggle on click, no intermediate panel: not-pinned (`Download`), downloading/syncing (real-percentage progress ring, not indeterminate), pinned & synced (`CloudCheck`), failed (`CloudAlert`, warning-amber, persists until user acts). Every state carries a persistent `aria-label` (e.g. "Pinned for offline", "Pin failed — not enough storage") in addition to the hover tooltip.
UX-DR2: Remove `trip-hero.tsx`'s hardcoded `metaTag="ACTIVE TRIP · OFFLINE"` `· OFFLINE` suffix — `metaTag` keeps only the day-count content. Confirm `trip-card.tsx`'s `coverMetaTag` needs no equivalent change (no stub exists there).
UX-DR3: Implement the global connectivity indicator (icon-only, no label text) across three slots, all the same indicator evolving per surface: (a) `trips-topbar.tsx` — swap the unused `Bell` icon button for the connectivity vocabulary; (b) `trip-detail-crumb.tsx` — relabel the existing `Download`-icon "Offline" button to this vocabulary and wire it into the trip detail layout (not currently rendered anywhere); (c) `trips-mobile-layout.tsx` — replace the static dot + "Synced offline" text (lines ~71–82) with a state-driven indicator that only renders while offline or in conflict. Three states: online/default (hidden — no persistent "online" badge), offline (`WifiOff`), conflict detected (`CloudAlert`, warning-amber, clickable — opens the conflict review screen). Each state carries a persistent `aria-label` (e.g. "Offline", "Sync conflict — tap to review").
UX-DR4: Implement the DocRow sync-state indicator in `doc-row.tsx`, `event-doc-row.tsx`, and `reservation-doc-row.tsx`, replacing the existing `doc.offline` boolean tooltip indicator in the same `Tooltip`/`TooltipTrigger` slot. Three states: local-only/not-yet-uploaded (`CloudOff`, tooltip "Will upload when back online"), uploading (real-percentage progress ring), synced (`CloudCheck`, tooltip "Synced"). Preserve existing color tokens (`var(--accent-brand)` synced; `var(--fg-3)`/`var(--fg-4)` local-only per component). Update the wrapping `<span role="img">`'s `aria-label` to match the new state words.
UX-DR5: Build the Conflict Review screen as a new full-takeover dialog extending the existing `Dialog`/`DialogContent` primitive beyond its default `sm:max-w-sm` sizing (e.g. `sm:max-w-2xl` or a dedicated full-screen class) to hold a scrollable list of changed-item rows, per `mockups/conflict-review-screen.html`. Each row pairs the item description with a **Local**/**Online** `Badge` `outline`-variant tag and an Accept/Decline `Button` pair (`size="sm"`). Mutually-exclusive same-item conflict pairs render as two adjacent visually-grouped rows (shared border/background), each keeping its own Accept/Decline pair — accepting one auto-declines its pair. Close affordance reuses `DialogPrimitive.Close` + `Button variant="ghost" size="icon-sm"`, disabled (with tooltip "Resolve all changes to continue") while rows remain, enabled once all rows are resolved. Not dismissable via Escape or outside click. Dialog header uses `DialogTitle`/`DialogDescription` (e.g. "Trip changed while offline," description naming the count of items needing review). Must trap focus and be fully keyboard-operable for every Accept/Decline control.
UX-DR6: Add Smart Pin fields to `preferences-section.tsx` following its existing `Field`/`ToggleGroup`/dirty-tracking/Save pattern exactly: master on/off, lead-time window as `ToggleGroup` chips (1/3/7/14 days, default 3), Wi-Fi-only restriction as a `Checkbox` (this tab has no boolean Switch primitive). Inherits the existing dirty/saving/saved states and single-Save-button behavior unchanged.
UX-DR7: On conflict detection at reconnect, fire an interrupting toast/modal simultaneously with the connectivity indicator becoming `CloudAlert` — exactly two choices: "Resolve now" (opens the conflict review screen) or dismiss. Fires immediately with no guard for in-progress typing or open forms elsewhere. If dismissed, `CloudAlert` persists as the sole re-entry route.
UX-DR8: On pin/sync storage failure (TripCover `CloudAlert` state, OQ1), fire a non-blocking toast naming the reason (e.g. "Not enough storage to pin this trip") with Retry/dismiss — distinct from the conflict-interrupt modal; mid-sync storage failure during reconnect gets the same toast treatment, not the heavier conflict modal.
UX-DR9: Ensure the no-conflict reconnect sync path stays fully silent end-to-end (Journey 1): no toast, no modal, no passive "syncing" interim badge — the connectivity indicator goes directly from `WifiOff` to hidden.
UX-DR10: Apply a persistent `aria-label` to every state-bearing icon across all three surfaces (TripCover's 4 states, connectivity indicator's 3 states, DocRow's 3 states), in addition to the existing hover tooltip — uniformly, no surface exempt.

### FR Coverage Map

FR1: Epic 2 - Automatic sync on reconnect
FR2: Epic 2 - Tiered conflict resolution
FR3: Epic 2 - Offline document upload queue
FR4: Epic 2 - Connection-adaptive sync (silent push vs. review prompt)
FR5: Epic 3 - Manual trip pinning
FR6: Epic 3 - Smart Pin auto-pin
FR7: Epic 1 - Stable local identity + pending-sync badge
FR8: Epic 2 - Conflict review page
FR9: Epic 1 - Full offline read/write parity
FR10: Epic 3 - Swappable storage backend
FR11: Epic 3 - Auto-eviction after grace period
FR13: Epic 3 - Graceful failure on storage exhaustion

NFR1: Epic 2 - No silent data loss
NFR2: Epic 3 - Storage swap requires no schema change
NFR3: Epic 1 - Off-main-thread storage operations
NFR4: Epic 2 - Fast reconnect detection

## Epic List

### Epic 1: Offline Read & Write Foundation
Every read and write action in Packt works fully offline — viewing itinerary/reservations/documents, reordering events, creating events, packing list activity — with no online-only blocking modal. Items created or edited offline get a stable local identity and show a pending-sync badge. Local storage operations never block UI rendering.
**FRs covered:** FR7, FR9
**NFRs covered:** NFR3

### Epic 2: Automatic Sync & Conflict Resolution
Offline writes sync to the server automatically on reconnect with no user action required. Documents queued offline upload with visible progress. When the server has diverged, users get an interrupt notification and resolve every changed item on a dedicated conflict review screen before anything overwrites — no sync path ever silently discards data.
**FRs covered:** FR1, FR2, FR3, FR4, FR8
**NFRs covered:** NFR1, NFR4

### Epic 3: Trip Pinning, Storage Flexibility & Lifecycle
Users can pin a trip for offline availability, or let Packt auto-pin upcoming trips via Smart Pin before they travel. If a pin or sync can't fit on the device, the system fails gracefully and tells the user — no partial or corrupted local state. Operators can swap the document storage backend (local folder vs. cloud blob) via config alone, and offline trip data auto-evicts from local storage after a grace period.
**FRs covered:** FR5, FR6, FR10, FR11, FR13
**NFRs covered:** NFR2

## Epic 1: Offline Read & Write Foundation

Every read and write action in Packt works fully offline — viewing itinerary/reservations/documents, reordering events, creating events, packing list activity — with no online-only blocking modal. Items created or edited offline get a stable local identity and show a pending-sync badge. Local storage operations never block UI rendering.

**FRs covered:** FR7, FR9
**NFRs covered:** NFR3

### Story 1.1: Switch to Client-Generated Entity IDs

As a developer building the offline sync foundation,
I want every entity create (trips, days, events, documents, packing items) to use a client-generated UUID that the server accepts as-is,
So that the same identity is usable whether the entity is created online or offline, with no ID remapping ever needed.

**Acceptance Criteria:**

**Given** a user creates a trip, day, event, document, or packing item
**When** the create Server Action runs
**Then** the client generates the ID via `crypto.randomUUID()` before calling the action, and the action persists that exact ID rather than relying on Drizzle's `gen_random_uuid()` default
**And** the database column default remains in place only as a fallback for any non-client-initiated insert path (e.g. seed scripts), never overriding a client-supplied ID
**And** every existing create action (trip, day, event, document upload, packing item) is updated to accept and use the supplied ID
**And** existing colocated unit tests for these actions are updated to assert the client-supplied ID is the one persisted, unchanged

### Story 1.2: Local Data Mirror & Offline Reads

As a traveler with trip data I've already loaded,
I want to keep viewing my itinerary, reservations, documents, and packing list when I lose connectivity,
So that losing signal doesn't block me from referencing plans I already had open.

**Acceptance Criteria:**

**Given** a Dexie database scoped to the signed-in user (`packt-offline-{userId}`) with tables mirroring `trips`, `days`, `events`, `documents`, `packingItems` (matching field shapes) plus an `outbox` table
**When** a user views a trip's itinerary, a day, reservations/documents, or the packing list while online
**Then** the corresponding rows are written into the local Dexie mirror as part of that normal read (cache-as-you-go), via indexed `.where()` lookups — never an unindexed `.filter()` scan
**And** when the same user later opens those same screens while offline, the data renders from the Dexie mirror via `useLiveQuery` instead of failing to fetch
**And** Dexie database is cleared on sign-out and re-created on sign-in, never leaking data across users on a shared device
**And** all new Dexie schema/access code lives in `src/lib/offline/db.ts` and `src/lib/offline/schema.ts` with colocated `*.test.ts` coverage
**And** no Dexie read or write call in this story blocks the main thread or uses an unindexed full-table scan

### Story 1.3: Offline Writes with Pending-Sync Identity

As a traveler editing my trip while offline,
I want my creates and edits to save locally right away with a visible pending-sync badge,
So that I know my change is captured safely even though it hasn't reached the server yet.

**Acceptance Criteria:**

**Given** a user is offline and creates or edits an event, document, or packing item
**When** the write happens
**Then** the row is written to the local Dexie mirror with `syncStatus: "pending"` and an `updatedAt` timestamp, using the client-generated UUID from Story 1.1
**And** a corresponding outbox record is created (`id`, `entityType`, `entityId`, `operation`, `payload`, `createdAt`, `attempts: 0`) per the fixed shape in architecture.md
**And** the item immediately shows a pending-sync badge in its list/card view, driven by `useLiveQuery` reading `syncStatus`
**And** the badge is visible the moment the write completes locally, with no perceptible delay
**And** this story does not implement outbox replay/sync — that is Epic 2; items remain `pending` indefinitely until Epic 2's sync lands

### Story 1.4: Full Offline Write Parity

As a traveler offline,
I want every write action I'd normally have online — reordering events, creating events, adding documents, packing list activity — to work exactly the same way,
So that losing connectivity never degrades my ability to plan or manage my trip.

**Acceptance Criteria:**

**Given** a user is offline on a trip whose data is already in the local Dexie mirror
**When** they reorder events on a day, create a new event, add a document, or check/add a packing list item
**Then** each action completes locally using Story 1.3's write-with-pending-badge path, with no blocking "you're offline" modal anywhere in these flows
**And** event reordering persists the new order locally and queues an outbox update exactly like any other edit
**And** the only actions that remain online-gated are address/map lookup and third-party API calls (e.g. Unsplash image search) — every other control stays fully interactive offline
**And** any UI control that previously disabled itself when offline (if any exists today) is audited and re-enabled unless it falls into the online-gated exception above
**And** colocated component tests cover at least one offline-write path per affected component (event reorder, event create, document add, packing item toggle)

### Story 1.5: Connectivity Indicator (Base States)

As a traveler,
I want a persistent, unobtrusive signal when I've lost connectivity,
So that I understand why and trust my work is still being saved.

**Acceptance Criteria:**

**Given** the `OfflineProvider` context is mounted in `layout.tsx` and exposes an `online | offline | conflict` state (the `conflict` value is wired up by Epic 2; this story only consumes `online`/`offline`)
**When** the browser's connectivity drops
**Then** `trips-topbar.tsx` swaps its unused `Bell` icon button for the connectivity indicator showing `WifiOff`
**And** `trip-detail-crumb.tsx` relabels its existing `Download`-icon "Offline" button to the same `WifiOff` vocabulary and renders it in the trip detail layout (where it does not currently appear)
**And** `trips-mobile-layout.tsx` replaces its static dot + "Synced offline" text (~lines 71–82) with the same state-driven indicator
**And** all three surfaces hide the indicator entirely when online (no persistent "online" badge)
**And** the `WifiOff` state is clickable: clicking it shows a message — "You're offline. Any changes you make will be synced when you're back online." — dismissed by the user, with no other action available from it (the clickable `CloudAlert` conflict state with its "Resolve now" action is added in Epic 2)
**And** the `WifiOff` icon carries a persistent `aria-label` (e.g. "Offline") in addition to its hover tooltip
**And** `trip-hero.tsx`'s hardcoded `metaTag="ACTIVE TRIP · OFFLINE"` has its `· OFFLINE` suffix removed, leaving only day-count content — `trip-card.tsx`'s `coverMetaTag` is confirmed to need no equivalent change

### Story 1.6: App-Shell Service Worker Precaching

_This story fills an untracked dependency from architecture.md (line 122) — Serwist scaffolding was called for before any feature-specific sync logic but was never created as a story. Not new scope; restoring the intended implementation order._

As a traveler going offline,
I want the Packt app shell to load from cache when there's no network,
So that I see the app interface — not a browser error — when I refresh while offline.

**Acceptance Criteria:**

**Given** the app has no existing service worker or precaching infrastructure
**When** `@serwist/next` is installed and configured
**Then** `next.config.js` wraps the existing config with `withSerwist({ swSrc: "src/sw.ts", swDest: "public/sw.js" })`
**And** `src/sw.ts` is created with Serwist's `defaultCache` preset precaching all static assets (JS, CSS, HTML for the app shell route group)
**And** the build emits `public/sw.js` in the existing build output without requiring a separate build step
**And** a hard refresh while offline (no cached HTML prior) serves the cached app shell HTML instead of Chrome's native offline error page — verified via Playwright's `context.setOffline()` in the E2E suite
**And** the service worker registers on app load with no console errors and does not interfere with hot reload in dev
**And** `@serwist/next` version is pinned in `package.json` (targeting latest 9.x)

This story covers app-shell precaching only — it does not implement Dexie schema changes (Story 1.2), runtime caching strategies for API data, or any data-layer offline logic.

## Epic 2: Automatic Sync & Conflict Resolution

Offline writes sync to the server automatically on reconnect with no user action required. Documents queued offline upload with visible progress. When the server has diverged, users get an interrupt notification and resolve every changed item on a dedicated conflict review screen before anything overwrites — no sync path ever silently discards data.
**FRs covered:** FR1, FR2, FR3, FR4, FR8
**NFRs covered:** NFR1, NFR4

### Story 2.1: Shared Core & `/api/sync` Route Handler

As a developer building the sync foundation,
I want each Server Action's core mutation logic extracted into a plain function callable from both the existing UI action and a new batched API route,
So that offline-queued writes replay through the exact same validation and DB logic as online writes, with no duplicated business rules.

**Acceptance Criteria:**

**Given** existing Server Actions (e.g. `trips/[tripId]/actions.ts`, `trips/packing-actions.ts`, `trips/[tripId]/reservations/actions.ts`, document/cover upload actions) each call `requireUser()` (redirects on failure) and `assertTripAccess()` (calls `notFound()` on failure) before performing a DB write
**When** the shared-core extraction is done
**Then** each action's mutation logic is split into a plain async core function (e.g. `createEventCore`, `updateEventCore`, `reorderDayItemsCore`) taking an already-validated `userId`/`tripId` and performing only the DB write — no `requireUser`/`assertTripAccess`/redirect/`notFound` calls inside
**And** the existing Server Action keeps its current `requireUser()` → `assertTripAccess()` → delegate-to-core shape, so the UI path's behavior (including redirects and `notFound()`) is unchanged
**And** a new `src/app/api/sync/route.ts` POST handler accepts a batched array of outbox operations (`{ outboxId, entityType, entityId, operation, payload }[]`, matching Story 1.3's outbox record shape)
**And** the route authenticates via a non-redirecting variant (returns `401` JSON on no session, never calls `redirect()` — a route handler cannot redirect a `fetch()` caller the way a Server Action can)
**And** the route checks trip access via a non-`notFound()` variant that fails just that batch item (`status: "failed", error: "forbidden"`) rather than 404ing the whole request, so other items in the same batch still process
**And** each item replays through its matching core function keyed by `entityType` + `operation`
**And** the response is a fixed per-item shape: `{ outboxId, status: "applied" | "conflict" | "failed", entity?, error? }[]`, consumed by the Dexie outbox processor to clear (`applied`), route to conflict resolution (`conflict` — full diffing logic added in Story 2.3), or flag-and-keep-pending (`failed`)
**And** if the session has expired mid-batch, affected items return `status: "failed", error: "session_expired"` and stay `pending` in the outbox (incrementing `attempts` from Story 1.3) rather than being dropped — no auto-retry loop; the next reconnect/sync trigger retries them
**And** colocated unit tests cover: each extracted core function (delegated-to correctly, same DB behavior as before extraction), the route handler's auth/access failure paths, and the per-item response shape for a mixed batch (some applied, some failed)

This story does not implement conflict detection/diffing itself (Story 2.3) — every item without a true server-side divergence returns `applied`.

### Story 2.2: Reconnect Detection & Silent Sync

As a traveler who edited a trip while offline,
I want my changes to push to the server automatically and silently the moment I'm back online,
So that reconnecting never requires me to do anything or notice it happened.

**Acceptance Criteria:**

**Given** the `OfflineProvider` (Story 1.5) is in the `offline` state with one or more `pending` items in the Dexie outbox (Story 1.3)
**When** connectivity returns
**Then** reconnect is detected via `navigator.onLine` flipping `true` and a confirming health-check ping (e.g. a lightweight `GET` to `/api/sync` or a dedicated ping route) — `navigator.onLine` alone never triggers sync, since it's unreliable
**And** detection-to-sync-trigger happens within seconds of real connectivity returning (NFR4), not on next manual refresh or navigation
**And** the outbox processor sends all `pending` items in one batch to `/api/sync` (Story 2.1)
**And** for each item, the route compares the local `last_synced_at` it was sent with against the entity's current server `updated_at`: no server-side change since that timestamp → applied immediately, no conflict produced (FR4's "push silently" branch)
**And** on `applied`, the outbox row is deleted and the matching Dexie mirror row's `syncStatus` flips to `synced` with server-confirmed `updated_at`, clearing the pending-sync badge (Story 1.3) via `useLiveQuery` with no manual refresh
**And** the `OfflineProvider` state and connectivity indicator go directly from `WifiOff` to hidden — no interim "syncing" badge, toast, or modal of any kind (UX-DR9 / Journey 1)
**And** if the batch contains zero items (nothing was changed offline), the indicator still clears straight to hidden with no sync round-trip attempted
**And** colocated unit tests cover the reconnect-trigger logic (health-check confirmation, not bare `navigator.onLine`) and the outbox-processor's handling of an all-`applied` batch response

This story covers only the no-divergence path. Any item whose server `updated_at` has moved is out of scope here — Story 2.3 defines what happens to it.

### Story 2.3: Tiered Conflict Detection

As a developer extending the sync foundation,
I want `/api/sync` to apply per-entity-tier rules when local and server state have both changed since last sync,
So that low-risk divergence resolves automatically while itinerary/document-deletion divergence is never silently overwritten.

**Acceptance Criteria:**

**Given** an outbox item's local `last_synced_at` is older than the entity's current server `updated_at` (both sides changed since last sync — extending Story 2.1/2.2's comparison)
**When** `/api/sync` processes that item
**Then** for `packingItems`: the row resolves last-write-wins by comparing local vs. server `updated_at` — whichever is later wins, applied silently, `status: "applied"`, no conflict entry ever produced for this entity type (per FR2/addendum)
**And** for `documents`: a non-deletion divergence (e.g. metadata edited on both sides, or two documents independently added) auto-merges silently as `applied` — duplicate names are already permitted, so this never needs user review
**And** for a `documents` deletion divergence specifically (deleted offline while changed/still present on server, or deleted on server while a local offline edit exists) the item returns `status: "conflict"` rather than auto-merging (the one documented exception to the documents tier)
**And** for `events`, `days`, `itineraryNotes`, `itineraryChecklists`, `checklistItems` (itinerary entities): any divergence always returns `status: "conflict"` — no auto-merge attempt, regardless of whether the fields that changed actually overlap
**And** each `conflict`-status item carries a fixed conflict object: `{ conflictId, entityType, entityId, tripId, local: { value, updatedAt }, server: { value, updatedAt }, attribution: "you_other_device" }` — `attribution` is hardcoded to this single value in v1 per the addendum (collaborator-ready shape, single-user-multi-device the only real source)
**And** true same-field-edited-both-sides conflicts are flagged in the conflict object (e.g. `mutuallyExclusive: true`) so Story 2.4 can render them as a competing pair rather than two independent rows
**And** the client receiving a `conflict`-status item writes it to a new Dexie `conflicts` table (not deleted from the outbox until the user resolves it — the outbox item stays `pending` so its data isn't lost if the conflict is deferred)
**And** colocated unit tests cover all three tiers: packing-list LWW (both directions — local-newer and server-newer), document auto-merge (non-deletion) vs. document-deletion conflict, and itinerary always-conflict regardless of field overlap

This story produces conflict data only — no UI surfaces it yet. Story 2.4 builds the notification and review screen that consumes the `conflicts` table.

### Story 2.4: Conflict Review Screen & Notification

As a traveler whose trip changed on another device while I was offline,
I want to be notified the moment that's detected and walked through every changed item before anything overwrites,
So that I never lose a change without knowing about it, on either side.

**Acceptance Criteria:**

**Given** Story 2.3 has written one or more rows into the Dexie `conflicts` table during a sync pass
**When** that write happens
**Then** the `OfflineProvider` derives a conflict-pending flag via `useLiveQuery` over the `conflicts` table (count > 0) and the connectivity indicator's displayed icon becomes `CloudAlert` across all three surfaces (`trips-topbar.tsx`, `trip-detail-crumb.tsx`, `trips-mobile-layout.tsx`) — `CloudAlert` takes priority over the hidden/online display, and `WifiOff` (offline) still takes priority over `CloudAlert` if connectivity drops again before the conflict is resolved
**And** simultaneously, an interrupting toast/modal fires with copy naming that the trip changed while offline and exactly two actions: "Resolve now" (opens the conflict review screen) or dismiss — fires immediately with no guard for in-progress typing or open forms elsewhere (per the accessibility/interrupt tradeoff accepted for v1)
**And** clicking the `CloudAlert` indicator (instead of, or after dismissing, the toast) opens the same conflict review screen — `CloudAlert` is the persistent re-entry point once the toast is dismissed
**And** the conflict review screen is a full-takeover dialog listing every row from the `conflicts` table, each tagged Local vs. Online (attribution copy "You, on another device" per the fixed `attribution` value from Story 2.3)
**And** every row gets independent Accept/Decline, except rows flagged `mutuallyExclusive` (Story 2.3), which render as two competing entries where accepting one auto-declines its pair
**And** the dialog's close button is present but disabled (with a tooltip, e.g. "Resolve all changes to continue") while any row is undecided, and has no Escape-key or outside-click dismissal
**And** once every row is decided, the close button becomes enabled (same button, not a new state) and confirming submits all decisions back through `/api/sync` in one batch — accepted-local items overwrite server state, accepted-server items overwrite the local Dexie mirror and clear the matching outbox/conflicts rows, declined items are discarded from whichever side lost
**And** the dialog traps focus and every Accept/Decline control is keyboard-reachable; the `CloudAlert` icon and toast actions carry persistent `aria-label`s in addition to hover tooltips (UX-DR10)
**And** colocated unit tests cover: indicator state derivation (priority ordering of offline/conflict/online), toast fire-on-detection, per-row resolution including a mutually-exclusive pair, and the disabled→enabled close-button transition
**And** an E2E feature/scenario covers the full Journey 2 flow: trigger a conflict via scenario-owned fixture data, see the interrupt, open the review screen, resolve every row, confirm the trip updates and the indicator returns to hidden

### Story 2.5: Offline Document Upload Queue

As a traveler who wants to attach a document to my trip while offline,
I want it to appear right away and upload automatically once I'm back online,
So that adding a document never feels gated by connectivity.

**Acceptance Criteria:**

**Given** a traveler adds a document (trip doc, event doc, or reservation doc) while offline
**When** the file is selected
**Then** the file is stored as a `Blob` in a new Dexie `documentBlobs` table keyed by the document's client-generated UUID (Story 1.1), and a corresponding row is written into the Dexie `documents` mirror with `syncStatus: "pending"` (Story 1.3's offline-write path) so it renders immediately in the normal doc list — not a separate "queued" section (FR9 — offline is a full write surface)
**And** the `DocRow`'s existing sync-indicator slot (the same `Tooltip`/`TooltipTrigger` used today for "Cached offline") shows `CloudOff` with neutral tooltip copy "Will upload when back online" — not styled as an error (UX-DR4)
**And** an outbox entry is queued with `operation: "upload"` referencing the blob by UUID rather than embedding the binary in the outbox JSON payload
**And** on reconnect (Story 2.2's trigger), the outbox processor replays each queued upload by reconstructing a `File` from the stored `Blob` and invoking the existing document-upload Server Action directly (`uploadDocument`/`uploadDocumentToEvent`/reservation document action) — reusing Story 2.1's extracted core logic server-side, not routed through `/api/sync`'s JSON batch, since uploads are multipart by nature
**And** while the upload is in flight, the `DocRow` indicator shows a real-percentage progress ring (via the upload's progress events), matching the existing real-percentage pattern used elsewhere — never an indeterminate spinner
**And** on successful upload, the Dexie mirror row's `syncStatus` flips to `synced`, the outbox entry and its `documentBlobs` row are deleted, and the indicator shows `CloudCheck`
**And** if the upload fails for a reason other than a sync conflict (e.g. network drop mid-upload), the item stays `pending`, the indicator reverts to `CloudOff`, and it retries on the next reconnect/sync trigger — no error state surfaced to the user for a retryable failure (per the voice/tone table's wait-not-alarm rule)
**And** colocated unit tests cover: blob storage on offline add, `DocRow` indicator state transitions (`CloudOff` → progress → `CloudCheck`), and the replay-from-blob upload path
**And** an E2E scenario covers adding a document while offline (simulated) and confirming it uploads and shows `CloudCheck` after reconnect

## Epic 3: Trip Pinning, Storage Flexibility & Lifecycle

Users can pin a trip for offline availability, or let Packt auto-pin upcoming trips via Smart Pin before they travel. If a pin or sync can't fit on the device, the system fails gracefully and tells the user — no partial or corrupted local state. Operators can swap the document storage backend (local folder vs. cloud blob) via config alone, and offline trip data auto-evicts from local storage after a grace period.
**FRs covered:** FR5, FR6, FR10, FR11, FR13
**NFRs covered:** NFR2

### Story 3.1: `StorageProvider` Abstraction

As a developer building the storage backend abstraction,
I want all document storage calls to go through a `StorageProvider` interface selected by config,
So that swapping self-hosted local-folder storage for cloud blob storage requires an env var change, not a fork.

**Acceptance Criteria:**

**Given** existing document/cover upload code calls `@vercel/blob`'s `put`/`del` directly
**When** the `StorageProvider` abstraction is introduced
**Then** a `StorageProvider` interface is defined in `src/lib/storage/` with at minimum `put`/`del` operations matching the shape existing call sites already need (no new capabilities invented beyond current usage)
**And** `VercelBlobProvider` wraps the existing `@vercel/blob` `put`/`del` calls behind this interface with no behavior change from today
**And** `LocalFolderProvider` implements the same interface via Node `fs` access rooted at `LOCAL_STORAGE_PATH`, storing documents at `{LOCAL_STORAGE_PATH}/{tripId}/{documentId}`
**And** a factory function selects the implementation at runtime based on the `STORAGE_PROVIDER` env var, with no call site branching on the env var directly
**And** every existing upload/delete call site (document upload, cover image upload, reservation/event document upload) is migrated to call the factory-selected provider instead of `@vercel/blob` directly
**And** the existing `UPLOAD_STUB` E2E test guard continues to work unchanged against whichever provider is selected
**And** no DB schema or entity-model change is required for this swap (NFR2) — only the storage adapter changes
**And** colocated unit tests cover both provider implementations against the shared interface contract and the factory's env-var-based selection

### Story 3.2: Manual Trip Pinning

As a traveler preparing for a trip,
I want to pin a trip with one click and see real progress as it downloads,
So that I can guarantee offline availability before I lose signal, without guessing whether it worked.

**Acceptance Criteria:**

**Given** a `TripCover` pin icon rendered top-right on trip-list cards (`trip-card.tsx`, left of the `MoreHorizontal` trigger, e.g. `right-11`) and trip detail hero (`trip-hero.tsx`, alone at top-right), per UX-DR1
**When** a user clicks the icon in its not-pinned state (`Download`)
**Then** pinning starts immediately with no confirm step (OQ2 closed — no pre-pin size warning)
**And** the icon switches to a real-percentage progress ring (not indeterminate) while the trip's itinerary, days, events, and documents download into the Dexie mirror (Story 1.2's tables) plus `documentBlobs` for any documents not already cached
**And** on completion, the trip's `pinned_at` column is set, the icon shows `CloudCheck`, and the trip's data is fully available offline per Epic 1's read paths
**And** clicking the icon in its pinned (`CloudCheck`) state unpins: if unpinning would evict data not otherwise cached (i.e. this was the only reason the data was local), a confirm step appears before evicting; if the data remains needed for another reason (e.g. it's today's active trip and already cached via normal browsing), unpinning proceeds without a confirm step
**And** unpinning clears `pinned_at`, and evicts the trip's local Dexie rows and `documentBlobs` only when the confirm step (if shown) is accepted
**And** every icon state carries a persistent `aria-label` (e.g. "Pin for offline", "Pinning — 42%", "Pinned for offline") in addition to its hover tooltip, per UX-DR1/UX-DR10
**And** this story does not implement the storage-failure path (Story 3.4) — a successful-download scenario is assumed here
**And** colocated unit tests cover: click-to-pin triggering download, progress state rendering, completion setting `pinned_at` and `CloudCheck`, unpin with and without the confirm step
**And** an E2E scenario covers pinning a trip via the icon and confirming itinerary/document data is readable after going offline

### Story 3.3: Pinned Trip Refresh

As a traveler relying on a pinned trip's offline copy,
I want that copy to stay current with server-side changes automatically,
So that the data I see offline is never stale just because I didn't happen to reopen the trip while online.

**Acceptance Criteria:**

**Given** one or more trips have `pinned_at` set (Story 3.2)
**When** the `OfflineProvider` mounts while online (covers opening an already-online device that never goes through a reconnect transition) or a reconnect-sync pass completes (Story 2.2)
**Then** for each pinned trip, the client compares each mirrored entity's stored `updatedAt` against the server's current `updated_at` (same comparison pattern as FR4/Story 2.2, applied in the pull direction) and refetches only entities whose server `updated_at` is newer
**And** this refresh runs fully automatically with no user-visible trigger, button, or prompt anywhere — it is not an action the user initiates
**And** the refresh is silent on success: no toast, no modal, no progress indicator on the `TripCover` pin icon (which stays `CloudCheck` throughout) — same non-event treatment as Journey 1's silent sync (UX-DR9)
**And** if a refreshed entity has a local `pending` outbox item against it (an offline edit not yet synced), that entity is left untouched by this refresh and instead flows through Story 2.3's conflict-tier logic on the next sync pass rather than being silently overwritten (NFR1)
**And** documents newly added on the server for a pinned trip are downloaded into `documentBlobs` as part of this refresh, matching the original pin's document-fetch behavior (Story 3.2)
**And** this refresh does not run while offline (no network available) and does not block any UI render while it executes
**And** colocated unit tests cover: mount-while-online triggering a refresh check, reconnect triggering a refresh check, refresh skipping entities with a pending local outbox item, and refresh correctly fetching only entities with a newer server `updated_at`

### Story 3.4: Pin/Sync Storage-Failure Handling

As a traveler pinning a trip or syncing while offline-capable,
I want to be told clearly if my device can't fit the data, with no partial or corrupted state left behind,
So that a storage limit never silently breaks my offline copy or leaves it half-downloaded.

**Acceptance Criteria:**

**Given** a pin operation (Story 3.2), a pinned-trip refresh (Story 3.3), or a mid-reconnect-sync write (Epic 2) fails because the device cannot allocate enough storage (e.g. `QuotaExceededError` from IndexedDB/`fs`, or the storage provider's write failing for the same reason)
**When** the failure occurs
**Then** any partial writes from that operation are rolled back — no half-downloaded entity, document blob, or partially-applied mirror row is left behind (FR13)
**And** for a pin-time failure, the `TripCover` icon shows `CloudAlert` (warning-amber) and does not silently revert to `Download` — it persists until the user acts, so a missed toast doesn't lose the signal (per Journey 3/OQ1)
**And** simultaneously, a non-blocking toast names the reason (e.g. "Not enough storage to pin this trip") with Retry / dismiss actions — not the heavier conflict-interrupt modal, since FR13's rollback guarantee means no data is at risk, only a wait/retry (UX-DR8)
**And** for a mid-sync storage failure during reconnect (pushing outbox items or pulling a refresh per Story 3.3), the same non-blocking toast treatment applies rather than the conflict modal — affected outbox items remain `pending` (not discarded), and any pinned-refresh entity affected is simply retried on the next trigger
**And** clicking the persistent `CloudAlert` icon reopens the same explanation and Retry action (click-through re-entry, no separate "view details" affordance)
**And** tapping Retry re-attempts the same operation from scratch (full re-pin or full re-sync of the failed batch), rejoining the normal not-pinned/pending → downloading/syncing → pinned/synced path on success
**And** the `CloudAlert` icon carries a persistent `aria-label` (e.g. "Pin failed — not enough storage") in addition to its hover tooltip (UX-DR1/UX-DR10)
**And** colocated unit tests cover: rollback-on-storage-failure leaving no partial mirror/blob rows, toast firing with Retry/dismiss for both pin-time and mid-sync failures, and Retry re-attempting the original operation
**And** an E2E scenario simulates a storage-quota failure during pin and confirms the toast appears, the icon persists as `CloudAlert`, and Retry recovers to `CloudCheck` once the simulated quota is lifted

### Story 3.5: Smart Pin Preferences & Auto-Pin

As a traveler who doesn't want to remember to manually pin every trip,
I want Packt to automatically pin upcoming trips a configurable number of days before they start,
So that my trip is offline-ready without me having to think about it.

**Acceptance Criteria:**

**Given** a new `offline_settings` table scoped globally to the user (not `trip_id`-keyed), holding `smart_pin_enabled` (default `true`), `auto_lead_days` (one of `1 | 3 | 7 | 14`, default `3`), and `wifi_only` (boolean, default `false`)
**When** the user opens Profile & Settings → Preferences
**Then** three new fields render following `preferences-section.tsx`'s existing `Field` pattern exactly: a master on/off toggle for Smart Pin, a lead-time-window `ToggleGroup` with chips `1`/`3`/`7`/`14` (days), and a Wi-Fi-only restriction `Checkbox` (this tab has no boolean Switch primitive, consistent with every other field on this tab) (UX-DR6)
**And** these fields inherit the tab's existing dirty-tracking and single-Save-button behavior unchanged — Save stays disabled until a field is dirty, shows the same "Saved" status text on success, no new state introduced
**And** the lead-time `ToggleGroup` and Wi-Fi-only `Checkbox` are visually disabled (but still readable) when the master toggle is off, matching the tab's existing pattern for dependent fields if one already exists, or a straightforward disabled state otherwise
**And** the auto-pin check runs on three triggers, not just app load, so a long-lived session doesn't miss a trip crossing into the lead window: `OfflineProvider` mount (page load/navigation), `visibilitychange` firing visible while online (tab regains focus), and the same reconnect-sync trigger used by Story 3.3's pinned-trip refresh
**And** on each trigger, for every trip the user can access whose start date falls within `auto_lead_days` of today and which is not already pinned, the trip is auto-pinned via Story 3.2's pin path (same download behavior, same `CloudCheck`/`CloudAlert` icon states) with no user action required
**And** a trip already pinned (manually or by a prior Smart Pin run) is skipped on every trigger — no re-download, no duplicate work
**And** if `wifi_only` is enabled, the auto-pin check only proceeds when the connection is detected as unmetered Wi-Fi (e.g. via the Network Information API where available); on a metered/cellular connection, auto-pin is deferred until Wi-Fi is detected on a later trigger, with no user-facing notification of the deferral (wait-not-alarm tone — this isn't a failure)
**And** if `smart_pin_enabled` is off, no trigger performs an auto-pin scan
**And** a storage-failure during Smart Pin's auto-pin attempt follows Story 3.4's exact toast/`CloudAlert` treatment — no separate failure path for auto- vs. manual-pin
**And** colocated unit tests cover: Preferences field dirty/save behavior, each of the three triggers invoking the same auto-pin check, trip selection logic (within window, not already pinned, respecting `wifi_only`), and the master-off short-circuit
**And** an E2E scenario covers a trip starting within the configured lead window auto-pinning on app load without user interaction, and confirms it does not re-trigger on a subsequent load

### Story 3.6: Offline Data Auto-Eviction

As a traveler with several past trips that were pinned for offline use,
I want their local data automatically cleared out after a grace period,
So that completed trips don't quietly consume device storage forever.

**Acceptance Criteria:**

**Given** a new `offline_cleanup_at` column on `trips`, derived as the trip's end date plus a grace period (default 7 days, user-configurable via `offline_settings`)
**When** a trip is pinned, refreshed (Story 3.2/3.3), or its end date changes
**Then** `offline_cleanup_at` is (re)computed and persisted from the trip's current end date plus the configured grace period
**And** on `OfflineProvider` mount (app startup), an eviction check runs: every trip whose `offline_cleanup_at` has passed has its Dexie mirror rows (itinerary, days, events, documents, packing items) and `documentBlobs` deleted, and `pinned_at` cleared
**And** on trip deletion, the same eviction path runs for that trip's local rows before/alongside the existing server-side cascade delete, so a deleted trip never leaves orphaned local data regardless of its `offline_cleanup_at` status
**And** eviction only removes the local offline mirror — it never deletes server-side trip data; an evicted trip remains fully visible/editable online, simply no longer available offline until re-pinned
**And** a trip with an in-flight `pending` outbox item is not evicted even if `offline_cleanup_at` has passed — eviction skips any trip with unsynced local changes, deferring to the next startup check after those changes sync (NFR1 — never silently discard unsynced data)
**And** this eviction check runs on only two triggers per addendum scope (app startup and trip deletion) — it does not run on `visibilitychange` or reconnect, since a multi-day grace period tolerates a startup-only check with no user-facing time pressure, unlike Story 3.5's tighter Smart Pin triggers
**And** colocated unit tests cover: `offline_cleanup_at` computation from end date + grace period, startup eviction removing expired trips' mirror/blob rows, trip-deletion triggering eviction, and the pending-outbox skip guard
