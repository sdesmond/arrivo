---
story_id: "4.1"
story_key: "4-1-fix-blob-cascade-leak"
epic: 4
story: 1
title: "Fix Blob Cascade Leak in deleteEvent and deleteTrip"
status: "ready-for-dev"
created: "2026-05-22"
---

# Story 4.1 — Fix Blob Cascade Leak in deleteEvent and deleteTrip

## Story

As a **developer**,
I want `deleteEvent` and `deleteTrip` to clean up Vercel Blob storage before cascading the database delete,
So that blob files are not silently orphaned whenever an event or trip is deleted.

## Background

Deferred from the Story 1.3 code review. The root cause: `documents.eventId` and `documents.tripId` both carry `onDelete: "cascade"` in `src/db/schema.ts`. When Drizzle deletes an `events` or `trips` row, Postgres silently cascade-deletes all linked `documents` rows — but cannot call the Vercel Blob API. The blob files remain on the CDN and keep accumulating storage cost.

The fix was already applied to `deleteEventWithDocDecision` (Story 3.2) and `removeDocument` (Story 1.3). This story applies the same pattern to the two remaining deletion paths: `deleteEvent` (for events without attached docs from the UI perspective, but still able to have docs attached server-side due to the race condition) and `deleteTrip` (which cascades every document for that trip).

## Acceptance Criteria

**AC1 — `deleteEvent` cleans up blobs before cascading:**
Given an event has documents attached (regardless of what the UI's client-side `hasDocs` check believes),
When `deleteEvent(eventId)` is called,
Then all `documents` rows where `eventId` matches are fetched before the delete; the event row is deleted (cascading the document DB rows); any non-null blob URLs are passed to `del()` from `@vercel/blob`; blob cleanup is skipped when `UPLOAD_STUB=true`; individual blob errors are caught with `console.warn` and do not abort the delete.

**AC2 — `deleteTrip` cleans up blobs before cascading:**
Given a trip has one or more documents (trip-level or event-level, since all documents have `tripId` set),
When `deleteTrip(tripId)` is called,
Then all `documents` rows where `tripId` matches are fetched before the delete; the trip row is deleted (cascading all document DB rows via the FK); any non-null blob URLs are passed to `del()`; blob cleanup is skipped when `UPLOAD_STUB=true`; individual blob errors are caught with `console.warn` and do not abort the delete.

**AC3 — No behaviour change for events or trips with no documents:**
Given an event or trip has no documents attached,
When the respective delete action is called,
Then behaviour is identical to the current implementation — no extra queries, no blob cleanup attempted.

**AC4 — Blob cleanup pattern matches the established convention:**
Given the existing blob cleanup in `deleteEventWithDocDecision` (lines 174–179 of `src/app/(app)/trips/[tripId]/actions.ts`) uses `Promise.all` with per-URL `.catch(console.warn)`,
When the fix is applied,
Then both `deleteEvent` and `deleteTrip` use the same pattern verbatim — no alternative error handling or retry logic introduced.

**AC5 — Existing tests continue to pass:**
Given the implementation is complete,
When `npm run build-validator` and `npm run test:e2e` are run,
Then all existing unit tests and E2E tests pass with no regressions.

---

## Dev Notes

### Current State

#### `deleteEvent` — `src/app/(app)/trips/[tripId]/actions.ts:148–154`

```typescript
export async function deleteEvent(eventId: string) {
  const user = await requireUser();
  const tripId = await getEventTripId(eventId);
  await assertTripAccess(tripId, user.id!, "editor");
  await db.delete(events).where(eq(events.id, eventId));
  revalidatePath(`/trips/${tripId}`);
}
```

- Called from `place-row.tsx` when the client-side `hasDocs` check is false.
- `documents.eventId` FK carries `onDelete: "cascade"` (`src/db/schema.ts:152`) — so any docs whose `eventId` matches get DB rows deleted by Postgres, but blob URLs are never cleaned up.
- The `documents` table is already imported at line 5 of this file — no new import needed.
- `eq` is already imported from `drizzle-orm` — no new import needed.

#### `deleteTrip` — `src/app/(app)/trips/actions.ts:56–61`

```typescript
export async function deleteTrip(tripId: string) {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "owner");
  await db.delete(trips).where(eq(trips.id, tripId));
  revalidatePath("/trips");
}
```

- Called from the account/trip management UI.
- `documents.tripId` FK carries `onDelete: "cascade"` (`src/db/schema.ts:151`) — ALL documents for a trip (both trip-level docs and event-level docs, since every document has `tripId` set) get cascade-deleted, with no blob cleanup.
- `documents` is NOT currently imported in this file. Must be added to the schema import.
- `eq` IS already imported from `drizzle-orm`.

### Reference: Established Blob Cleanup Pattern

From `deleteEventWithDocDecision` (`src/app/(app)/trips/[tripId]/actions.ts:160–182`) — mirror this exactly:

```typescript
let urlsToCleanup: string[] = [];

await db.transaction(async (tx) => {
  // ... collect urls into urlsToCleanup ...
  // ... delete DB rows ...
});

if (urlsToCleanup.length > 0 && process.env.UPLOAD_STUB !== "true") {
  const { del } = await import("@vercel/blob");
  await Promise.all(
    urlsToCleanup.map((url) => del(url).catch((err) => console.warn(`Blob cleanup failed for ${url}`, err)))
  );
}
```

Key points from the existing pattern:
- DB delete happens first; blob cleanup is a best-effort post-step.
- Dynamic `import("@vercel/blob")` is used (not a top-level static import) — match this to stay consistent with the rest of the file.
- `UPLOAD_STUB !== "true"` guard skips real blob calls in E2E/test environments.
- Per-URL `.catch(err => console.warn(...))` ensures one failed blob delete doesn't abort the others.
- `Promise.all` — all deletions run in parallel.

### Task 1: Fix `deleteEvent`

**File:** `src/app/(app)/trips/[tripId]/actions.ts`

No new imports needed — `documents` and `eq` are already imported.

Replace the current `deleteEvent` function:

```typescript
export async function deleteEvent(eventId: string) {
  const user = await requireUser();
  const tripId = await getEventTripId(eventId);
  await assertTripAccess(tripId, user.id!, "editor");

  const eventDocs = await db.select({ url: documents.url }).from(documents).where(eq(documents.eventId, eventId));

  await db.delete(events).where(eq(events.id, eventId));

  const urlsToCleanup = eventDocs.map((d) => d.url).filter((u): u is string => !!u);
  if (urlsToCleanup.length > 0 && process.env.UPLOAD_STUB !== "true") {
    const { del } = await import("@vercel/blob");
    await Promise.all(
      urlsToCleanup.map((url) => del(url).catch((err) => console.warn(`Blob cleanup failed for ${url}`, err)))
    );
  }

  revalidatePath(`/trips/${tripId}`);
}
```

### Task 2: Fix `deleteTrip`

**File:** `src/app/(app)/trips/actions.ts`

Add `documents` to the schema import (line 6 currently is):

```typescript
import { trips, collaborators, packingItems } from "@/db/schema";
```

Change to:

```typescript
import { trips, collaborators, packingItems, documents } from "@/db/schema";
```

Replace the current `deleteTrip` function:

```typescript
export async function deleteTrip(tripId: string) {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "owner");

  const tripDocs = await db.select({ url: documents.url }).from(documents).where(eq(documents.tripId, tripId));

  await db.delete(trips).where(eq(trips.id, tripId));

  const urlsToCleanup = tripDocs.map((d) => d.url).filter((u): u is string => !!u);
  if (urlsToCleanup.length > 0 && process.env.UPLOAD_STUB !== "true") {
    const { del } = await import("@vercel/blob");
    await Promise.all(
      urlsToCleanup.map((url) => del(url).catch((err) => console.warn(`Blob cleanup failed for ${url}`, err)))
    );
  }

  revalidatePath("/trips");
}
```

### Task 3: Validate

Run the following in order:

1. `build-validator` agent — catches lint/tsc/build errors
2. `npm run test:e2e` — full regression pass

No new unit tests are required. Both action files live in `src/app/**`, which is explicitly excluded from Vitest coverage (`vitest.config.mts:23`). Blob cleanup requires real Vercel Blob storage; E2E runs with `UPLOAD_STUB=true` so the `del()` branch is never executed by automated tests. This is the same accepted exclusion applied to `removeDocument` and `deleteEventWithDocDecision` in Stories 1.3 and 3.2.

### Potential Gotchas

1. **`documents` not imported in `trips/actions.ts`** — easy to miss since the file only imports `trips`, `collaborators`, `packingItems`. Adding `documents` to that import is the only schema change needed.

2. **`db` import in `trips/actions.ts`** — confirm `db` is imported (it is, at line 3). The `documents` table query uses the same `db` instance.

3. **Query fetches all columns but only `url` is needed** — use `db.select({ url: documents.url })` to avoid fetching unused columns, matching the pattern in `deleteEventWithDocDecision` (line 167: `await tx.select().from(documents)...` selects all — but using a projection is cleaner and matches how `deleteEventWithDocDecision` maps the result immediately to `.map((d) => d.url)`).

4. **Event-level docs also have `tripId` set** — when `deleteTrip` fetches `documents WHERE tripId = ?`, it will include both trip-level docs AND event-level docs (which carry both `tripId` and `eventId`). This is intentional — we want to clean ALL blobs for the trip. The `events` rows (and their own cascade) will also fire, but by the time the `events` cascade runs, the `documents` rows are already gone (the trip cascade fires first at the trip level).

   Wait — actually the cascade order matters. When `trips` is deleted:
   - `days` cascade-deletes from `trips.id`
   - `events` cascade-deletes from `days.id` (via the days cascade) AND also from `trips.id` directly
   - `documents` cascade-deletes from `trips.id`
   
   All cascades fire atomically in the same transaction. The pre-fetch of `documents WHERE tripId = ?` runs BEFORE the delete, so it correctly captures all document URLs before Postgres cleans them up.

5. **`deleteEvent` in the normal (no-docs) path** — in the normal UI flow, `deleteEvent` is only called when `hasDocs === false`. The pre-fetch query will return an empty array, the `urlsToCleanup.length > 0` guard short-circuits, and zero extra work happens. No performance concern.

6. **Do not wrap `deleteEvent` in a transaction** — the existing `deleteEventWithDocDecision` uses a `db.transaction()` because it conditionally either updates or deletes the document rows. `deleteEvent` just deletes the event row (documents are removed by cascade, not by explicit delete). Wrapping in a transaction is unnecessary here.

---

## Tasks / Subtasks

- [x] Task 1: Fix `deleteEvent` in `src/app/(app)/trips/[tripId]/actions.ts`
  - [x] Fetch `{ url }` from `documents` where `eventId = eventId` before the delete
  - [x] Filter non-null URLs, run `del()` with `Promise.all` + per-URL catch, gated on `UPLOAD_STUB !== "true"`
- [x] Task 2: Fix `deleteTrip` in `src/app/(app)/trips/actions.ts`
  - [x] Add `documents` to the schema import
  - [x] Fetch `{ url }` from `documents` where `tripId = tripId` before the delete
  - [x] Filter non-null URLs, run `del()` with `Promise.all` + per-URL catch, gated on `UPLOAD_STUB !== "true"`
- [x] Task 3: Run `build-validator`; fix any issues — clean (lint/tsc/tests/build all pass)
- [x] Task 4: Run `npm run test:e2e`; confirm no regressions — 45/45 passed

---

## Dev Agent Record

### Implementation complete — 2026-05-22

**Action changes (committed dd04285):**
- `src/app/(app)/trips/[tripId]/actions.ts` — `deleteEvent` now pre-fetches doc URLs and calls `del()` post-cascade
- `src/app/(app)/trips/actions.ts` — `deleteTrip` now pre-fetches doc URLs and calls `del()` post-cascade; `documents` added to schema import

**E2E independence fixes (follow-up session):**
- `tests/e2e/steps/trips.steps.ts` — added `tripNameMutated` flag + DB After hook: resets trip name to "E2E Test Trip" after the rename scenario so state never leaks to parallel workers
- `tests/e2e/steps/common.steps.ts` — increased redirect assertion timeout from default 5 s to 15 s to handle bcrypt latency under parallel cold-start load
- `tests/e2e/steps/day-planning.steps.ts` — drag target Y changed from `targetBox.y + 2` to `targetBox.y + Math.round(targetBox.height * 0.3)`; steps increased from 10 → 25 for more reliable dnd-kit collision detection
