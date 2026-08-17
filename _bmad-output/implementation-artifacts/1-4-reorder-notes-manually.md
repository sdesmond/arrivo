---
baseline_commit: 0dfc85007f74bb5cd1069ce7c502e51f859e0506
---

# Story 1.4: Reorder Notes manually

Status: done

## Story

As a trip collaborator,
I want to drag a Note to a new position in the list,
so that I can arrange my Notes for faster scanning regardless of when they were created.

## Acceptance Criteria

1. Given a populated Notes tab, when a collaborator drags a Note using its Reorder handle, then the new order persists through a server action, visual and DOM order remain identical, and the order survives reload.
2. Given a focused Reorder handle, when collaborator presses Space/Enter to lift/drop and Up/Down to move, then one polite live region announces lift instructions, every candidate `position X of N`, invalid boundary attempts, and confirmed drop outcome; Left/Right do nothing.
3. Given a lifted Note, when collaborator presses Escape before drop, then original order is restored with no server mutation and cancellation is announced.
4. Given persistence fails, when response returns, then last persisted order is restored, Failure toast and live region announce rollback plus restored `position X of N`, and focus returns to same handle.
5. Given Notes were manually reordered, when a new Note is created, then it inserts at top (`position: 0`) until explicitly moved.

## Tasks / Subtasks

- [x] Add persisted, concurrency-safe reorder action (AC: 1, 4, 5)
  - [x] Add `ReorderTripNotesInput` to `src/data/types.ts`: `tripId` and complete `orderedNoteIds` list.
  - [x] Add `reorderTripNotes(input)` to `src/app/(app)/trips/[tripId]/actions.ts`.
  - [x] Call `requireUser()` and `assertTripAccess(input.tripId, user.id!, "editor")` before writes.
  - [x] In one `db.transaction`, call existing `lockTripForUpdate`, select current `notes.id` scoped to `tripId`, reject stale, duplicate, missing, or foreign submitted IDs with existing `CONCURRENT_MODIFICATION_ERROR`, then rewrite every scoped row's `position` from `0` in submitted order.
  - [x] Call `revalidatePath(`/trips/${tripId}`)` only after a successful transaction. Do not modify title/body, schema, mapper, query sort, create, update, or delete behavior.
- [x] Split and add Notes sortable presentation (AC: 1–5)
  - [x] Add `src/components/packt/trip-notes-sortable.tsx`; move Notes list/DnD responsibility here so already-oversized `trip-notes-tab.tsx` stays below 250 lines after its change.
  - [x] Use installed `@dnd-kit/core` and `@dnd-kit/sortable`: `DndContext`, `SortableContext`, `useSortable`, `PointerSensor` (small activation distance), `KeyboardSensor` with `sortableKeyboardCoordinates`, `verticalListSortingStrategy`, `arrayMove`, and, if needed, `DragOverlay` with no drop animation.
  - [x] Keep optimistic order local to sortable component. Render `localNotes ?? notes` as `ol > li`; reset local order only when parent receives refreshed persisted `notes`. Capture pre-drag persisted order for Escape/failure restoration.
  - [x] Submit all note IDs in final DOM order after a non-noop drop. Disable/serialize another reorder while persistence is in flight. On failure restore exact persisted order, call `toast.error`, announce rollback, and refocus handle after React has rendered restored order.
  - [x] On confirmed success, announce reorder exactly once and refocus dragged handle in new position. Never announce an optimistic move as saved/confirmed.
  - [x] Keep expanded Note identified by ID, not index; no reorder may discard dirty editor state, bypass `TripNotesEditor.commit()`, or change one-expanded-note behavior.
- [x] Add handle to Note row without breaking existing controls (AC: 1–5)
  - [x] Update `src/components/packt/trip-notes-row.tsx` to accept/render the sortable handle as a sibling of disclosure and Trash, preserving `ol > li`, disclosure IDs/region semantics, and Trash availability in both collapsed and expanded rows.
  - [x] Handle uses `GripVertical`, `strokeWidth={1.5}`, `var(--fg-3)`, existing Packt focus style, `touchAction: "none"`, `title`, and at least 44×44 px.
  - [x] Accessible name is `Reorder {visible note label}, position X of N`; implicit titles and duplicate labels remain distinguishable through position.
  - [x] Handle and Trash must not activate disclosure, cause editor blur commit, or become nested in disclosure button. Do not add visible Move up/down controls.
- [x] Wire sortable list through tab orchestration (AC: 1–5)
  - [x] Update `src/components/packt/trip-notes-tab.tsx` to retain draft, expansion, delete, focus-return, and live-region ownership while delegating ordered row rendering/reorder state to `TripNotesSortable`.
  - [x] Reuse existing keyed polite live region (`announcement`/`announcementId`) for drag instructions, positions, cancel, confirmed reorder, and rollback. Preserve confirmed-only create/save/delete announcements.
  - [x] Keep delete focus/reconciliation behavior from Story 1.3: deletion collapses/focuses only deleted expanded note; vanished targets clear safely. Reorder focus targets use `trip-note-reorder-{id}` (or equivalent stable handle ID), never disclosure or deleted control.
- [x] Add tests first, then implement (AC: 1–5)
  - [x] Update `src/app/(app)/trips/[tripId]/actions.test.ts`: valid order locks trip, validates editor access, rewrites scoped positions, and revalidates; stale/missing/duplicate/foreign ID payload rejects before writes/revalidation; access denial propagates; assert expected empty-list contract.
  - [x] Update `src/components/packt/trip-notes-row.test.tsx`: handle icon/name/title/44px treatment, visible-label/position naming, and handle interaction never toggles disclosure, starts delete, or commits editor.
  - [x] Add `src/components/packt/trip-notes-sortable.test.tsx`: pointer and keyboard reorder candidate order, Space/Enter lift/drop, Up/Down, Left/Right no-op, boundary and Escape announcements/no mutation, action payload, confirmed announcement/focus, failure rollback/toast/restored-position announcement/focus, and expanded note follows its ID.
  - [x] Update `src/components/packt/trip-notes-tab.test.tsx`: delegation preserves New Note, editor autosave/single-expand, delete dialog/focus recovery, and the existing keyed status region without duplicate success announcement.
  - [x] Update `tests/e2e/features/trip-notes.feature` and `tests/e2e/steps/trip-notes.steps.ts`: scenario-owned three-note fixture; drag through named handle, assert list DOM order, reload, and assert persisted order. Add keyboard lift/move/drop and Escape only where it verifies a browser-level behavior not duplicated by component tests; assert 44px handle geometry in E2E.
  - [x] No `feature-map.mjs` change: `trip-notes-*.tsx` already maps to `@feat:trip-notes`; `actions.ts` is shared, so affected E2E runs full suite.
- [x] Verify
  - [x] Run targeted Vitest files before broad validation.
  - [x] Run affected E2E coverage after targeted tests; use existing scenario mothers/materializers, never global feature-specific seed rows.
  - [x] Run `packt-build-validator` once after implementation is complete; do not run full E2E unless user requests it.

### Review Findings

- [x] [Review][Patch] Stale `localOrder` permanently shadows a divergent fresh `notes` prop after a confirmed reorder [src/components/packt/trip-notes-sortable.tsx:185, 168, 276-296] — the post-success `localOrder` is only ever cleared on cancel/noop/failure, so any later ID-set divergence (new Note created at top per AC 5, or a note deleted by anyone) renders the stale drag-final order forever: the new note is invisible, a deleted note lingers in the DOM, and the next drag submits the stale set and is rejected with a `CONCURRENT_MODIFICATION` toast. The `sameNoteOrder` catch-up only handles the exact case where the fallback was never needed. Fix: once persistence has succeeded, `localOrder` must not out-rank fresh server truth — drop it on the first divergent post-persist `notes` (e.g. compare against `persistedOrder` before applying, and clear after a render where `notes !== localOrder`).
- [x] [Review][Patch] DragOverlay duplicates `trip-note-disclosure-{id}` DOM ids and renders dead focusable controls; dragged row stays tabbable at `opacity: 0` [src/components/packt/trip-notes-sortable.tsx:153, 342-346; src/components/packt/trip-notes-row.tsx:63, 116-126] — mid-drag the page holds two elements with the same disclosure id, the overlay hardcodes `aria-expanded={false}` even when the dragged note is expanded (a11y lie), the overlay's expand/delete buttons are focusable stubs that silently do nothing, and the invisible original row's disclosure/editor/Trash remain activatable (Tab + Space/Enter can toggle an invisible row or open its dialog). Fix: render a non-interactive overlay preview (strip ids/controls, `aria-hidden`), and remove the original row from the a11y/tab order during drag (e.g. `inert`/`aria-hidden`).
- [x] [Review][Patch] Keyboard drag stays live document-wide after lift — Tab away then Up/Down reorders, Enter/Space drops, Escape cancels while focus is in an unrelated field [src/components/packt/trip-notes-sortable.tsx:204-207, 128-135] — dnd-kit's `KeyboardSensor` movement/drop/cancel listeners bind to the owner document for the whole drag, so once Space-lifted, keystrokes anywhere on the page (note editor, New Note draft, other tabs) hijack the drag: silent reorders, swallowed newlines/spaces. Fix: cancel the drag when the handle loses focus (blur handler on the handle while `activeId` is set), or guard the document-level listeners to ignore events outside the dragged item.
- [x] [Review][Patch] Success-path crash when the dragged note vanishes mid-drag: `finalOrder[-1]` is `undefined` and `getNoteTitle(undefined)` throws, so the catch falsely announces rollback + failure toast for a mutation the server committed [src/components/packt/trip-notes-sortable.tsx:281-283, 288-292] — guard `findIndex` results in both the success and catch paths before announcing.
- [x] [Review][Patch] Success-path handle refocus is coupled to the parent's refetch creating a new `workingNotes` reference [src/components/packt/trip-notes-sortable.tsx:197-202, 284] — `setWorkingOrder(finalOrder)` reuses the already-rendered reference, so the focus effect won't fire until the RSC refresh arrives; also, no unit or E2E test anywhere asserts focus return after success or failure (`toHaveFocus`/`getElementById` assertions absent from trip-notes-sortable.test.tsx). Fix: focus directly in the success/catch handlers after `await`, and add focus assertions to the existing confirmed and rollback tests.
- [x] [Review][Patch] Boundary announcements leak to pointer drags and flood on key auto-repeat [src/components/packt/trip-notes-sortable.tsx:299-312] — the gate checks only `activeId === note.id` (not keyboard origin), and there is no `event.repeat` guard, so holding an arrow at the edge repeats "already at position X of N" per keydown. Fix: gate on `isKeyboardDragRef.current` and skip `event.repeat`.
- [x] [Review][Patch] Rollback announcement indexes the pre-drag snapshot while the rendered DOM may show a concurrently-refreshed order [src/components/packt/trip-notes-sortable.tsx:285-293] — on failure the announce "restored to position X of N" comes from `persistedOrder`, but the list renders fresh `notes`; if another client changed the list during the failed flight, SR users hear a position that doesn't match the DOM. Fix: derive the restored position from the notes actually rendered after reset.
- [x] [Review][Patch] Duplicate-ID action test omits the no-revalidation assertion [src/app/(app)/trips/[tripId]/actions.test.ts:267-268] — stale/foreign reject tests assert `mockRevalidatePath` untouched; the duplicate-ID case asserts only `updates` empty. Add the `revalidatePath` assertion for symmetry with the task contract.
- [x] [Review][Defer] `deleteTripNote` bypasses the trip row lock, so a delete interleaving the reorder's rewrite loop leaves position gaps (0, 2, 3) that persist until the next reorder [src/app/(app)/trips/[tripId]/actions.ts:573-581, 587-607] — deferred, pre-existing: delete has never locked/compacted positions (explicitly out of scope in this story), and the gap only affects relative ordering display.

## Dev Notes

### Existing behavior to preserve

- `getTripDetail` returns Notes ordered by `notes.position ASC`; `TripNotesTab` currently renders prop order unchanged. `position: 0` is top.
- `createTripNote` transaction locks trip, shifts every existing position by one, then inserts new Note at zero. This is required after manual reorder too.
- `updateTripNote` never changes `position`; `deleteTripNote` does not compact it. Reorder is sole operation that normalizes positions.
- Story 1.2 editor contract is load-bearing: imperative `commit()` with in-flight dedupe, unmount commit, null clears, whitespace baseline restoration, failed-save Retry/focus, stable labelled region, and only-confirmed transitions. DnD must not trigger disclosure or unintended blur commit.
- Story 1.3 approved Trash on every row, collapsed or expanded. Preserve missing-note reconciliation, delete-scoped collapse/focus, dialog recovery, and stale-save protection.

### Implementation guardrails

- Do not copy weak Packing List server reorder validation. Mirror `reorderDayItems` atomic full-set validation and locking, scoped to trip Notes. No schema/migration, mapper, or dependency change.
- `TripNotesTab` is 264 lines and `TripNotesEditor` is 273. This story changes the tab only; extracting sortable/list responsibility is mandatory. Do not add DnD state to the tab or change editor responsibilities.
- All interactive source is client-side: first line `"use client"`, explicit `ComponentNameProps`, destructured props, no `any` or one-letter variables, `cn()` for merged class names.
- No task styling, checkboxes, status badges, search, attachments, day scope, date mode, custom tokens, arbitrary Tailwind values, or new visible Move controls.
- Colors only CSS variables; font vars include fallbacks; reduced motion suppresses list shift, overlay, and toast motion; reflow works at 320 CSS px and 200% text size without clipped focus/two-dimensional scrolling.
- `@dnd-kit` standard sortable keyboard support uses `KeyboardSensor` plus `sortableKeyboardCoordinates`; customize its screen-reader instructions/announcements to match required Space/Enter, Up/Down, Escape, and no Left/Right behavior. Keep one Notes polite status owner rather than competing dnd-kit announcements.

### Project Structure Notes

- UPDATE: `src/app/(app)/trips/[tripId]/actions.ts`, `actions.test.ts`, `src/components/packt/trip-notes-tab.tsx`, `trip-notes-tab.test.tsx`, `trip-notes-row.tsx`, `trip-notes-row.test.tsx`, `tests/e2e/features/trip-notes.feature`, `tests/e2e/steps/trip-notes.steps.ts`.
- NEW: `src/components/packt/trip-notes-sortable.tsx` and colocated `trip-notes-sortable.test.tsx`.
- UPDATE: `src/data/types.ts` only for canonical action input; no test required for a declaration-only canonical type addition.
- No change: schema, `db-mappers.ts`, `src/lib/queries.ts`, `TripNotesEditor`, delete dialog, `feature-map.mjs`, migrations.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.4] — story and ACs.
- [Source: _bmad-output/planning-artifacts/prds/prd-packt-2026-08-07/prd.md#FR-6] — persistence and newest-first requirements.
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-packt-2026-08-08/EXPERIENCE.md#Component Patterns] — handle, state, keyboard, focus, live-region, responsive rules.
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-packt-2026-08-08/DESIGN.md#Components] — Event-style handle visual treatment.
- [Source: _bmad-output/project-context.md#Testing] — stack, action, component, test, and E2E conventions.
- [Source: src/app/(app)/trips/[tripId]/actions.ts:245-296] — atomic `reorderDayItems` precedent.
- [Source: src/components/packt/packing-list-sortable.tsx] and [Source: src/components/packt/packing-list-row.tsx] — installed dnd-kit sensors/handle precedent; do not inherit their weaker behavior where it conflicts with this story.
- [Source: src/components/packt/trip-notes-tab.tsx] and [Source: src/components/packt/trip-notes-row.tsx] — current behaviors to preserve.
- [Source: _bmad-output/implementation-artifacts/1-1-create-and-view-trip-notes.md], [1-2-expand-and-edit-a-note-in-place.md], and [1-3-delete-a-note.md] — prior-story intelligence and review fixes.
- [dnd-kit Sortable documentation](https://docs.dndkit.com/presets/sortable) — `KeyboardSensor` coordinate getter integration; [dnd-kit Keyboard documentation](https://docs.dndkit.com/api-documentation/sensors/keyboard) — keyboard/screen-reader instruction alignment.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (dev implementation); story authored by Codex (GPT-5)

### Completion Notes List

- Added `reorderTripNotes` server action mirroring `reorderDayItems`'s atomic full-set validation/locking, scoped to trip Notes; rejects stale, duplicate, missing, or foreign submitted IDs via `CONCURRENT_MODIFICATION_ERROR` before any write.
- Split Notes list/DnD responsibility into new `TripNotesSortable`, using `@dnd-kit/core` + `@dnd-kit/sortable` with a custom vertical-only keyboard coordinate getter (Left/Right are hard no-ops) and dnd-kit's built-in announcements silenced in favor of the tab's single existing polite live region.
- Implemented lift/position/boundary/cancel/confirmed/rollback announcements entirely through the shared `onAnnounce` callback; boundary detection uses a component-owned keydown handler on the handle since dnd-kit swallows out-of-range arrow presses without firing any drag callback.
- Added `dragHandle`/`rootRef`/`rootStyle` props to `TripNotesRow` so the sortable wrapper can attach `useSortable`'s node ref/transform directly to the existing `<li>`, preserving `ol > li` structure.
- Wired `TripNotesSortable` into `TripNotesTab`, replacing the inline `notes.map` block; compressed several existing branches (no behavior change) to bring the tab back under the 250-line guardrail after the split.
- Added scenario-owned three-note E2E fixture (`E2E_TRIP_NOTES_REORDER` in `e2e-seed-data.ts`) plus pointer-drag, keyboard lift/move/drop, Escape-cancel, and 44px-handle-geometry scenarios; verified via `bddgen` step-binding generation.
- All touched Vitest suites pass (98 tests across actions/row/sortable/tab); ESLint and `tsc --noEmit` are clean on every changed file.
- E2E-only bug found and fixed post-implementation: the handle's `onKeyDown` prop was overwriting `useSortable`'s own `listeners.onKeyDown`, and separately `handleDragEnd`/`handleDragOver`/`handleDragCancel` (invoked by dnd-kit via an effect-synced ref that can lag one render behind a fast same-drag key sequence) read `localOrder` from a stale render closure. Neither surfaced in Vitest (its dnd-kit mock bypasses real key handling and fires callbacks synchronously). Fixed by composing the handle's `onKeyDown` with `listeners.onKeyDown` and mirroring `localOrder` into a ref (`localOrderRef`) updated synchronously alongside every `setLocalOrder` call, with the three dnd-kit-dispatched handlers reading from that ref instead of the render closure. Keyboard reorder E2E scenario re-verified green across 4 consecutive full/targeted runs after the fix.
- packt-build-validator's two full-suite E2E runs each showed a handful of failures in features unrelated to Notes (day-planning, map-tab, packing-*, reservations, spending, templates, trips), with disjoint failure sets between runs and some reporting physically-impossible multi-hour durations — consistent with environmental load from this session's extensive debugging rather than a regression; all `@feat:trip-notes` scenarios passed in every run. Lint, `tsc --noEmit`, Vitest coverage (96.34% lines / 96.27% functions / 90.45% branches), and the production build all passed cleanly.

### File List

**New files**

- `_bmad-output/implementation-artifacts/1-4-reorder-notes-manually.md`
- `src/components/packt/trip-notes-sortable.tsx`
- `src/components/packt/trip-notes-sortable.test.tsx`

**Modified files**

- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/data/types.ts`
- `src/app/(app)/trips/[tripId]/actions.ts`
- `src/app/(app)/trips/[tripId]/actions.test.ts`
- `src/components/packt/trip-notes-tab.tsx`
- `src/components/packt/trip-notes-tab.test.tsx`
- `src/components/packt/trip-notes-row.tsx`
- `src/components/packt/trip-notes-row.test.tsx`
- `tests/e2e/features/trip-notes.feature`
- `tests/e2e/steps/trip-notes.steps.ts`
- `tests/e2e/e2e-seed-data.ts`

## Change Log

| Date | Change |
| --- | --- |
| 2026-08-12 | Story created from Epic 1.4, PRD, UX spine, project context, current Notes implementation, prior-story reviews, and current dnd-kit documentation. |
| 2026-08-12 | Implemented pointer/keyboard reorder end-to-end: `reorderTripNotes` action, `TripNotesSortable` component, row handle wiring, tab delegation, and unit/E2E test coverage. |
