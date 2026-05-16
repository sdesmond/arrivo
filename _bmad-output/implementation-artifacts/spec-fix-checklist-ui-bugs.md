---
title: 'Fix checklist expand-arrow overlap and first-enter behavior'
type: 'bugfix'
created: '2026-05-15'
status: 'in-review'
baseline_commit: 'ca0a7f46bee17d800ce3e01df67fe5cda37b314d'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Two checklist bugs degrade usability: (1) the expand/collapse chevron is visually covered by the absolute-positioned trash icon on hover, and (2) typing a first item then pressing Enter in a newly added checklist collapses the list without saving the item — only subsequent Enter presses behave correctly.

**Approach:** Fix the chevron overlap with right-padding on the header button. Fix the first-enter bug by threading `firstItemContent` through the commit callback chain and adding a combined server action; track the newly created checklist ID to keep it expanded after commit.

## Boundaries & Constraints

**Always:**
- All colors via CSS custom properties only — no hardcoded hex/rgb.
- No arbitrary Tailwind values — use inline styles for values not on the scale.
- `onCommitDraft` signature change must be backward-compatible in `day-card.tsx` (optional param).
- New server action must call `requireUser()` and `assertTripAccess()` before any write.
- Call `revalidatePath` after every mutation.

**Ask First:**
- If the combined server action (`createChecklistWithItem`) causes any unexpected type errors in the DB mapper layer.

**Never:**
- Do not change drag-and-drop behavior or add `SortableChecklistItem` — that is deferred.
- Do not alter checklist item ordering or position logic beyond what's needed to commit a first item.
- Do not add the checklist title to the commit flow — title is optional and edited separately.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Hover on checklist header | Mouse enters non-draft checklist | Trash icon appears; chevron remains fully visible and not obscured | — |
| First Enter with content (draft) | New checklist in draft mode, user types "Buy sunscreen", presses Enter | Checklist committed, item saved, list stays expanded showing the item, input ready for next item | — |
| First Enter empty (draft) | Draft mode, input empty, Enter pressed | Draft cancelled, checklist removed | — |
| Blur away (draft, has content) | Focus leaves checklist wrapper while `isDraft=true` with typed content | Same as first Enter with content — commit + save item | — |
| Blur away (draft, no content) | Focus leaves with empty input | Cancel draft | — |
| Subsequent Enter after first | Existing non-draft checklist, user types and presses Enter | Item added, input cleared, list stays expanded — existing behavior unchanged | — |

</frozen-after-approval>

## Code Map

- `src/components/packt/checklist-item.tsx` — component with both bugs; `handleItemKeyDown`, `handleWrapperBlur`, header button className, `onCommitDraft` prop type
- `src/components/packt/day-card.tsx` — renders draft `ChecklistItem`; owns `onCommitDraft` callback; passes `onAddChecklist`
- `src/app/(app)/trips/[tripId]/page-client.tsx` — wires `handleAddChecklist`; will track `newlyCreatedChecklistId`
- `src/app/(app)/trips/[tripId]/actions.ts` — server actions; needs new `createChecklistWithItem`
- `src/components/packt/checklist-item.test.tsx` — unit tests; must cover both fixed behaviors
- `src/components/packt/day-card.test.tsx` — update if `DayCardProps` signature changes

## Tasks & Acceptance

**Execution:**

- [x] `src/app/(app)/trips/[tripId]/actions.ts` -- Add `createChecklistWithItem(dayId: string, position: number, firstItemContent: string): Promise<string>` that calls `shiftItemsAtOrAbove`, inserts the checklist, inserts the item, revalidates, and returns the new checklist ID. Auth checks required.

- [x] `src/app/(app)/trips/[tripId]/page-client.tsx` -- Add `newlyCreatedChecklistId` state (`string | null`). Update `handleAddChecklist` to accept optional `firstItemContent?: string`; when present call `createChecklistWithItem` and store the returned ID in state; when absent call existing `createChecklist`. Pass `newlyCreatedChecklistId` down to `DayCard` as a new prop. Clear it after a short delay (e.g. via `setTimeout` in the transition callback) or on any subsequent interaction.

- [x] `src/components/packt/day-card.tsx` -- Add `newlyCreatedChecklistId?: string` to `DayCardProps`. Update `onAddChecklist` prop type to `(dayNumber: number, insertAtPosition: number, firstItemContent?: string) => void`. In the draft `ChecklistItem`'s `onCommitDraft`, receive `firstItemContent` and forward it to `onAddChecklist`. Pass `initiallyExpanded={checklist.id === newlyCreatedChecklistId}` when rendering real `ChecklistItem` entries.

- [x] `src/components/packt/checklist-item.tsx` -- **Bug 1:** Add `pr-9` to the header `<button>` className when `!isDraft` (use `cn()`) so the chevron clears the absolute trash button. **Bug 3:** Change `onCommitDraft` prop to `onCommitDraft?: (firstItemContent?: string) => void`. Add `initiallyExpanded?: boolean` prop; change `useState(!!isDraft)` to `useState(initiallyExpanded ?? !!isDraft)`. In `handleItemKeyDown` when `isDraft && trimmed`: call `onCommitDraft?.(trimmed)`. In `handleWrapperBlur` when `isDraft && trimmed`: call `onCommitDraft?.(trimmed)`.

- [x] `src/components/packt/checklist-item.test.tsx` -- Add tests: (a) chevron not covered by trash on hover (verify `pr-9` class present when `!isDraft`); (b) Enter with content in draft mode calls `onCommitDraft` with the typed string; (c) blur with content in draft mode calls `onCommitDraft` with content; (d) Enter with empty input in draft calls `onCancelDraft`; (e) `initiallyExpanded` prop causes list to start expanded even when `isDraft` is false.

**Acceptance Criteria:**

- Given a non-draft checklist on desktop, when hovering the row, then the trash icon is visible and the chevron arrow is not obscured by it.
- Given a newly added checklist in draft mode with text typed in the item input, when Enter is pressed, then the checklist is saved, the first item appears in the list, and the list remains expanded.
- Given a newly added checklist in draft mode with text typed, when focus moves away from the checklist, then the same commit-with-item behavior fires (not cancel).
- Given a newly added checklist in draft mode with an empty item input, when Enter is pressed, then the draft is cancelled and the checklist is removed.
- Given an existing non-draft checklist, when the user types in the add-item input and presses Enter, then the existing add-item behavior is unchanged.

## Design Notes

`createChecklistWithItem` should insert both rows in a single DB transaction to avoid a partial state where the checklist exists but the item doesn't. Use Drizzle's transaction API if available, or at minimum ensure both inserts happen before `revalidatePath`.

The `newlyCreatedChecklistId` in `page-client.tsx` is intentionally ephemeral — its only job is to tell the freshly mounted `ChecklistItem` to start expanded. Clear it after ~1 second or on the next user action to avoid stale expansion state if the user collapses and re-adds at the same position.

## Verification

**Commands:**
- `npm test` -- expected: all unit tests pass including new checklist-item cases
- `npm run build` -- expected: zero type errors, zero lint errors

**Manual checks:**
- Add a checklist, type "first item", press Enter: list stays expanded, item appears, cursor in input for second item.
- Hover a non-draft checklist: trash icon visible, chevron visible beside it (not hidden behind trash).
