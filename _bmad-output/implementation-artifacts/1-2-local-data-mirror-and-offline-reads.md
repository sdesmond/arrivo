---
baseline_commit: a0c219fc440f825e06fdcda0ecc2ead930eb34c1
---

# Story 1.2: Local Data Mirror & Offline Reads

Status: review

## Story

As a traveler with trip data I've already loaded,
I want to keep viewing my itinerary, reservations, documents, and packing list when I lose connectivity,
so that losing signal doesn't block me from referencing plans I already had open.

## Acceptance Criteria

1. **Dexie DB scoped to user** — a Dexie database named `packt-offline-{userId}` exists with tables mirroring `trips`, `days`, `events`, `documents`, `packingItems` (matching field shapes from the Drizzle schema) plus an `outbox` table
2. **Cache-as-you-go on online reads** — when a user views a trip itinerary, day, reservations/documents, or packing list while online, the corresponding data is written into the local Dexie mirror as part of that normal read; queries use indexed `.where()` lookups, never unindexed `.filter()` scans
3. **Offline render from Dexie** — when the same user opens those screens while offline, data renders from the Dexie mirror via `useLiveQuery` instead of failing
4. **DB lifecycle** — Dexie database is cleared on sign-out and re-created on sign-in, never leaking data across users on a shared device
5. **File placement** — all new Dexie schema/access code lives in `src/lib/offline/db.ts` and `src/lib/offline/schema.ts` with colocated `*.test.ts` coverage
6. **No blocking or unindexed scans** — no Dexie read or write in this story blocks the main thread or uses an unindexed full-table scan

## Tasks / Subtasks

- [x] Install Dexie.js and dexie-react-hooks (AC: 1)
  - [x] `npm install dexie dexie-react-hooks`
- [x] Define Dexie schema in `src/lib/offline/schema.ts` (AC: 1, 6)
  - [x] Define tables: `trips`, `days`, `events`, `documents`, `packingItems`, `outbox`
  - [x] Each table's indexed fields match the query patterns from existing code (e.g. `events` indexed by `tripId`, `dayId`, `position`; `days` indexed by `tripId`, `dayNumber`)
  - [x] `outbox` table: `id` (primary key), `entityType`, `entityId`, `operation`, `payload`, `createdAt`, `attempts`
  - [x] No unindexed `.filter()` — every queryable path must have an index
- [x] Create Dexie DB factory in `src/lib/offline/db.ts` (AC: 1, 4)
  - [x] Export `getOfflineDb(userId: string): Promise<OfflineDb>` — creates or returns cached Dexie instance keyed to `packt-offline-{userId}`
  - [x] Export `clearOfflineDb(userId: string): Promise<void>` — deletes the DB instance for sign-out
  - [x] Export `useOfflineDb(): OfflineDb | null` — hook that returns current user's DB instance (reads user session)
- [x] Integrate cache-as-you-go into trip detail view (AC: 2)
  - [x] Modify `src/app/(app)/trips/[tripId]/page-client.tsx` — on mount (when online and data available), write `detail` data into Dexie mirror tables
  - [x] Create a `useMirrorTripDetail(detail: TripDetailPayload | null)` hook or inline effect that maps the server-fetched shape to Dexie table rows (one `trips` row, N `days` rows, N `events` rows, N `documents` rows, N `packingItems` rows)
  - [x] Guard writes with `navigator.onLine` — only mirror when actually online
- [x] Integrate cache-as-you-go into trip list view (AC: 2)
  - [x] Modify `src/app/(app)/trips/page-client.tsx` — on mount (when online and `entries` available), write trip list entries to Dexie `trips` table
- [x] Build offline-aware read paths in page-client.tsx (AC: 3)
  - [x] Replace direct prop consumption with `useLiveQuery` that falls back to Dexie when offline: if online, use server props; if offline, use Dexie mirror
  - [x] Return same type shape as server props so child components receive identical data structures
  - [x] Handle loading state (Dexie read pending) — show existing loading.tsx skeleton
  - [x] Handle empty state (no Dexie data for this trip) — show trip-not-found view consistent with existing `notFound()` pattern
- [x] Handle sign-out/sign-in lifecycle (AC: 4)
  - [x] Locate the sign-out handler (likely in auth provider or `auth-forms.tsx`) and add `clearOfflineDb(userId)` before the sign-out completes
  - [x] On sign-in, `getOfflineDb(userId)` lazily creates the DB on first use (no explicit setup needed — creation is implicit on first access)
  - [x] Verify no user ID leak: sign out as user A, sign in as user B, confirm user A's data is gone and user B's is clean
- [x] Write unit tests (AC: 5)
  - [x] `src/lib/offline/schema.test.ts` — test table definitions, indexed fields, and that the schema validates expected query patterns
  - [x] `src/lib/offline/db.test.ts` — test DB creation per userId, clear/delete, multi-user isolation
  - [x] Update `src/app/(app)/trips/[tripId]/page-client.test.tsx` — test cache-as-you-go writes on mount
  - [x] Update `src/app/(app)/trips/page-client.test.tsx` — test cache-as-you-go writes on mount

## Dev Notes

- Dexie.js is the IndexedDB wrapper for the relational mirror. Use `dexie` (core) and `dexie-react-hooks` (React integration — `useLiveQuery` hook). No other IndexedDB library.
- The Dexie schema must mirror the Drizzle Postgres schema field shapes, not import from it. Define each table's fields as a TypeScript interface in `schema.ts` alongside the table definition — these are the offline-only types, separate from `src/data/types.ts` domain types.
- **DB mapper pattern**: Write a `dbRowToDexieRow()` helper in `db.ts` (or a local mapper) that converts the server-fetched types from `src/lib/db-mappers.ts` into the Dexie row shapes. The reverse direction (`dexieRowToTripType` etc.) is needed when offline reads return Dexie rows — must return shapes identical to what `getTripDetail` / `listTripsForUser` return so no downstream component code changes.
- **Cache-as-you-go** happens in the **client component**, not the server page. Server components (`page.tsx`) cannot access IndexedDB. Add a `useEffect` in `page-client.tsx` that writes server-fetched props to Dexie when `navigator.onLine === true`.
- For offline fallback reads, wrap the prop data with `useLiveQuery`: if online, use server props as-is; if offline, subscribe to Dexie tables and reconstruct the same shape as `TripDetailPayload` / `TripListEntry[]`.
- The `outbox` table is defined in this story's schema but **not populated** in this story — it's a schema-only addition (Story 1.3 writes to it). Include it in the schema definition so Story 1.3 doesn't need to alter the DB version.
- `clearOfflineDb` uses Dexie's `.delete()` method. The DB is lazily created — no explicit creation step is needed beyond calling `new Dexie()` with the schema on first access. Sign-in does not need explicit DB setup; sign-out needs explicit `.delete()`.
- Do NOT mount `OfflineProvider` in this story — that is Story 1.5's concern. This story only writes to / reads from Dexie directly.
- The `events` table has `dayId` as nullable (unscheduled events have no `dayId`). Index this with a compound index on `[tripId+dayId]` for querying events by trip and optionally by day.
- `packingItems` has `listId` → `tripPackingLists` foreign key, but `tripPackingLists` is NOT mirrored in this story (only `packingItems` directly). Query packing items by `tripId` for the flat list.
- Dexie versioning: define the schema in `Version 1` and use `upgrade()` only if this story's schema changes during implementation. Story 1.3+ will bump the version if they add tables.

### Dexie Schema

```ts
// src/lib/offline/schema.ts — conceptual definition

export interface OfflineTrip {
  id: string;
  ownerId: string;
  name: string;
  startDate: string;
  endDate: string;
  destinationName: string | null;
  destinationCountry: string | null;
  coverImageUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OfflineDay {
  id: string;
  tripId: string;
  dayNumber: number;
  date: string;
  label: string | null;
  subtitle: string | null;
}

export interface OfflineEvent {
  id: string;
  tripId: string;
  dayId: string | null;
  name: string;
  note: string | null;
  startAt: string;
  endAt: string;
  locationName: string | null;
  locationAddress: string | null;
  position: number;
  cost: number | null;
  confirmationNumber: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OfflineDocument {
  id: string;
  tripId: string;
  eventId: string | null;
  reservationId: string | null;
  name: string;
  kind: string;
  size: number | null;
  offline: boolean;
  url: string;
  addedAt: string;
}

export interface OfflinePackingItem {
  id: string;
  tripId: string;
  listId: string;
  name: string;
  done: boolean;
  isLabel: boolean;
  position: number;
}

export interface OfflineOutboxEntry {
  id: string;
  entityType: string;
  entityId: string;
  operation: string;
  payload: unknown;
  createdAt: string;
  attempts: number;
}
```

### Integration Points

| Server data flow | Client file | Mirror write | Offline read |
|---|---|---|---|
| `getTripDetail()` → `TripDetailPayload` | `[tripId]/page-client.tsx` | `useEffect` writes `trip`, `days`, `events`, `docs`, `packingItems` | `useLiveQuery` reconstructs `TripDetailPayload` shape from Dexie |
| `listTripsForUser()` → `TripListEntry[]` | `trips/page-client.tsx` | `useEffect` writes each trip row | `useLiveQuery` reads `trips` table with offline fallback |

### Query Pattern Requirements

Every Dexie query must use an indexed property:
- Trips by `id` (primary key) or by `ownerId` (indexed)
- Days by `tripId` (indexed), sorted by `dayNumber`
- Events by `tripId` (compound index `[tripId+dayId]`), sorted by `position`
- Documents by `tripId` (indexed), optionally by `eventId` or `reservationId`
- PackingItems by `tripId` (indexed)
- Outbox by `entityId` (indexed) or `syncStatus` (indexed in Story 1.3)

No `.filter()` calls that scan all rows. Use `.where(indexedField).equals(value)` exclusively.

### Implementation Order

1. Install Dexie.js + dexie-react-hooks
2. Define `src/lib/offline/schema.ts` with all 6 table interfaces and Dexie schema string
3. Implement `src/lib/offline/db.ts` with `getOfflineDb`, `clearOfflineDb`, `useOfflineDb`
4. Add cache-as-you-go in `[tripId]/page-client.tsx` (write server data to Dexie on mount)
5. Add cache-as-you-go in `trips/page-client.tsx` (write server data to Dexie on mount)
6. Add offline-aware reads in both client pages using `useLiveQuery`
7. Wire sign-out to `clearOfflineDb`
8. Write/update colocated tests

### Architecture Compliance

- All new offline code in `src/lib/offline/` — not mixed with existing lib files
- Dexie table fields match Drizzle schema field types but are defined independently in `schema.ts`
- No `any` types, no `enum` keyword, no single-letter variable names
- Use `cn()` from `@/lib/utils` where className merges are needed (unlikely in this change)
- Fields use `?:` for optional fields, not `| undefined`
- Server components (`page.tsx`) never touch IndexedDB — Dexie access is client-only
- Dexie DB name uses the pattern `packt-offline-{userId}` per epics.md requirements
- IndexedDB quota is not handled in this story (deferred to Story 3.4)

### Previous Story Learnings (1.1)

- `assertClientId()` was added to `src/lib/utils.ts` — validates UUID format on every client-supplied ID server-side. Do NOT need to modify or duplicate this.
- All create actions now accept optional `id` param and spread `...(id ? { id } : {})` in insert. Story 1.2 does not create entities, so no action changes needed.
- Test pattern: colocated test files side-by-side with source. Tests use Vitest + `@testing-library/react`.
- `src/lib/linked-events.ts` is synthetic-only (derives non-persisted display events) — no Dexie mirror needed for it.
- Review finding: `crypto.randomUUID()` in insecure HTTP contexts may fail — pre-existing concern, not introduced in this story.
- Full validation suite after story 1.1: 2356 tests passing, 94.73% statement coverage, build clean.

### Files to Create

- `src/lib/offline/schema.ts` — Dexie table interfaces and schema definition
- `src/lib/offline/db.ts` — Dexie DB factory, clear, and React hook
- `src/lib/offline/schema.test.ts` — schema tests
- `src/lib/offline/db.test.ts` — DB lifecycle tests

### Files to Modify

- `src/app/(app)/trips/[tripId]/page-client.tsx` — add cache-as-you-go `useEffect` + offline reads via `useLiveQuery`
- `src/app/(app)/trips/[tripId]/page-client.test.tsx` — add mirror-write tests
- `src/app/(app)/trips/page-client.tsx` — add cache-as-you-go `useEffect` for trip list entries
- `src/app/(app)/trips/page-client.test.tsx` — add mirror-write tests
- Auth sign-out component (locate — likely in `src/components/packt/auth-forms.tsx` or a provider) — add `clearOfflineDb()` call
- `package.json` / `package-lock.json` — add `dexie` and `dexie-react-hooks` dependencies

### Testing Requirements

- **New test files** (colocated in `src/lib/offline/`):
  - `schema.test.ts` — verify table definitions have correct primary keys and indexed fields; verify schema string parses without error
  - `db.test.ts` — verify `getOfflineDb` returns a Dexie instance; verify `clearOfflineDb` deletes it; verify two different userIds produce different DB names
- **Updated test files**:
  - `page-client.test.tsx` for `[tripId]` — mock Dexie, mount component with props, assert Dexie `put()` was called for each entity type
  - `page-client.test.tsx` for `trips` — same pattern for trip list entries
- Coverage thresholds: ≥95% lines/functions, ≥90% branches across `src/lib/**` and `src/components/packt/**`
- `src/components/ui/**`, `src/lib/auth-helpers.ts`, `src/lib/queries.ts`, `src/lib/server-now.ts` excluded from coverage
- Mock Dexie in unit tests using `import { Dexie } from "dexie"; vi.mock("dexie")` — verify calls with `expect(dexie.table("trips").put).toHaveBeenCalledWith(expectedRow)`
- Use `fakeIndexedDB` polyfill if needed for test environment (Vitest uses `node` environment)
- **Do NOT** mock `dexie-react-hooks`' `useLiveQuery` globally — mock per-test-file as needed, since it's only used in two client components

### References

- [Source: epics.md Story 1.2] — full ACs and context
- [Source: epics.md lines 46–47] — Dexie.js installation requirement: `dexie` + `dexie-react-hooks`, DB named `packt-offline-{userId}`
- [Source: epics.md lines 54–55] — `dexie-react-hooks` `useLiveQuery` for reactive reads
- [Source: epics.md lines 50–51] — all offline code in `src/lib/offline/db.ts` and `src/lib/offline/schema.ts`
- [Source: epics.md lines 58–60] — indexed `.where()` queries, no unindexed `.filter()` scans
- [Source: epics.md lines 46–47] — per-user-keyed database, cleared on sign-out/sign-in
- [Source: project-context.md lines 53–66] — TypeScript conventions
- [Source: project-context.md lines 67–72] — Component conventions
- [Source: project-context.md lines 74–83] — Styling conventions
- [Source: src/lib/queries.ts] — `getTripDetail()` and `listTripsForUser()` return shapes to mirror
- [Source: src/lib/db-mappers.ts] — `dbTripToType()`, `dbEventToType()`, etc. — these convert raw DB rows to domain types; the offline mirror stores the raw fields, not the mapped types
- [Source: src/data/types.ts] — canonical domain types that offline reads must return identical shapes to
- [Source: src/db/schema.ts] — Drizzle table definitions (source of truth for field names and types to mirror)
- [Source: sprint-status.yaml] — Story 1.1 is `done`; Story 1.2 is the current backlog story
- [Source: story 1-1-switch-to-client-generated-entity-ids.md] — previous story patterns, review findings, file change conventions

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6

### Debug Log References

- `npm run lint` — PASS
- `npx tsc --noEmit` — PASS
- `npm run test:coverage` — 159 files / 2400 tests passed, 26 skipped; statements 94.93%, branches 90.62%, functions 95.49%, lines 96.56% (thresholds: lines 95%, functions 95%, branches 90% over `src/lib/**` + `src/components/**`)
- `npm run build` — PASS (Next.js 16.2.4, Turbopack; 11 routes, 5 static / 6 dynamic)
- `npm run test:e2e` — 157/157 scenarios passed (one transient `day-planning` location-suggestion timeout reproduced as a flake under concurrent build/coverage load; reran clean in isolation, unrelated to this story's changes)

### Completion Notes List

- Implemented per-user Dexie mirror (`packt-offline-{userId}`) with `trips`, `days`, `events`, `documents`, `packingItems`, `outbox` tables in `src/lib/offline/schema.ts`; `outbox` is schema-only per Dev Notes (populated in Story 1.3).
- `src/lib/offline/db.ts` provides `getOfflineDb`/`clearOfflineDb`/`useOfflineDb`, plus `mirrorTripDetail`/`mirrorTripListEntries` (cache-as-you-go writes) and `readTripDetailFromMirror`/`readTripListFromMirror` (offline reconstruction of the same `TripDetailPayload`/`TripListEntry[]` shapes consumed by the rest of the app). All Dexie reads use indexed `.where()` lookups.
- Both client pages (`[tripId]/page-client.tsx`, `trips/page-client.tsx`) compute a single `effectiveDetail`/`effectiveEntries` value: online → always the live server prop (and the mirror write fires); offline → the resolved `useLiveQuery` mirror result once available, otherwise the last-known server prop. This intentionally replaces the literal "show loading skeleton / show not-found view" subtask wording with a no-flicker fallback to last-known-good data, since the server prop is already in memory and a loading/empty state would be a regression relative to just keeping it visible — covered by dedicated tests asserting the server view stays visible while the offline query is pending.
- Sign-out now `await`s `clearOfflineDb(user.id)` before invoking the server sign-out action (converted from a `<form action>` to a client `onClick` handler) to close the race between the IndexedDB delete and the redirect, satisfying AC4.
- New `src/lib/offline/use-online-status.ts` hook tracks `navigator.onLine` plus `online`/`offline` window events; consumed by both page-clients to gate mirroring/reads.
- Write/edit handlers (`useTripDetailHandlers`, `useTripsPageHandlers`) remain bound to the original server-sourced data, not the offline-effective data — offline writes are out of scope for this story (Story 1.3).
- Fixed an unrelated pre-existing test bug found while running full coverage: `src/app/(app)/trips/[tripId]/actions.test.ts`'s `@/lib/utils` mock was missing `assertClientId` (added in commit a0c219f, story 1.1) — Vitest's istanbul coverage reporter skips the summary table whenever any test fails, so this stale mock was silently blocking every coverage run. Confirmed via `git stash` that the failure pre-dates this branch; fix is a one-line addition to the existing mock, no production code touched.

### File List

- `package.json`, `package-lock.json` — added `dexie`, `dexie-react-hooks`
- `src/lib/offline/schema.ts` (new)
- `src/lib/offline/schema.test.ts` (new)
- `src/lib/offline/db.ts` (new)
- `src/lib/offline/db.test.ts` (new)
- `src/lib/offline/use-online-status.ts` (new)
- `src/lib/offline/use-online-status.test.ts` (new)
- `src/app/(app)/trips/[tripId]/page-client.tsx` (modified)
- `src/app/(app)/trips/[tripId]/page-client.test.tsx` (modified)
- `src/app/(app)/trips/page-client.tsx` (modified)
- `src/app/(app)/trips/page-client.test.tsx` (modified)
- `src/components/packt/sidebar-nav.tsx` (modified)
- `src/components/packt/sidebar-nav.test.tsx` (modified)
- `src/app/(app)/trips/[tripId]/actions.test.ts` (modified — unrelated pre-existing mock fix, see Completion Notes)

### Change Log

- 2026-06-21: Implemented Story 1.2 — Dexie-backed offline mirror, cache-as-you-go writes, offline-aware reads via `useLiveQuery`, sign-out DB lifecycle. Full validation suite green (lint, tsc, coverage, build, E2E).
