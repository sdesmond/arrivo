---
title: "Packing List UX Simplification"
type: "feature"
created: "2026-06-06"
status: "draft"
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The packing list has a heavy empty-state card, a redundant "Ungrouped" heading, and an "Add label" button buried at the bottom of the form — all of which add visual noise and make the entry hierarchy harder to read.

**Approach:** Remove the empty-state card (the ContextualAddForm already visible at the bottom of the ungrouped section serves as a natural, minimal empty state); remove the "Ungrouped" h3 heading (indentation and contextual placeholder text already indicate grouping); rename "Add label" to "Add Section" and move it to a fixed position at the top of the list. Apply the same changes to the template editor view for consistency.

## Boundaries & Constraints

**Always:**
- `ContextualAddForm` must stay self-contained with local value state; no shared `draftName` wired from the parent
- "Add Section" form at the top still participates in the parent's `isSubmitting`/`isAdding` gate so concurrent adds are blocked
- Lucide icons: always `strokeWidth={1.5}`; submit button uses `Plus` icon; update `title`/`aria-label` to `"Add section here"` when `isLabel=true` and `"Add item here"` when `isLabel=false`
- All CSS colors via CSS custom properties; no hardcoded hex/rgb
- No arbitrary Tailwind values

**Ask First:**
- None — all design decisions are sufficiently specified

**Never:**
- Do not add a dialog or modal for naming a new section — the inline form pattern matches existing ContextualAddForm UX
- Do not change drag-and-drop behavior or section collapse logic
- Do not touch the toolbar (Save as template / Pull templates) logic — keep it conditional on `effectiveItems.length > 0`
- Do not apply these changes to `DroppablePackingSection` or `PackingRow`
- Do not change the DB position/ordering logic

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Empty list | 0 items, no sections | "Add Section" input at top; "Add item…" ContextualAddForm rendered inside sortable (ungrouped, no items) | N/A |
| List with only ungrouped items | items exist, 0 sections | "Add Section" at top; items rendered; no "Ungrouped" heading visible | N/A |
| List with sections + ungrouped | sections and ungrouped items | "Add Section" at top; sections with indented items; ungrouped items below with no heading | N/A |
| Add section while add in progress | `isSubmitting=true` | "Add Section" form input disabled | N/A |
| Submit "Add Section" form | Non-empty text, `isSubmitting=false` | Calls `handleContextualAdd(name, true)`; form clears and refocuses | Error: retain value, re-enable |

</frozen-after-approval>

## Code Map

- `src/components/packt/packing-contextual-add-form.tsx` -- Add `isLabel?: boolean` prop; thread through to `onAddItem` and to button `title`/`aria-label`
- `src/components/packt/packing-list-sortable.tsx` -- Remove "Ungrouped" h3; change `showUngrouped`; extract sections loop to `PackingSections` sub-component to bring under ~250 lines; pass `itemCount` and `packedCount` to section label `PackingRow`
- `src/components/packt/packing-list-view.tsx` -- Remove empty-state branch; add "Add Section" ContextualAddForm; extract dialog management to bring under ~250 lines; compute non-label `itemCount`/`packedCount` and pass to toolbar
- `src/components/packt/packing-list-dialogs.tsx` -- New: extracted dialog orchestration (created during the split step)
- `src/components/packt/packing-list-toolbar.tsx` -- Add `packedCount: number` prop; change display from `N items` to `N of M packed`
- `src/components/packt/packing-list-row.tsx` -- Add `itemCount?: number` and `packedCount?: number` to `PackingRowProps`; replace static "Section label" subtitle with `N of M packed` (when `packedCount` provided) or `N items` (otherwise)
- `src/components/packt/template-editor-view.tsx` -- Remove empty-state card and `TemplateEntryForm`; add "Add Section" ContextualAddForm; always render sortable
- `src/components/packt/packing-entry-form.tsx` -- Delete (no longer used)
- `src/components/packt/packing-list-empty-state.tsx` -- Delete (no longer used)
- `src/components/packt/packing-contextual-add-form.test.tsx` -- Exists; update to cover `isLabel=true` path including button label
- `src/components/packt/packing-list-sortable.test.tsx` -- Exists; remove "Ungrouped" heading assertion; add test for ContextualAddForm presence when items is empty and `onAddItem` provided
- `src/components/packt/packing-list-toolbar.test.tsx` -- New: covers packed progress display and button interactions
- `src/components/packt/packing-list-row.test.tsx` -- Exists; replace "Section label" subtitle assertions with `itemCount`/`packedCount` display cases
- `src/components/packt/packing-list-view.test.tsx` -- Exists; remove empty-state card assertions; assert "New section…" input always present; update structure
- `src/components/packt/template-editor-view.test.tsx` -- Exists; same updates as packing-list-view tests
- `src/components/packt/packing-entry-form.test.tsx` -- Delete (component deleted)
- `tests/e2e/features/packing-tab.feature` -- Update empty-state scenario to assert new minimal state
- `tests/e2e/steps/packing-tab.steps.ts` -- Update `openPackingTab`, empty-state step, `I add a packing item`, `I add a packing label named` steps
- `tests/e2e/steps/template-items.steps.ts` -- Update `I add the template item` and `I add the template label` steps

## Tasks & Acceptance

**Execution:**

- [ ] `src/components/packt/packing-contextual-add-form.tsx` -- Add `isLabel?: boolean` to `ContextualAddFormProps`; pass to `onAddItem` (replace hardcoded `false`); update submit button `title` and `aria-label` to `"Add section here"` when `isLabel=true`, `"Add item here"` otherwise
- [ ] `src/components/packt/packing-contextual-add-form.test.tsx` -- Add tests: (1) when `isLabel=true`, submit calls `onAddItem` with `isLabel=true`; (2) submit button has `title="Add section here"` when `isLabel=true` and `title="Add item here"` when `isLabel=false`
- [ ] `src/components/packt/packing-list-sortable.tsx` -- Extract the `sections.map(...)` render block into a `PackingSections` sub-component in the same file (brings file under ~250 lines); remove the `h3` "Ungrouped" heading; change `showUngrouped` to `ungroupedItems.length > 0 || sections.length > 0 || !!onAddItem`
- [ ] `src/components/packt/packing-list-sortable.test.tsx` -- Remove assertion for "Ungrouped" heading; add test that ContextualAddForm renders when items is empty and `onAddItem` is provided
- [ ] `src/components/packt/packing-list-view.tsx` and `src/components/packt/packing-list-dialogs.tsx` -- Extract dialog orchestration (TemplatePullDialog, SaveAsTemplateDialog, DeletePackingSectionAlertDialog) and their state/handlers into `PackingListDialogs` component; this split must happen before or alongside the feature work so packing-list-view.tsx ends under ~250 lines
- [ ] `src/components/packt/packing-list-view.tsx` -- Replace the `effectiveItems.length === 0 ? <PackingListEmptyState> : <>...</>` branch with: (1) toolbar conditional on `effectiveItems.length > 0`, (2) `ContextualAddForm` with `placeholder="New section…"`, `isLabel={true}`, `isAdding={isSubmitting}`, `onAddItem={handleContextualAdd}`, (3) `PackingListSortable` always rendered; remove imports of `PackingEntryForm` and `PackingListEmptyState`; remove `draftName`, `handleDraftNameChange`, `submitEntry`
- [ ] `src/components/packt/packing-list-view.test.tsx` -- Remove empty-state card assertions; assert "New section…" placeholder input always present; assert no "Ungrouped" heading; assert empty list shows "Add item…" ContextualAddForm
- [ ] `src/components/packt/template-editor-view.tsx` -- Remove `items.length === 0 ? <section>...</section> : <>...</>` branch; remove local `TemplateEntryForm` component; add `ContextualAddForm` with `isLabel={true}`, `placeholder="New section…"`, `isAdding={isAdding}`, `onAddItem={(text) => onAddItem(text, true)}`; always render `PackingListSortable`; remove `draftText`, `setDraftText`, `submitEntry`
- [ ] `src/components/packt/template-editor-view.test.tsx` -- Remove empty-state card assertions; assert "New section…" input always present; remove any "Ungrouped" heading assertions
- [ ] `src/components/packt/packing-entry-form.tsx` -- Delete file
- [ ] `src/components/packt/packing-entry-form.test.tsx` -- Delete file
- [ ] `src/components/packt/packing-list-empty-state.tsx` -- Delete file
- [ ] `tests/e2e/features/packing-tab.feature` -- Update the "Empty packing state shows a prompt to start" scenario: replace `Then I should see the empty packing state` with assertions that the `New section…` input and the `Add item…` input are visible, and the old `"Your packing list is empty"` heading is absent
- [ ] `tests/e2e/steps/packing-tab.steps.ts` -- (1) In `openPackingTab`, replace `getByRole("button", { name: "Add item", exact: true })` with `getByPlaceholder("New section…")`; (2) Update `When("I add a packing item named …")` to fill the `Add item…` ContextualAddForm placeholder and press Enter (or click its submit button); (3) Update `When("I add a packing label named …")` to fill the `New section…` placeholder and submit; (4) Update `Then("I should see the empty packing state")` to match the new minimal state
- [ ] `tests/e2e/steps/template-items.steps.ts` -- Update `When("I add the template item …")` to use the `Add item…` ContextualAddForm inside the sortable; update `When("I add the template label …")` to fill the `New section…` placeholder and submit; remove all references to `"Template item text"` label and `"Add label"`/`"Add item"` buttons

**Packing progress indicators (post-approval additions):**

- [x] `src/components/packt/packing-list-row.tsx` -- Add `itemCount?: number` and `packedCount?: number` to `PackingRowProps`; replace static "Section label" `<p>` subtitle with: `N of M packed` when `packedCount` is provided, `N items`/`1 item` when only `itemCount` is provided, nothing when neither is provided
- [x] `src/components/packt/packing-list-sortable.tsx` -- In `PackingSections`, pass `itemCount={section.items.length}` and `packedCount={onToggleItem ? section.items.filter(item => item.done).length : undefined}` to the label `PackingRow`; template editor (no `onToggleItem`) keeps plain item count, trip packing list shows packed progress
- [x] `src/components/packt/packing-list-toolbar.tsx` -- Add `packedCount: number` prop (required); change display from `N items` to `N of M packed`; `itemCount` now counts only non-label items (computed in parent)
- [x] `src/components/packt/packing-list-view.tsx` -- Compute `itemCount = effectiveItems.filter(item => !item.isLabel).length` and `packedCount = effectiveItems.filter(item => !item.isLabel && item.done).length`; pass both to `PackingListToolbar`
- [x] `src/components/packt/packing-list-toolbar.test.tsx` -- New file; covers `N of M packed` display, 0-packed, all-packed, button presence/callbacks
- [x] `src/components/packt/packing-list-row.test.tsx` -- Replace "Section label" subtitle tests with: `itemCount`-only shows `N items`/`1 item`; `packedCount` provided shows `N of M packed`; neither shows nothing; collapse-click test updated to use progress subtitle as click target

**Acceptance Criteria:**

- Given the packing list has zero items, when the list renders, then a "New section…" input appears at the top and an "Add item…" inline input appears in the body (no empty-state card with heading text)
- Given the packing list has items with at least one section and ungrouped items, when the list renders, then no "Ungrouped" heading is visible
- Given the packing list has any state, when the list renders, then the "New section…" input is always visible above the item list
- Given the user types a name in the "New section…" input and submits, when the request completes, then a new section label is added and the input clears and refocuses
- Given an add operation is in progress, when the "New section…" input is shown, then it is disabled
- Given the template editor has zero items, when the editor renders, then a "New section…" input appears and an "Add item…" inline input appears (no empty-state card)
- Given the packing-list-view.tsx and template-editor-view.tsx are updated, then `PackingEntryForm`, `PackingListEmptyState`, and `TemplateEntryForm` are no longer referenced anywhere in the app source
- Given a section label has N items and M are packed, when the list renders, then the section header subtitle reads "M of N packed" on the trip packing list and "N items" on the template editor
- Given the packing tab toolbar is visible, when the list renders, then it displays "M of N packed" where N is the count of non-label items and M is the count of done non-label items

### Review Findings

**2026-06-06 — code review (bmad-code-review)**

- [x] [Review][Patch] Unused `error` parameter in catch block [packing-list-view.tsx:1176] — `catch (error)` captures but never uses the error parameter. Was previously `catch { }` with no parameter. Fix: remove the `error` binding. _dismissed — `error` IS used by `throw error` on the next line_
- [x] [Review][Patch] Fix `beforeItemId` logic for ungrouped items when sections exist [packing-list-sortable.tsx:335] — fixed
- [x] [Review][Patch] HandleContextualAdd re-throws after catch — dead code path [packing-list-view.tsx:1179, packing-contextual-add-form.tsx:59-61] — fixed
- [x] [Review][Patch] Fix typo "the the" → "the" [backlog/backlog.md:9] — fixed
- [x] [Review][Defer] Template editor `isAdding` stuck-true hazard [template-editor-view.tsx] — The template editor relies entirely on the parent's `isAdding` prop; if the parent forgets to reset it on failure, the form stays disabled. Pre-existing pattern, not introduced by this change. _deferred, pre-existing_
- [x] [Review][Patch] Restore `beforeItemId` for empty ungrouped adds [src/components/packt/packing-list-sortable.tsx:335] — _dismissed — current intent is for ungrouped items to remain at the bottom of the rendered list; this does not need a production-code change_
- [x] [Review][Patch] Re-throw contextual add failures so the add form retains its value on error [src/components/packt/packing-list-view.tsx:126] — fixed

## Spec Change Log

**2026-06-06 — packt-plan-reviewer pass (pre-approval):**
- **A11y BLOCKING**: Fixed icon contradiction (Tag vs Plus) in Boundaries & Constraints; added `title`/`aria-label` context-switch (`"Add section here"` vs `"Add item here"`) to ContextualAddForm task and test task.
- **Component BLOCKING x2**: Added split tasks — extract `PackingSections` from `packing-list-sortable.tsx` (303 lines → ~245); extract `PackingListDialogs` from `packing-list-view.tsx` (386 lines → ~245 post-feature).
- **Test BLOCKING x3**: Added E2E tasks for `packing-tab.feature`, `packing-tab.steps.ts` (openPackingTab helper + item/label add steps + empty-state step all break), `template-items.steps.ts` (item/label add steps use deleted TemplateEntryForm locators).
- **Scope WARNING**: `template-editor-view.tsx` changes extend beyond the "Trip packing list" backlog section. Frozen intent kept as-is — confirm with Spencer at approval that template parity is intentional.

**2026-06-06 — post-implementation additions (packing progress indicators):**
- Replaced static "Section label" subtitle in `PackingRow` with dynamic `itemCount`/`packedCount` props; section headers on the trip packing list now read "M of N packed"; template editor shows "N items" (no `onToggleItem` → no `packedCount` passed).
- `PackingListToolbar` extended with required `packedCount` prop; top-of-tab count changed from `N items` to `M of N packed`; `itemCount` now excludes label items (computed in `packing-list-view.tsx`).
- New `packing-list-toolbar.test.tsx` created; `packing-list-row.test.tsx` updated to cover new subtitle variants.

## Design Notes

The `ContextualAddForm` reuse for "Add Section" requires only adding `isLabel?: boolean` to its props and threading it through to the `onAddItem` call. No new component is needed. The submit button keeps the `Plus` icon from `ContextualAddForm` — the placeholder text ("New section…") is enough to distinguish intent.

For `packing-list-view.tsx`, the `handleContextualAdd` function already accepts `(name, isLabel?, afterItemId?, beforeItemId?, labelId?)`, so the "Add Section" form at the top can use it directly with `isLabel=true` and no position args (section appends to end by default).

## Verification

**Commands:**

- `npm run test:coverage` -- expected: all suites pass, coverage thresholds maintained
- `npm run build` -- expected: clean TypeScript compilation, no unused import errors

**Manual checks (if no CLI):**

- Open trip packing list with no items: only "New section…" and "Add item…" inputs visible, no empty-state card
- Open trip packing list with sections + ungrouped items: no "Ungrouped" heading
- Type in "New section…" and submit: section label added, input clears
- Open template editor with no items: same minimal layout
- Open trip packing list with items: toolbar reads "M of N packed"; section headers read "M of N packed"
- Check an item: toolbar and section header counts update immediately
- Open template editor with sections: section headers read "N items" (no packed progress in templates)
