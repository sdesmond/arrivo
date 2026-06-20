---
baseline_commit: a8a2c45597ca5d8f078ac637b46eb0c16b69abe8
---

# Story 3.2: Remove Cover Controls from the Trip Edit Sheet

Status: done

## Story

As a trip planner,
I want the trip edit sheet to focus on trip details rather than duplicate cover management,
so that the edit sheet stays simple and cover editing happens in one place — the Cover Overflow Menu (Story 3.1).

## Acceptance Criteria

1. `trip-edit-sheet.tsx` — remove `TripEditCover` import, the `<TripEditCover />` JSX section, and `coverImageUrl` from `getPatch()` return; remove the `TripEditCover`-related `destinationCenter` prop plumbing (only used to pass center to cover picker). All other sections (name, dates, destination, budget, collaborators, Delete Trip, date-change confirmation) are unchanged.

2. `trip-edit-cover.tsx` — delete the file entirely. `trip-edit-cover.test.tsx` — delete the file entirely.

3. `trip-edit-sheet.test.tsx` — remove the `vi.mock("./trip-edit-cover")` block and these test cases:
   - "onSave includes updated coverImageUrl after TripEditCover callback fires"
   - "onSave includes coverImageUrl: null after TripEditCover remove fires"
   - "passes the selected destination center through to TripEditCover"
   
   All remaining tests (trip name, dates, budget, destination, collaborators, delete, date-change confirmation, Drawer open/close, reset-on-close, saving state, delete dialog) pass without changes.

4. No remaining references to `TripEditCover` or `trip-edit-cover` across `src/` after deletion — confirm with a search.

5. Cover Overflow Menu (Story 3.1) remains fully functional — only the edit-sheet entry point is removed; the menu, `CoverImagePicker`, attribution dialog, and server actions are unaffected.

## Tasks / Subtasks

- [x] **Task 1: Remove TripEditCover from trip-edit-sheet.tsx** (AC: 1)
  - [x] Remove `import { TripEditCover } from "@/components/packt/trip-edit-cover"`
  - [x] Remove the `<TripEditCover ... />` JSX block (lines 211–224, props: tripId, tripName, coverImageUrl, onCoverImageUrlChange, disabled, destinationName, destinationCountry, center)
  - [x] Remove `coverImageUrl` from `getPatch()` return (lines 131–134 — the ternary + the property in the return object)
  - [x] Remove `destinationCenter` state — was only used to pass center to `TripEditCover` (line 59, line 69, referenced in `<TripEditCover center={destinationCenter}>`)

- [x] **Task 2: Delete trip-edit-cover.tsx and its test** (AC: 2)
  - [x] `git rm src/components/packt/trip-edit-cover.tsx`
  - [x] `git rm src/components/packt/trip-edit-cover.test.tsx`

- [x] **Task 3: Update trip-edit-sheet.test.tsx** (AC: 3)
  - [x] Remove the `vi.mock("./trip-edit-cover")` block
  - [x] Remove test: "onSave includes updated coverImageUrl after TripEditCover callback fires"
  - [x] Remove test: "onSave includes coverImageUrl: null after TripEditCover remove fires"
  - [x] Remove test: "passes the selected destination center through to TripEditCover"
  - [x] Keep all other tests as-is

- [x] **Task 4: Verify no remaining references** (AC: 4)
  - [x] `rg -r "TripEditCover|trip-edit-cover" src/` returns no matches (after the removal)

- [x] **Task 5: E2E — verify no cover controls in edit sheet** (AC: 5)
  - [x] Add scenario to `tests/e2e/features/trip-cover-overflow.feature`: open trip edit sheet, assert no cover image controls present
  - [x] Add step definitions in `tests/e2e/steps/trip-cover-overflow.steps.ts`

### Review Findings

- [x] [Review][Patch] Restore overflow upload persistence coverage [tests/e2e/features/trip-cover-overflow.feature:5]
- [x] [Review][Patch] Restore overflow remove persistence coverage [tests/e2e/features/trip-cover-overflow.feature:12]
- [x] [Review][Patch] Assert `TripEditSheet` save patches omit `coverImageUrl` [src/components/packt/trip-edit-sheet.test.tsx]
- [x] [Review][Patch] Double `page.reload()` in persistence assertion — pre-reload assert makes reload pointless [tests/e2e/steps/trip-cover-overflow.steps.ts:102-109]
- [x] [Review][Patch] Upload step has no wait for async completion — no wait/locator assertion after file input [tests/e2e/steps/trip-cover-overflow.steps.ts:86-95]
- [x] [Review][Patch] Silent error swallowing in step guard — `.catch(() => false)` on `isVisible()` masks transitional false-negatives [tests/e2e/steps/trip-cover-overflow.steps.ts:73-79]
- [x] [Review][Patch] No test that trips WITH a cover survive edit-sheet save — only `baseTrip` (no cover) tested for `not.toHaveProperty("coverImageUrl")` [src/components/packt/trip-edit-sheet.test.tsx]

## Dev Notes

### Scope boundary — read first

This story owns **only** the removal of cover image controls from `trip-edit-sheet.tsx` and the deletion of `trip-edit-cover.tsx`.

Explicitly OUT of scope:
- The Cover Overflow Menu itself (Story 3.1 delivers Edit/Remove/Info on `trip-detail-hero.tsx`)
- `CoverImagePicker` — untouched, still invoked directly by `trip-detail-hero.tsx` via the overflow menu
- Any other edit-sheet field or behavior

### Files to delete

| File | Reason |
|------|--------|
| `src/components/packt/trip-edit-cover.tsx` | Unused — `trip-detail-hero.tsx` invokes `CoverImagePicker` directly |
| `src/components/packt/trip-edit-cover.test.tsx` | Colocated test for deleted file |

### Files to modify

| File | Change |
|------|--------|
| `src/components/packt/trip-edit-sheet.tsx` | Remove import, JSX, `coverImageUrl` from `getPatch()`, `destinationCenter` state |
| `src/components/packt/trip-edit-sheet.test.tsx` | Remove mock, remove 3 cover-related test cases |
| `tests/e2e/features/trip-cover-overflow.feature` | Add scenario: edit sheet has no cover controls |
| `tests/e2e/steps/trip-cover-overflow.steps.ts` | Step defs for the new scenario |

### Current state of trip-edit-sheet.tsx (297 lines)

Key locations for the deletion:

**Line 20** — import:
```ts
import { TripEditCover } from "@/components/packt/trip-edit-cover";
```

**Line 59** — state (used only by TripEditCover):
```ts
const [destinationCenter, setDestinationCenter] = useState<[number, number] | undefined>(undefined);
```

**Line 69** — reset (used only by TripEditCover):
```ts
setDestinationCenter(undefined);
```

**Lines 131–134** — `coverImageUrl` in `getPatch()`:
```ts
const coverImageUrl =
  trip?.coverImageUrl === undefined && currentDraft.coverImageUrl === undefined
    ? undefined
    : currentDraft.coverImageUrl || null;
```

**Lines 211–224** — JSX section to remove:
```tsx
<TripEditCover
  tripId={draft.id}
  tripName={draft.name}
  coverImageUrl={draft.coverImageUrl}
  onCoverImageUrlChange={(url) => set("coverImageUrl", url ?? undefined)}
  disabled={isBusy}
  destinationName={...}
  destinationCountry={...}
  center={destinationCenter}
/>
```

After removal, `coverImageUrl` is no longer part of the edit sheet's concerns — remove it from `getPatch()` return entirely (property is optional in `UpdateTripPatch`).

### Current state of trip-edit-sheet.test.tsx (620 lines)

**Lines 49–74** — mock to remove:
```ts
vi.mock("./trip-edit-cover", () => ({ TripEditCover: (...) => ( ... ) }));
```

**Tests to remove:**
1. `"onSave includes updated coverImageUrl after TripEditCover callback fires"` (lines 312–319)
2. `"onSave includes coverImageUrl: null after TripEditCover remove fires"` (lines 321–329)
3. `"passes the selected destination center through to TripEditCover"` (lines 586–591)

After removal, the mock file itself is no longer imported, so `vi.mock` must be removed too.

The remaining tests import only `date-range-picker`, `trip-edit-collaborators`, `trip-edit-destination`, `drawer`, and `alert-dialog` mocks — all unchanged.

### No new props for TripEditSheet

This story removes props/state that were only needed by the `TripEditCover` section. No new props are added.

### E2E — append to existing feature file

The file `tests/e2e/features/trip-cover-overflow.feature` already exists from Story 3.1 and contains:
- Scenario: select Unsplash photo cover → view Info dialog
- Scenario: remove Photo cover → verify Graphic + menu items update

Add a third scenario:
```
Scenario: Edit sheet contains no cover image controls
  Given I am on a trip detail page
  When I open the trip edit sheet
  Then I see no cover image editing controls
```

Step definitions in `tests/e2e/steps/trip-cover-overflow.steps.ts` — add `Given`/`When`/`Then` for opening the edit sheet and asserting absence of cover controls.

### Testing standards (NFR2/NFR3)

- Existing coverage thresholds (≥95% lines/functions, ≥90% branches on `src/lib/**` and `src/components/packt/**`) apply — removing code may simplify coverage paths
- `trip-edit-sheet.test.tsx` continues to cover all remaining edit-sheet fields
- `src/components/ui/**` excluded from coverage (Dialog, Drawer, etc.)
- E2E uses `playwright-bdd`; runs against `packt_e2e` DB (wiped/reseeded by `global-setup.ts`)

### References

- [Source: _bmad-output/epics.md#Story 3.2: Remove Cover Controls from the Trip Edit Sheet] — full AC text, FR-13
- [Source: _bmad-output/implementation-artifacts/3-1-cover-overflow-menu-edit-remove-info.md] — Story 3.1 dev notes, scope boundary confirming deletion is for 3.2
- [Source: src/components/packt/trip-edit-sheet.tsx] — current sheet (297 lines, TripEditCover at lines 20/211–224)
- [Source: src/components/packt/trip-edit-cover.tsx] — current file to delete (69 lines)
- [Source: src/components/packt/trip-edit-sheet.test.tsx] — current test file (620 lines, 3 cover-related tests + mock)
- [Source: _bmad-output/architecture.md#Frontend Architecture] — FR-13: Cover controls removed from edit sheet
- [Source: _bmad-output/ux-designs/ux-packt-2026-06-13/EXPERIENCE.md#Flow 3 — UJ-3: Ashley manages the trip's cover image] — user flow confirming cover management via overflow menu
- [Source: tests/e2e/features/trip-cover-overflow.feature] — existing E2E feature file (append new scenario)

## Dev Agent Record

### Agent Model Used

- Claude Sonnet 4.6 as Amelia via `bmad-agent-dev` and `bmad-dev-story`

### Debug Log References

- `npx vitest run src/components/packt/trip-edit-sheet.test.tsx`
- `npm run lint`
- `npx tsc --noEmit`
- `npm run test:coverage`
- `npm run build`
- `npm run test:e2e`

### Completion Notes List

- Removed `TripEditCover` import, JSX section, `coverImageUrl` from `getPatch()`, and the `destinationCenter` state (plus its two setters in the destination `onSelect`/`onClear` callbacks) from `trip-edit-sheet.tsx`.
- Deleted `trip-edit-cover.tsx` and its colocated test; updated `trip-edit-sheet.test.tsx` to drop the cover mock and the three cover-related test cases — 35 tests pass.
- `rg "TripEditCover|trip-edit-cover" src/` returns no matches.
- Added scenario "Edit sheet contains no cover image controls" to `tests/e2e/features/trip-cover-overflow.feature` with step defs in `tests/e2e/steps/trip-cover-overflow.steps.ts`; passed.
- Out-of-scope cleanup (user-approved): deleted `tests/e2e/features/trip-cover-edit.feature` and `tests/e2e/steps/trip-cover-edit.steps.ts` — orphaned from before Story 3.1, asserting an "Edit"/"Remove image" dialog flow that no longer exists anywhere in `src/` (Story 3.1 replaced it with the overflow menu but never removed the old spec).
- Full validator: lint PASS, TypeScript PASS, production build PASS.
- `npm run test:coverage` had 2 pre-existing failures in `src/components/packt/cover-image-picker.test.tsx:81,94` (`onClose` not called) — reproduced identically on the pre-story baseline commit (`a8a2c45`), confirmed unrelated to this diff.
- `npm run test:e2e` had 2 pre-existing failures unrelated to this diff: `tests/e2e/steps/linked-events.steps.ts:315` (focus-state timeout) and `tests/e2e/steps/packing-tab.steps.ts:394` (reorder-position timeout, already `@retry(5)`). The new and existing `trip-cover-overflow` scenarios all passed.

### File List

**Deleted files:**
- `src/components/packt/trip-edit-cover.tsx`
- `src/components/packt/trip-edit-cover.test.tsx`
- `tests/e2e/features/trip-cover-edit.feature`
- `tests/e2e/steps/trip-cover-edit.steps.ts`

**Modified files:**
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/components/packt/trip-edit-sheet.tsx`
- `src/components/packt/trip-edit-sheet.test.tsx`
- `tests/e2e/features/trip-cover-overflow.feature`
- `tests/e2e/steps/trip-cover-overflow.steps.ts`

**New files:**
- `_bmad-output/implementation-artifacts/3-2-remove-cover-controls-from-the-trip-edit-sheet.md`

### Change Log

- 2026-06-19: Removed cover image controls from the trip edit sheet; deleted `TripEditCover` and its orphaned pre-3.1 E2E spec; added E2E coverage confirming the edit sheet has no cover controls.
- 2026-06-19: Code review patches: removed pre-reload assertion in persistence check, added upload timeout, fixed flaky menu guard, added cover-present test case.
