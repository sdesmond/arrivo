---
baseline_commit: 2d763d5
---

# Story 4.2: Reservations Polish & Hardening Batch

Status: done

## Story

As a developer maintaining the Reservations feature,
I want the small, independently-deferred code-review findings from Stories 1.1-2.4 resolved,
so that the backlog reflects real outstanding work instead of accumulating low-risk items indefinitely.

## Acceptance Criteria

1. **`createReservation` validates `startAt`/`endAt` are well-formed ISO strings**
   - `reservations/actions.ts` — Before opening the transaction, parse `input.startAt` (required) and `input.endAt` (if present) via `new Date(value)` and reject with `Error("Invalid start time.")` / `Error("Invalid end time.")` if `isNaN(parsed.getTime())`
   - Match the existing validation `updateReservation` already has — same check, same placement (before `db.transaction`)
   - Only `startAt` is required to parse; `endAt` is only checked when present

2. **Reservation documents return in stable order**
   - `src/lib/queries.ts` — Add `orderBy(documents.addedAt)` to the `inArray` docs query for reservations (line ~249-252), matching the existing trip-docs query pattern

3. **`REQUIRES_END_AT` deduplicated to `reservation-type-badge.tsx`**
   - Currently duplicated in `reservations/actions.ts` and `reservation-edit-drawer.tsx`
   - Export once from `src/components/packt/reservation-type-badge.tsx` (the existing centralized reservation-type-metadata module)
   - Import by both `reservations/actions.ts` and `reservation-edit-drawer.tsx`
   - No behavior change — same type-to-boolean mapping, same values

4. **`PLACEHOLDER_STYLE` deduplicated to `reservation-inline-text-field.tsx`**
   - Currently duplicated in `reservation-row.tsx` and `reservation-inline-text-field.tsx`
   - Export once from `src/components/packt/reservation-inline-text-field.tsx`
   - Import by `reservation-row.tsx`
   - No visual change

5. **`ReservationAnchorFieldset` date/time inputs wired via `aria-describedby` to error**
   - `ReservationAnchorFieldset` already renders an error `<p>` with an `errorId` but does not wire it to the date/time inputs
   - Add `aria-describedby={errorId}` (conditional, only when `error` is truthy) to both `DatePicker` and `TimePicker` inputs
   - No new DOM structure — just the ARIA attribute on existing inputs

6. **Accordion header `aria-controls` linking to toggleable region**
   - `reservation-type-section.tsx` — The header `<button aria-expanded>` must have `aria-controls` referencing the `id` of the region it expands/collapses
   - The toggleable region already has an `id` (for other purposes); if not, add one
   - Accessible name pattern (from UX-DR12): "{Type name}, {count} reservation{s}, {expanded|collapsed}" — count badge and `ChevronDown` remain `aria-hidden="true"`

7. **Stale `openSections` entry after last-of-type delete**
   - `reservations-tab.tsx` — When the last Reservation of a type is deleted, the `openSections` Set still contains that type's key
   - On the next render, if a new Reservation of that type is added later, the section re-appears collapsed (not stale-expanded)
   - Fix: clean up the Set entry when deleting a reservation that results in zero remaining of that type

8. **Delete buttons disambiguated when providers share a name**
   - `reservation-row.tsx` — When two Reservations have the same `provider`, each delete button's accessible name must be distinct
   - Use the existing `formatReservationDateRange` helper to produce e.g. "Delete provider-name reservation for {date-range}" instead of just "Delete {provider}"
   - Matches the pattern used elsewhere for disambiguating named items

9. **In-flight/double-submit guard on inline edits**
   - `ReservationInlineTextField`'s `save()` and `reservation-row.tsx`'s `handleDoneEditingDates()` — If a save is already in flight (a `useTransition` or similar is pending), a re-entrant call (rapid Enter+blur, double-blur) is a no-op
   - Mirror the existing `deletingRef` guard pattern already used for delete in `reservation-row.tsx`
   - Use `useRef(false)` as a guard (set `true` on first call, cleared on completion/error)

10. **`_bmad-output/implementation-artifacts/deferred-work.md` updated**
    - Items closed by Story 4.2 (the 9 items above) are removed from the "Closed by Epic 4" section
    - All items confirmed as accepted-design/no-action are also removed
    - A new "Candidate Future Epics" section lists the three app-wide concerns intentionally left open:
      - Timezone-naive UTC storage
      - No server-side upload MIME validation + unsanitized filename-as-blob-key
      - No row-level locking/TOCTOU across server actions
    - Each candidate has one line on what a dedicated future story would need to decide

## Tasks / Subtasks

- [x] Task 1: Add `startAt`/`endAt` parse validation to `createReservation` (AC: 1)
  - [x] Before `db.transaction(...)`, validate both timestamps
  - [x] Match `updateReservation`'s existing validation pattern exactly

- [x] Task 2: Add `orderBy(documents.addedAt)` to reservations docs query (AC: 2)
  - [x] `src/lib/queries.ts` — stable sort for reservation-scoped documents

- [x] Task 3: Deduplicate `REQUIRES_END_AT` to `reservation-type-badge.tsx` (AC: 3)
  - [x] Export from `reservation-type-badge.tsx`
  - [x] Update imports in `reservations/actions.ts` and `reservation-edit-drawer.tsx`
  - [x] Remove old local definitions from both files

- [x] Task 4: Deduplicate `PLACEHOLDER_STYLE` to `reservation-inline-text-field.tsx` (AC: 4)
  - [x] Export from `reservation-inline-text-field.tsx`
  - [x] Import in `reservation-row.tsx`
  - [x] Remove old local definition from `reservation-row.tsx`

- [x] Task 5: Wire `aria-describedby` on date/time inputs (AC: 5)
  - [x] Add conditional `aria-describedby={errorId}` to `DatePicker` and `TimePicker` in `ReservationAnchorFieldset`

- [x] Task 6: Add `aria-controls` to accordion header button (AC: 6)
  - [x] Ensure toggleable region has a stable `id`
  - [x] Wire `aria-controls={regionId}` on `<button aria-expanded>`
  - [x] Verify accessible name pattern per UX-DR12

- [x] Task 7: Fix stale `openSections` entry after last-of-type delete (AC: 7)
  - [x] Clean up Set entry in `reservations-tab.tsx` on delete

- [x] Task 8: Disambiguate delete button aria-labels (AC: 8)
  - [x] Use `formatReservationDateRange` to produce unique accessible names per row

- [x] Task 9: Add in-flight guard to inline edit save paths (AC: 9)
  - [x] Mirror `deletingRef` pattern with `useRef(false)` in both `ReservationInlineTextField` and `reservation-row.tsx`

- [x] Task 10: Update `deferred-work.md` (AC: 10)
  - [x] Remove closed items from "Closed by Epic 4" section
  - [x] Add/update "Candidate Future Epics" section
  - [x] Remove confirmed accepted-design items

## Dev Notes

### Scope boundary

This story closes 9 independent deferred items from Epics 1-3's code reviews. Each is self-contained — no behavioral dependency chains between them.

Explicitly out of scope:
- Any new product behavior or feature work
- `extendTripDateRange(...)` modifications
- The three "Candidate Future Epics" items (timezone, upload validation, locking) — document their intended shape in `deferred-work.md` but do not implement
- Adding a `reservations.trip_id` index (deferred as acceptable, per original Story 1.1 spec)
- E2E robustness issues (dev-overlay click interception, weak assertions) — deferred separately

### Previous story learnings (Story 4.1)

**Critical: Do NOT re-export `"use server"` functions from another `"use server"` file.**
Re-exporting via `export { ... } from "./reservation-document-actions"` from within `actions.ts` causes Turbopack to lose export analysis (`The module has no exports at all`), surfacing only at runtime — `tsc --noEmit` does not catch this. Consumer components must import from the source file directly.

**Validator coverage note:** `vitest run --coverage` (Istanbul provider) may crash or silently produce no report due to pre-existing Vite temp-dir race conditions. Test pass/fail data is reliable; coverage percentages may not be. This is a pre-existing environment issue, not caused by this story.

### Current state to preserve

- `createReservation` currently calls `db.transaction(...)` before validation checks inside the transaction. AC1 adds validation before the transaction opens.
- `reservations/actions.ts` is now split into `actions.ts` (CRUD), `reservation-date-range.ts`, and `reservation-document-actions.ts` — from Story 4.1's AC1 action file split.
- `reservation-type-badge.tsx` is the canonical source for reservation-type metadata (icon map and type names) — extend it with `REQUIRES_END_AT` rather than creating a new module.
- `ReservationsTab` already has `isDateless` / `onOpenEditDates` props (from Story 4.1) — do not remove them; AC7 only affects `openSections` cleanup.

### Files to modify

- `src/app/(app)/trips/[tripId]/reservations/actions.ts` — AC1 (parse validation)
- `src/lib/queries.ts` — AC2 (stable document order)
- `src/components/packt/reservation-type-badge.tsx` — AC3 (export `REQUIRES_END_AT`)
- `src/components/packt/reservation-inline-text-field.tsx` — AC4 (export `PLACEHOLDER_STYLE`)
- `src/components/packt/reservation-row.tsx` — AC4 (import style), AC8 (disambiguate labels), AC9 (in-flight guard)
- `src/components/packt/reservation-anchor-fieldset.tsx` — AC5 (aria-describedby)
- `src/components/packt/reservation-type-section.tsx` — AC6 (aria-controls)
- `src/components/packt/reservations-tab.tsx` — AC7 (stale openSections)
- `_bmad-output/implementation-artifacts/deferred-work.md` — AC10 (update)

### Files to leave untouched

- `src/app/(app)/trips/actions.ts` — no changes
- `src/app/(app)/trips/[tripId]/actions.ts` — no changes
- `src/db/schema.ts` — no schema changes
- `src/data/types.ts` — no type changes
- All E2E feature/step files — no new E2E scenarios needed (each AC is unit-testable)

### Testing guidance

Every AC in this story is unit-testable at the component or action level — no new E2E coverage is required. Follow the existing testing pyramid: unit tests for logic and rendering.

**Specific test updates per AC:**

- AC1: Extend `reservations/actions.test.ts` — add cases for malformed `startAt` (non-parseable string, empty), malformed `endAt` (when present), and confirm both still throw `Error` with correct message before the transaction. Keep one dated-trip success case to prove no regression.
- AC2: Extend `queries.test.ts` (or the relevant test) — assert the document query returns documents ordered by `addedAt`.
- AC3: Extend `reservation-type-badge.test.tsx` — assert `REQUIRES_END_AT` maps correctly for Lodging/Rental Car/Cruise (`true`) and Flight/Train/Bus/Ferry (`false`). Update `actions.test.ts` and `reservation-edit-drawer.test.tsx` to import from the new canonical source.
- AC4: Extend `reservation-inline-text-field.test.tsx` — assert `PLACEHOLDER_STYLE` is exported. Update `reservation-row.test.tsx` to import from the new canonical source.
- AC5: Extend `reservation-anchor-fieldset.test.tsx` — assert `aria-describedby` is present on inputs when `error` is truthy and absent when falsy.
- AC6: Extend `reservation-type-section.test.tsx` — assert header button has `aria-controls` matching the region `id`.
- AC7: Extend `reservations-tab.test.tsx` — simulate deleting the last Reservation of a type, then adding a new one of the same type, and assert it renders collapsed.
- AC8: Extend `reservation-row.test.tsx` — assert delete buttons with the same provider have distinct accessible names.
- AC9: Extend `reservation-row.test.tsx` and `reservation-inline-text-field.test.tsx` — assert rapid double-invocation of inline save does not produce two mutation calls.

### Architecture compliance

- All `TripEvent` marker fields remain exactly `linkedReservationId?: string` and `reservationType?: ReservationType` — no new marker fields introduced by this story.
- All `ReservationType` values remain kebab-case: `flight | train | bus | ferry | rental-car | lodging | cruise | other`.
- All server actions throw `Error("<user-facing message>")` — no `{ success, error }` wrapper.
- All new ARIA attributes follow WCAG AA per EXPERIENCE.md's Accessibility Floor.

### References

- [Source: _bmad-output/epics.md#Story 4.2] — story ACs
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#Closed by Epic 4] — deferred items closed by this story
- [Source: _bmad-output/implementation-artifacts/4-1-require-trip-dates-before-adding-a-reservation.md] — previous story dev notes, review findings, and action file split structure
- [Source: _bmad-output/architecture.md#Implementation Patterns & Consistency Rules] — naming, structure, and error-handling patterns
- [Source: _bmad-output/project-context.md#Testing] — colocated test + coverage expectations
- [Source: src/app/(app)/trips/[tripId]/reservations/actions.ts] — current `createReservation` and `updateReservation` validation patterns
- [Source: src/components/packt/reservation-type-badge.tsx] — existing centralized type-metadata module
- [Source: src/components/packt/reservation-inline-text-field.tsx] — existing inline text field component
- [Source: src/components/packt/reservation-type-section.tsx] — accordion header/region

### Review Findings

- [x] [Review][Patch] AC8 disambiguation breaks down for two dateless reservations sharing a provider — `formatReservationDateRange` returns `""` when both `startAt`/`endAt` are unset, so `deleteLabel` fell back to the ambiguous `Delete {provider}` for both rows. Resolved (Spencer's call): disambiguate by ordinal position within the type section when there's no date range, e.g. `Delete Grand Hotel reservation (2 of 3)`. Fixed via `position`/`total` props threaded from `reservation-type-section.tsx` into `ReservationRow`. [src/components/packt/reservation-row.tsx, src/components/packt/reservation-type-section.tsx]
- [x] [Review][Patch] Reservation-docs `orderBy` doesn't match the trip-docs pattern it was supposed to mirror — sibling `tripDocs` query uses `sql\`${documents.addedAt} desc nulls last\`, asc(documents.id)` for deterministic ordering with nullable `addedAt`; the new reservations docs query used bare `asc(documents.addedAt)` with no nulls handling and no `id` tie-break. Fixed to match the sibling query exactly. [src/lib/queries.ts:272]
- [x] [Review][Defer] `createReservation`'s new startAt/endAt parse checks treat `null` as a valid date (`new Date(null)` is epoch, not `NaN`), silently degrading to "no date" instead of rejecting — pre-existing characteristic mirrored intentionally from `updateReservation`'s pattern per AC1's instruction to match it exactly. Not exploitable for data corruption (degrades to absent date). [src/app/(app)/trips/[tripId]/reservations/actions.ts:25,29] — deferred, pre-existing

### Completion Notes List

- Added pre-transaction ISO parsing in `createReservation`, stable reservation-doc ordering, and shared `REQUIRES_END_AT` / `PLACEHOLDER_STYLE` exports to remove duplication.
- Linked reservation date/time errors through shared picker primitives, added accordion `aria-controls`, cleaned stale reservation-section open state, and made duplicate-provider delete labels distinct.
- Added in-flight guards for inline reservation saves, updated deferred-work tracking, and extended unit coverage for action, query, accessibility, and inline-edit regressions.

### Change Log

| Date | Change |
|------|--------|
| 2026-06-20 | Created Story 4.2: Reservations Polish & Hardening Batch — 9 independently-deferred code-review items from Epics 1-3 |
| 2026-06-20 | Implemented Story 4.2 and validated with lint, TypeScript, coverage, production build, and Playwright E2E |
| 2026-06-20 | Code review: fixed dateless-duplicate-provider delete-label collision (ordinal disambiguation) and reservation-docs orderBy mismatch vs trip-docs pattern; deferred a pre-existing null-bypass in startAt/endAt validation; closed as done |

### File List

- `_bmad-output/implementation-artifacts/4-2-reservations-polish-and-hardening-batch.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/deferred-work.md`
- `src/app/(app)/trips/[tripId]/reservations/actions.ts`
- `src/app/(app)/trips/[tripId]/reservations/actions.test.ts`
- `src/components/packt/reservation-edit-drawer.tsx`
- `src/components/packt/reservation-anchor-fieldset.tsx`
- `src/components/packt/reservation-anchor-fieldset.test.tsx`
- `src/components/packt/reservation-inline-text-field.tsx`
- `src/components/packt/reservation-inline-text-field.test.tsx`
- `src/components/packt/reservation-row.tsx`
- `src/components/packt/reservation-row.test.tsx`
- `src/components/packt/reservation-type-badge.tsx`
- `src/components/packt/reservation-type-badge.test.tsx`
- `src/components/packt/reservation-type-section.tsx`
- `src/components/packt/reservation-type-section.test.tsx`
- `src/components/packt/reservations-tab.tsx`
- `src/components/packt/reservations-tab.test.tsx`
- `src/components/ui/date-picker.tsx`
- `src/components/ui/time-picker.tsx`
- `src/lib/queries.ts`
- `src/lib/queries.test.ts`
