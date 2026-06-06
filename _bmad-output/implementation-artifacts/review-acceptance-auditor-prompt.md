# Acceptance Auditor — Code Review Prompt

You are an **Acceptance Auditor**. Review this diff against the spec and context docs.

## Instructions

Check for:
- Violations of acceptance criteria
- Deviations from spec intent
- Missing implementation of specified behavior
- Contradictions between spec constraints and actual code
- Incomplete or incorrect test coverage per spec requirements

**Output findings as a Markdown list.** Each finding: one-line title, which AC/constraint it violates, evidence from the diff or spec.

## Diff Content

The full diff is at `C:\Users\spenc\dev\packt\_bmad-output\implementation-artifacts\review-diff-packing-list-ux.txt`

**Diff stats:** 18 files changed, +340/-772 insertions/deletions, plus 2 untracked new files.

## Spec File

The spec is at `C:\Users\spenc\dev\packt\_bmad-output\implementation-artifacts\spec-packing-list-ux-simplification.md`

Full content:

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
- ContextualAddForm must stay self-contained with local value state; no shared draftName wired from the parent
- "Add Section" form at the top still participates in the parent's isSubmitting/isAdding gate so concurrent adds are blocked
- Lucide icons: always strokeWidth={1.5}; submit button uses Plus icon; update title/aria-label to "Add section here" when isLabel=true and "Add item here" when isLabel=false
- All CSS colors via CSS custom properties; no hardcoded hex/rgb
- No arbitrary Tailwind values

**Never:**
- Do not add a dialog or modal for naming a new section — the inline form pattern matches existing ContextualAddForm UX
- Do not change drag-and-drop behavior or section collapse logic
- Do not touch the toolbar (Save as template / Pull templates) logic — keep it conditional on effectiveItems.length > 0
- Do not apply these changes to DroppablePackingSection or PackingRow
- Do not change the DB position/ordering logic

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Empty list | 0 items, no sections | "Add Section" input at top; "Add item…" ContextualAddForm rendered inside sortable (ungrouped, no items) | N/A |
| List with only ungrouped items | items exist, 0 sections | "Add Section" at top; items rendered; no "Ungrouped" heading visible | N/A |
| List with sections + ungrouped | sections and ungrouped items | "Add Section" at top; sections with indented items; ungrouped items below with no heading | N/A |
| Add section while add in progress | isSubmitting=true | "Add Section" form input disabled | N/A |
| Submit "Add Section" form | Non-empty text, isSubmitting=false | Calls handleContextualAdd(name, true); form clears and refocuses | Error: retain value, re-enable |

## Code Map

- src/components/packt/packing-contextual-add-form.tsx -- Add isLabel?: boolean prop; thread through to onAddItem and to button title/aria-label
- src/components/packt/packing-list-sortable.tsx -- Remove "Ungrouped" h3; change showUngrouped; extract sections loop to PackingSections sub-component to bring under ~250 lines; pass itemCount and packedCount to section label PackingRow
- src/components/packt/packing-list-view.tsx -- Remove empty-state branch; add "Add Section" ContextualAddForm; extract dialog management to bring under ~250 lines; compute non-label itemCount/packedCount and pass to toolbar
- src/components/packt/packing-list-dialogs.tsx -- New: extracted dialog orchestration (created during the split step)
- src/components/packt/packing-list-toolbar.tsx -- Add packedCount: number prop; change display from "N items" to "N of M packed"
- src/components/packt/packing-list-row.tsx -- Add itemCount?: number and packedCount?: number to PackingRowProps; replace static "Section label" subtitle with "N of M packed" (when packedCount provided) or "N items" (otherwise)
- src/components/packt/template-editor-view.tsx -- Remove empty-state card and TemplateEntryForm; add "Add Section" ContextualAddForm; always render sortable
- src/components/packt/packing-entry-form.tsx -- Delete (no longer used)
- src/components/packt/packing-list-empty-state.tsx -- Delete (no longer used)

## Acceptance Criteria

1. Given the packing list has zero items, when the list renders, then a "New section…" input appears at the top and an "Add item…" inline input appears in the body (no empty-state card with heading text)
2. Given the packing list has items with at least one section and ungrouped items, when the list renders, then no "Ungrouped" heading is visible
3. Given the packing list has any state, when the list renders, then the "New section…" input is always visible above the item list
4. Given the user types a name in the "New section…" input and submits, when the request completes, then a new section label is added and the input clears and refocuses
5. Given an add operation is in progress, when the "New section…" input is shown, then it is disabled
6. Given the template editor has zero items, when the editor renders, then a "New section…" input appears and an "Add item…" inline input appears (no empty-state card)
7. Given the packing-list-view.tsx and template-editor-view.tsx are updated, then PackingEntryForm, PackingListEmptyState, and TemplateEntryForm are no longer referenced anywhere in the app source
8. Given a section label has N items and M are packed, when the list renders, then the section header subtitle reads "M of N packed" on the trip packing list and "N items" on the template editor
9. Given the packing tab toolbar is visible, when the list renders, then it displays "M of N packed" where N is the count of non-label items and M is the count of done non-label items

## Key Constraints

- ContextualAddForm must stay self-contained with local value state; no shared draftName wired from the parent
- "Add Section" form at the top still participates in the parent's isSubmitting/isAdding gate
- Lucide icons: always strokeWidth={1.5}; submit button uses Plus icon; title/aria-label = "Add section here" when isLabel=true, "Add item here" when isLabel=false
- Do not add a dialog or modal for naming a new section
- Do not change drag-and-drop behavior or section collapse logic
- Do not touch toolbar conditional logic (keep conditional on effectiveItems.length > 0)
- Do not apply changes to DroppablePackingSection or PackingRow
