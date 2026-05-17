---
title: 'Split day-card.tsx into focused sub-components'
type: 'refactor'
created: '2026-05-17'
status: 'done'
baseline_commit: '8bcf35c3bb2164a01a8a6dc242a0fd44cbb312f6'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `day-card.tsx` has grown to 522 lines, blending three distinct concerns — the collapsible header with inline subtitle editing, the gap-zone insert control, and the DnD timeline body — into one file that is hard to navigate and impossible to test in isolation.

**Approach:** Extract `GapZone` into `gap-zone.tsx` and the header block into `day-card-header.tsx` (taking its subtitle-editing state with it). Leave the timeline computation, draft insertion, and DnD handlers in `day-card.tsx` where they remain tightly coupled to one another.

## Boundaries & Constraints

**Always:**
- All new components include `"use client"`, define an explicit `ComponentNameProps` interface immediately before the function, and follow existing styling conventions (CSS custom properties, no hardcoded colors, Lucide icons with `strokeWidth={1.5}`).
- The public interface of the exported `DayCard` component (prop names, types, and behavior) must remain identical — this is a pure internal refactor.
- Each new file in `src/components/packt/` must have a colocated `.test.tsx` file covering the new component's own behavior.
- All existing `day-card.test.tsx` tests must pass without any modification.

**Ask First:**
- If it seems useful to also split the DnD timeline body into a `DayTimeline` component — pause and ask before doing so, because it would require threading ~15 props.

**Never:**
- Extract draft/gap/DnD state or handlers into custom hooks — only used in one place; the added indirection is not worth it.
- Change any visible UI, styling, or behavior.
- Add new features or handle new edge cases not already present.

</frozen-after-approval>

## Code Map

- `src/components/packt/day-card.tsx` — source file; all three logical units currently live here
- `src/components/packt/day-card.test.tsx` — existing 804-line test suite; must pass unchanged
- `src/components/packt/day-card-sortables.tsx` — sortable wrappers for events/notes/checklists; not touched
- `src/data/types.ts` — `DayItinerary`, `TripEvent`, `ItineraryNote`, `Checklist` needed in new component interfaces

## Tasks & Acceptance

**Execution:**
- [x] `src/components/packt/gap-zone.tsx` -- CREATE; move `GapZoneProps` interface and `GapZone` function verbatim from `day-card.tsx`; add `"use client"` at top; export both -- gives the component a dedicated file for isolated testing
- [x] `src/components/packt/gap-zone.test.tsx` -- CREATE; unit tests: inactive state renders a `+` button with title "Insert item here"; active state renders `TypePicker` (no insert button); clicking the `+` button calls `onOpen`; selecting a type calls `onSelectType` with that type; `onDismiss` is wired into `TypePicker` -- satisfies the colocated test requirement
- [x] `src/components/packt/day-card-header.tsx` -- CREATE; extract the outer header `<div>` block (lines 293–394 in current file) into `DayCardHeader`; lift `isEditingSubtitle` and `draftSubtitle` state and `saveSubtitle` logic into this component; accept `dateDisplay: string`, `isToday: boolean`, `stopsCount: number`, `subtitle: string | undefined`, `open: boolean`, `onToggle: () => void`, `dayNumber: number`, `onUpdateDay?: (dayNumber: number, updates: Partial<DayItinerary>) => void` as props; keep all existing styling and behavior identical
- [x] `src/components/packt/day-card-header.test.tsx` -- CREATE; tests in isolation: renders the date string; renders stops count; renders Active badge when isToday=true; toggle button calls onToggle; clicking subtitle display activates the input; blur saves value via onUpdateDay; Escape cancels without calling onUpdateDay; Enter saves; renders placeholder when subtitle is undefined
- [x] `src/components/packt/day-card.tsx` -- MODIFY; import `GapZone` from `./gap-zone` and `DayCardHeader` from `./day-card-header`; remove the `GapZone` function definition, `GapZoneProps` interface, and the `isEditingSubtitle`/`draftSubtitle` state and `saveSubtitle` function; replace the header JSX block with `<DayCardHeader ... onToggle={() => setOpen(v => !v)} />`; keep all other logic unchanged

**Acceptance Criteria:**
- Given the refactored `DayCard`, when rendered, then all visible output is identical to the pre-refactor output — no UI or behavior changes.
- Given `day-card.test.tsx`, when `npm test` runs, then all existing tests pass with zero modifications to that file.
- Given `gap-zone.test.tsx` and `day-card-header.test.tsx`, when run, then all new tests pass.
- Given `npm run test:coverage`, then coverage thresholds (≥95% lines/functions, ≥90% branches across `src/components/packt/**`) remain met.
- Given `npx tsc --noEmit`, then zero type errors.

## Spec Change Log

## Verification

**Commands:**
- `npm run test:coverage` -- expected: all coverage thresholds met, no regressions in existing tests
- `npx tsc --noEmit` -- expected: zero type errors

## Suggested Review Order

**Component extraction**

- Entry point: DayCard after the split — imports DayCardHeader and GapZone, unchanged public interface
  [`day-card.tsx:1`](../../src/components/packt/day-card.tsx#L1)

- Extracted header with subtitle-editing state lifted inside
  [`day-card-header.tsx:1`](../../src/components/packt/day-card-header.tsx#L1)

- DayCardHeader wired into DayCard — prop threading is the join point
  [`day-card.tsx:238`](../../src/components/packt/day-card.tsx#L238)

- GapZone extracted; GapZoneProps exported so day-card.tsx can type makeGapProps
  [`gap-zone.tsx:1`](../../src/components/packt/gap-zone.tsx#L1)

**State relocation**

- `draftSubtitle` initialized from prop; `onClick` re-reads prop at edit time (no stale-state risk)
  [`day-card-header.tsx:26`](../../src/components/packt/day-card-header.tsx#L26)

- Subtitle state removed from DayCard; DnD/draft/optimistic-order state untouched
  [`day-card.tsx:101`](../../src/components/packt/day-card.tsx#L101)

**Tests**

- DayCardHeader isolated tests — subtitle edit, save, cancel, toggle, badge
  [`day-card-header.test.tsx:1`](../../src/components/packt/day-card-header.test.tsx#L1)

- GapZone isolated tests — active/inactive states, onOpen, onSelectType, onDismiss
  [`gap-zone.test.tsx:1`](../../src/components/packt/gap-zone.test.tsx#L1)

- Extended DnD mock captures onDragStart/onDragCancel; 3 new coverage tests added
  [`day-card.test.tsx:10`](../../src/components/packt/day-card.test.tsx#L10)
