---
title: "Move packing list controls into overflow menu"
type: "feature"
created: "2026-06-09"
status: "done"
baseline_commit: "4ecf76fae2baf2e090285641fc6548a45e712586"
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** "Pull templates" and "Save as template" are hidden until the list has at least one item, so users opening a fresh list have no way to start from a template. "New section" is rendered as a prominent inline form that visually competes with the "Add item" input.

**Approach:** Replace the existing toolbar buttons and the always-visible section form with a single overflow `⋯` menu on the toolbar. The toolbar is always rendered (no item-count gate). The overflow menu holds Pull templates (always), New section (always), and Save as template (only when items exist). Clicking "New section" in the menu reveals the section add form inline below the toolbar.

## Boundaries & Constraints

**Always:**
- Overflow menu uses the existing `DropdownMenu` / `DropdownMenuItem` primitives from `src/components/ui/dropdown-menu.tsx`
- Progress counter ("X of Y packed") remains on the toolbar left side; hide it when `itemCount === 0`
- "Save as template" must stay hidden in the menu when `itemCount === 0` (nothing to save)
- The section add form (`ContextualAddForm isLabel`) is revealed only after "New section" is clicked; it is not visible by default
- After the section form submits successfully, close the form (reset visibility)
- The `⋯` overflow trigger button must have `title="List options"` and `aria-label="List options"`
- When the section add form appears, focus must move to its input (pass `autoFocus` to the input inside the form, or use a ref to call `.focus()` after mount)
- Keyboard behavior (arrow-key navigation, Escape to close, focus return to trigger) is inherited from Base UI's Menu primitive — no additional handling needed

**Ask First:**
- Any change to where template dialogs are triggered (they remain triggered via `dialogsRef` in `PackingListView` — do not move dialog state)

**Never:**
- Do not add a separate empty-state card or illustration for the list-level empty state — the minimal UI (just the toolbar + "Add item" form) is intentional
- Do not duplicate the overflow menu on `packing-lists-view.tsx` (trip-level list picker) — scope is the individual list view only

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Empty list | `items = []`, `onPullTemplates` provided | Toolbar renders with `⋯` button; no progress counter; "Pull templates" visible in menu | — |
| Empty list, save | `items = []`, `onSaveAsTemplate` provided | "Save as template" NOT in overflow menu | — |
| Non-empty list | `items.length > 0` | Progress counter shows; overflow menu has Pull templates, New section, Save as template | — |
| New section click | User opens `⋯`, clicks "New section" | Section add form appears below toolbar | — |
| Section submit | User submits section form | Form hides after successful add | Failure retains form open (ContextualAddForm already handles value retention) |
| No template props | `onPullTemplates` and `onSaveAsTemplate` both undefined | Overflow menu still renders with "New section" only | — |

</frozen-after-approval>

## Code Map

- `src/components/packt/packing-list-toolbar.tsx` — toolbar component; gains `onOpenNewSection` prop, replaces explicit buttons with `DropdownMenu` overflow
- `src/components/packt/packing-list-view.tsx` — orchestrates list view; removes item-count gate on toolbar, removes always-visible section form, adds `showNewSectionForm` state
- `src/components/packt/packing-contextual-add-form.tsx` — section/item add form; no changes needed, used as-is
- `src/components/ui/dropdown-menu.tsx` — existing overflow menu primitives; import `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`
- `src/components/packt/packing-list-toolbar.test.tsx` — unit tests; update for overflow pattern
- `src/components/packt/packing-list-view.test.tsx` — component tests; update for new section-form trigger flow

## Tasks & Acceptance

**Execution:**

- [ ] `src/components/packt/packing-list-toolbar.tsx` — add `onOpenNewSection?: () => void` prop; replace "Save as template" and "Pull templates" buttons with a `⋯` icon button (`title="List options"` `aria-label="List options"`) that opens a `DropdownMenu`; menu items: Pull templates (when `onOpenPullDialog` provided), New section (when `onOpenNewSection` provided), Save as template (when `onOpenSaveDialog` provided AND `itemCount > 0`); hide progress counter when `itemCount === 0`; toolbar is always rendered (no item-count guard here)

- [ ] `src/components/packt/packing-list-view.tsx` — remove `effectiveItems.length > 0` guard around `<PackingListToolbar>`; remove the top-level `<ContextualAddForm placeholder="New section…" isLabel .../>` that was always shown; add `const [showNewSectionForm, setShowNewSectionForm] = useState(false)`; render `<ContextualAddForm isLabel ...>` below the toolbar only when `showNewSectionForm` is true, with the input receiving focus on mount (`autoFocus`), wrapping `onAddItem` to call `setShowNewSectionForm(false)` on success; pass `onOpenNewSection={() => setShowNewSectionForm(true)}` to toolbar

- [ ] `src/components/packt/packing-list-toolbar.test.tsx` — rewrite tests: verify `⋯` button always present; verify overflow menu items appear/are absent per item-count and prop-presence rules; verify `onOpenPullDialog`, `onOpenSaveDialog`, `onOpenNewSection` are called when respective menu items are clicked; verify progress count hidden when `itemCount === 0` and shown when `itemCount > 0`

- [ ] `src/components/packt/packing-list-view.test.tsx` — update "renders minimal empty state" test: `New section…` placeholder is NOT in document by default; add test: clicking `⋯` then "New section" reveals the section form; verify pull dialog accessible when list is empty (click `⋯` → "Pull templates"); remove/update any tests that asserted the section form was always visible

- [ ] `tests/e2e/features/pull-templates.feature` — update the "Empty state does not offer pull from template" scenario: invert it to assert that pull templates IS reachable via the overflow menu on an empty list (open `⋯` → click "Pull templates" → dialog appears); remove the old negative assertion "I should not see a pull templates button"

- [ ] `tests/e2e/steps/pull-templates.steps.ts` — update step implementations that call `page.getByRole("button", { name: "Pull templates" })` to first click the `⋯` overflow button (`aria-label="List options"`) before clicking the menu item

- [ ] `tests/e2e/steps/save-trip-as-template.steps.ts` — update step implementations that call `page.getByRole("button", { name: "Save as template" })` to first click the `⋯` overflow button (`aria-label="List options"`) before clicking the menu item

**Acceptance Criteria:**

- Given a list with no items and `onPullTemplates` provided, when the user opens the `⋯` menu, then "Pull templates" is visible and triggers the pull dialog
- Given a list with no items, when the page renders, then the "New section" input form is not visible
- Given a list with no items and `onSaveAsTemplate` provided, when the user opens the `⋯` menu, then "Save as template" is not present in the menu
- Given a list with items and `onSaveAsTemplate` provided, when the user opens the `⋯` menu, then "Save as template" is present and triggers the save dialog
- Given any list state, when the user opens the `⋯` menu and clicks "New section", then the section add form appears; after successfully submitting a section name, the form closes

## Spec Change Log

## Verification

**Commands:**

- `npm run test:coverage -- --reporter=verbose src/components/packt/packing-list-toolbar src/components/packt/packing-list-view` -- expected: all tests pass, coverage thresholds met
- `npm run build` -- expected: zero type errors, clean build
