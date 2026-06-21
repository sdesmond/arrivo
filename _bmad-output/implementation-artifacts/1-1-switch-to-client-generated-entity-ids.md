---
baseline_commit: e0328d1e3ce5fba5c9a7aeefdac75caa07ec6f85
---

# Story 1.1: Switch to Client-Generated Entity IDs

Status: review

## Story

As a developer building the offline sync foundation,
I want every entity create (trips, days, events, documents, packing items) to use a client-generated UUID that the server accepts as-is,
so that the same identity is usable whether the entity is created online or offline, with no ID remapping ever needed.

## Acceptance Criteria

1. All client-side callers of create actions generate `crypto.randomUUID()` before invoking the action and pass the ID as part of the input
2. Every Server Action's insert path uses the client-supplied ID, not the Drizzle `gen_random_uuid()` default — the DB default remains only as a fallback for non-client paths (seed scripts, migrations)
3. Input type shapes in `src/data/types.ts` gain an optional `id: string` field for every create action
4. Every colocated unit test for modified actions asserts the client-supplied ID is the one persisted with no changes
5. Existing action callers (client components) are updated to pass `id` via `crypto.randomUUID()` before calling the action

## Entity Creates to Update

| Action | File | Input type | Change |
|--------|------|-----------|--------|
| `createTrip` | `trips/actions.ts:150` | `CreateTripInput` | Add `id` to input; pass to `trips.insert({ id, ... })` |
| `createEvent` | `[tripId]/actions.ts:126` | `CreateEventInput` | Add `id` to input; pass to `events.insert({ id, ... })` |
| `addDay` | `[tripId]/actions.ts:305` | (inline) | Accept optional `id` param; pass to `days.insert({ id, ... })` |
| `addDocument` | `[tripId]/actions.ts:467` | `AddDocumentInput` | Add `id` to input; pass to `documents.insert({ id, ... })` |
| `uploadDocument` | `document-upload-actions.ts:19` | (FormData) | Accept optional `id`; propagate to `documents.insert({ id, ... })` |
| `uploadDocumentToEvent` | `document-upload-actions.ts:45` | (FormData) | Accept optional `id`; propagate to `documents.insert({ id, ... })` |
| `createNote` | `[tripId]/actions.ts:484` | (inline) | Accept optional `id` param; pass to `itineraryNotes.insert({ id, ... })` |
| `createChecklist` | `[tripId]/actions.ts:526` | (inline) | Accept optional `id` param; pass to `itineraryChecklists.insert({ id, ... })` |
| `createChecklistWithItem` | `[tripId]/actions.ts:541` | (inline) | Accept optional `id` param for checklist; pass to insert |
| `createChecklistItem` | `[tripId]/actions.ts:589` | (inline) | Accept optional `id` param; pass to `checklistItems.insert({ id, ... })` |
| `addPackingItem` | `packing-actions.ts:96` | `AddPackingItemInput` | Add `id` to input; pass to `packingItems.insert({ id, ... })` |
| `createPackingList` | `packing-actions.ts:603` | (inline) | Accept optional `id` param; pass to `tripPackingLists.insert({ id, ... })` |
| `addChecklistFromPackingSource` | `[tripId]/actions.ts:683` | (inline) | Accept optional `id` param for checklist; pass to insert |
| `addCollaborator` | `trips/actions.ts:543` | (inline — `AddCollaboratorInput`) | Add `id` to input; pass to `collaborators.insert({ id, ... })` |
| `createReservation` | `[tripId]/reservations/actions.ts` | `CreateReservationInput` | Add `id` to input; pass to insert |
| `uploadReservationDocument` | `[tripId]/reservations/reservation-document-actions.ts` | (FormData) | Accept optional `id` param; pass to `documents.insert({ id, ... })` |

## Tasks / Subtasks

- [x] Update input types in `src/data/types.ts`: add optional `id: string` to `CreateTripInput`, `CreateEventInput`, `AddDocumentInput`, `AddPackingItemInput`, `AddCollaboratorInput`, `CreateReservationInput`
- [x] Update `createTrip` in `trips/actions.ts`: accept `id` from input, pass to `trips.insert({ id, ... })`
- [x] Update `createEvent` in `[tripId]/actions.ts`: accept `id` from `CreateEventInput`, pass to `events.insert({ id, ... })`
- [x] Update `addDay` in `[tripId]/actions.ts`: accept optional `id` param, pass to `days.insert({ id, ... })`
- [x] Update `addDocument` in `[tripId]/actions.ts`: accept `id` from `AddDocumentInput`, pass to `documents.insert({ id, ... })`
- [x] Update `uploadDocument` / `uploadDocumentToEvent` in `document-upload-actions.ts`: accept optional `id`, pass to `documents.insert({ id, ... })`
- [x] Update `createNote`, `createChecklist`, `createChecklistWithItem`, `createChecklistItem` in `[tripId]/actions.ts`: accept optional `id` param, pass to insert
- [x] Update `addPackingItem` in `packing-actions.ts`: accept `id` from `AddPackingItemInput`, pass to `packingItems.insert({ id, ... })`
- [x] Update `createPackingList` in `packing-actions.ts`: accept optional `id` param, pass to `tripPackingLists.insert({ id, ... })`
- [x] Update `addChecklistFromPackingSource` in `[tripId]/actions.ts`: accept optional `id` param, pass to `itineraryChecklists.insert({ id, ... })`
- [x] Update `addCollaborator` in `trips/actions.ts`: accept `id` from input, pass to `collaborators.insert({ id, ... })`
- [x] Update `createReservation` in `[tripId]/reservations/actions.ts`: accept `id` from `CreateReservationInput`, pass to reservations insert
- [x] Update `uploadReservationDocument` in `[tripId]/reservations/reservation-document-actions.ts`: accept optional `id` param, pass to `documents.insert({ id, ... })`
- [x] Update client callers: each component/page that calls a create action must generate `crypto.randomUUID()` and pass the id
- [x] Write/update colocated tests asserting client-supplied ID is persisted unchanged

## Dev Notes

- This is an **online-only change first** — no Dexie, no offline, no sync engine yet. It validates the approach before offline complexity is added (per architecture.md implementation sequence step 2).
- The DB column default (`gen_random_uuid()`) **stays in place** for seed scripts, migrations, and any non-client-initiated insert. The client-supplied ID simply overrides it at insert time.
- Use `crypto.randomUUID()` (available in all modern browsers and Node 19+) — not a custom UUID library, not `uuid` package.
- Every insert must explicitly include `id` when a client-supplied one is present. Drizzle `insert` with an explicit `id` column value overrides the default.
- For FormData-based upload actions (`uploadDocument`/`uploadDocumentToEvent`), accept the ID as a separate optional parameter rather than from the input type, since the action signature is `(tripId, formData)` not `(input)`.
- For `addDay`, the caller already knows the day number — generate the UUID client-side and pass as an optional param to the existing function signature.
- For `createChecklistWithItem`, only the checklist itself needs the client-generated ID; the initial `checklistItem` can use the default (its primary key is independent).

### Architecture Compliance

- Follows architecture.md implementation sequence: step 2 (UUID switch) must land before Dexie schema work (step 3).
- Input types live in `src/data/types.ts` — do not redefine types inline.
- All insert calls use the existing DB client (`src/db/index.ts` singleton) — no new connection created.
- No `any` types, no `enum` keyword, no single-letter variable names.
- Use `cn()` from `@/lib/utils` where className merges are needed (unlikely in this change).
- Fields use `?:` for optional fields, not `| undefined`.

### Files to Modify

- `src/data/types.ts` — add `id?: string` to create input types
- `src/app/(app)/trips/actions.ts` — modify `createTrip`, `addCollaborator`
- `src/app/(app)/trips/[tripId]/actions.ts` — modify `createEvent`, `addDay`, `addDocument`, `createNote`, `createChecklist`, `createChecklistWithItem`, `createChecklistItem`, `addChecklistFromPackingSource`
- `src/app/(app)/trips/[tripId]/document-upload-actions.ts` — modify `uploadDocument`, `uploadDocumentToEvent`
- `src/app/(app)/trips/packing-actions.ts` — modify `addPackingItem`, `createPackingList`
- `src/app/(app)/trips/[tripId]/reservations/actions.ts` — modify `createReservation`
- `src/app/(app)/trips/[tripId]/reservations/reservation-document-actions.ts` — modify `uploadReservationDocument`
- Client components that call these actions — each must generate UUID before calling

### Testing Requirements

- **Must update existing colocated tests** for every modified action to assert the client-supplied ID is persisted as-is
- Tests should create an entity with a known UUID string and verify the DB returns that exact ID
- Existing test files to update:
  - `src/app/(app)/trips/actions.test.ts` — `createTrip`, `addCollaborator`
  - `src/app/(app)/trips/[tripId]/actions.test.ts` — `createEvent`, `addDay`, `addDocument`, `createNote`, `createChecklist`, `createChecklistItem`
  - `src/app/(app)/trips/[tripId]/document-upload-actions.test.ts` — `uploadDocument`, `uploadDocumentToEvent`
  - `src/app/(app)/trips/[tripId]/reservations/actions.test.ts` — `createReservation`
  - `src/app/(app)/trips/[tripId]/reservations/reservation-document-actions.test.ts` — `uploadReservationDocument`
  - `src/app/(app)/trips/packing-actions.test.ts` — `addPackingItem`, `createPackingList`
- No new test files needed — update existing ones in place
- Coverage thresholds: ≥95% lines/functions, ≥90% branches across `src/lib/**` and `src/components/packt/**` (not enforced for `src/app/**` but tests must still pass)

### References

- [Source: epics.md Story 1.1]
- [Source: architecture.md#Local-ID-strategy] — "every entity create generates its ID client-side via `crypto.randomUUID()`, online and offline alike"
- [Source: architecture.md#Implementation-Sequence] — step 2 must land before Dexie schema work (step 3)
- [Source: architecture.md#Cross-Component-Dependencies] — "The UUID switch (step 2) must land before Dexie schema work (step 3), since the local mirror's primary keys depend on it"
- [Source: src/data/types.ts] — all input type definitions
- [Source: src/app/(app)/trips/actions.ts] — createTrip, addCollaborator
- [Source: src/app/(app)/trips/[tripId]/actions.ts] — createEvent, addDocument, addDay, createNote, createChecklist, etc.
- [Source: src/app/(app)/trips/packing-actions.ts] — addPackingItem, createPackingList
- [Source: src/app/(app)/trips/[tripId]/document-upload-actions.ts] — uploadDocument, uploadDocumentToEvent
- [Source: src/app/(app)/trips/[tripId]/reservations/reservation-document-actions.ts] — uploadReservationDocument

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Every entity-create Server Action now spreads `...(id ? { id } : {})` (or `...(input.id ? { id: input.id } : {})`) as the first key of its `.values()` call, so a client-supplied UUID overrides the Drizzle `gen_random_uuid()` default while leaving the DB default intact for non-client paths.
- `createChecklistWithItem`'s seed `checklistItem` insert intentionally does **not** accept a client ID — only the checklist row itself needs one, per Dev Notes guidance that the item's primary key is independent.
- `src/lib/linked-events.ts` was reviewed per the story's Dev Notes references but required no change: it only derives synthetic, non-persisted display events (`linked-${reservation.id}...`) from existing reservations and never performs a DB insert.
- All client callers (dialogs, hooks, pages) now generate `crypto.randomUUID()` before invoking their action and pass it as the trailing argument or as `input.id`; corresponding caller tests were updated to assert on `expect.any(String)` for the id field/arg.
- `src/components/packt/save-as-template-dialog.test.tsx` has pre-existing flaky timing failures (button-disabled-state race) unrelated to this story — confirmed via `git diff` showing zero changes to that component or its test in this branch, and the flakiness reproduces inconsistently across repeated isolated runs. Not modified or fixed as part of this story.
- Full validation passed: ESLint clean, `tsc --noEmit` clean, `npm run test:coverage` 156/156 test files passing (2356 passed, 26 skipped; 94.73% stmts / 90.53% branches / 95.29% funcs / 96.42% lines), production build succeeded, and all 157 Playwright E2E scenarios passed.

### File List

- `src/data/types.ts`
- `src/app/(app)/trips/actions.ts`
- `src/app/(app)/trips/actions.test.ts`
- `src/app/(app)/trips/[tripId]/actions.ts`
- `src/app/(app)/trips/[tripId]/actions.test.ts`
- `src/app/(app)/trips/[tripId]/document-upload-actions.ts`
- `src/app/(app)/trips/[tripId]/document-upload-actions.test.ts`
- `src/app/(app)/trips/[tripId]/reservations/actions.ts`
- `src/app/(app)/trips/[tripId]/reservations/actions.test.ts`
- `src/app/(app)/trips/[tripId]/reservations/reservation-document-actions.ts`
- `src/app/(app)/trips/[tripId]/reservations/reservation-document-actions.test.ts`
- `src/app/(app)/trips/[tripId]/use-packing-handlers.ts`
- `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts`
- `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.test.tsx`
- `src/app/(app)/trips/packing-actions.ts`
- `src/app/(app)/trips/packing-actions.test.ts`
- `src/app/(app)/trips/use-trips-page-handlers.ts`
- `src/app/(app)/trips/use-trips-page-handlers.test.tsx`
- `src/components/packt/add-doc-dialog.tsx`
- `src/components/packt/add-doc-dialog.test.tsx`
- `src/components/packt/add-reservation-doc-dialog.tsx`
- `src/components/packt/add-reservation-doc-dialog.test.tsx`
- `src/components/packt/reservation-edit-drawer.tsx`
- `src/components/packt/reservation-edit-drawer.test.tsx`
- `src/components/packt/trip-docs-tab.tsx`
- `src/components/packt/trip-docs-tab.test.tsx`

## Change Log

| Date | Change |
|------|--------|
| 2026-06-21 | Implemented client-generated entity IDs across every create action (trips, events, days, documents, notes, checklists, checklist items, packing items, packing lists, collaborators, reservations, reservation/event documents); updated all client callers to generate `crypto.randomUUID()`; updated colocated tests to assert client-supplied IDs persist unchanged; verified via full coverage suite, lint, typecheck, build, and E2E. |
