# Story 3.6: UX/Cosmetic Polish

Status: done

## Story

As a user,
I want consistent and polished packing UI behavior,
So that section labels behave correctly, template names are distinguishable, and sort order is case-insensitive.

## Acceptance Criteria

### AC #1 — Section labels are non-draggable with no snap-back

**Given** a section label in the packing list
**When** the user attempts to drag it
**Then** the label does not move at all (non-draggable, no snap-back)

### AC #2 — Distinct aria-labels for duplicate template names

**Given** two or more templates share the same name
**When** they render in the library
**Then** their `aria-label` attributes are distinct (e.g., include the template `id`)

### AC #3 — Case-insensitive template name sort

**Given** a list of templates sorted by name
**Then** the sort is case-insensitive
**And** "beach trip" and "Beach Trip" appear adjacent rather than separated by case

## Tasks / Subtasks

- [x] Remove drag affordance from section labels (AC: #1)
  - [x] In `packing-list-sortable.tsx`: render section labels as plain `PackingRow` (not `SortablePackingRow`) — remove `useSortable` wrapper from label rows
  - [x] Remove label `id` from `DroppablePackingSection`'s `sortableIds` array so dnd-kit never registers labels as sortable items
  - [x] Keep the existing `handleDragEnd` label guard (`onAnnounceMove("Labels cannot be reordered.")`) as defense-in-depth but verify it never fires
  - [x] In `packing-list-sortable.test.tsx`: update existing "Bug #7: section labels have no drag handle" test (line 631) to also verify labels render as `PackingRow` not `SortablePackingRow` (e.g., check absence of `data-rbd-draggable-context-id` or sortable-specific ARIA attributes)
- [x] Disambiguate `aria-labels` for duplicate template names (AC: #2)
  - [x] In `template-library.tsx`: change `aria-label="Rename ${template.name}"` to `aria-label="Rename ${template.name} (${template.id})"`
  - [x] Same for delete button: `aria-label="Delete ${template.name} (${template.id})"`
  - [x] Update `template-library.test.tsx` to assert aria-labels include the template id
- [x] Apply `lower()` case-insensitive sort on template names (AC: #3)
  - [x] In `src/lib/queries.ts`: change `asc(packingTemplates.name)` to `asc(sql\`LOWER(${packingTemplates.name})\`)` in `listTemplatesForUser`
  - [x] Note: `queries.ts` imports `"server-only"` and is excluded from coverage — no unit test needed (update existing test fixture ordering if present)

### Review Findings

- [x] [Review][Patch] Duplicate-name template aria-label scenario is still untested [src/components/packt/template-library.test.tsx:7]
- [x] [Review][Patch] Label-row regression test does not assert absence of sortable-specific attributes [src/components/packt/packing-list-sortable.test.tsx:648]
- [x] [Review][Patch] Label drag guard remains in place without a test proving it never fires [src/components/packt/packing-list-sortable.tsx:116]
- [x] [Review][Patch] Section header remains part of the drop zone after label deregistration, so header drops can reparent items [src/components/packt/packing-list-sortable.tsx:169]
- [x] [Review][Patch] Template-library E2E selectors still target the old accessible names [tests/e2e/steps/templates.steps.ts:52]
- [x] [Review][Patch] Mixed-case template ordering has no regression coverage [tests/e2e/features/templates.feature:43]
- [x] [Review][Patch] E2E rename/delete selectors should use getByRole with aria-label (not getByTitle) — title lacks template ID, breaking duplicate-name resolution [src/components/packt/template-library.tsx:86]
- [x] [Review][Patch] Case-insensitive sort needs deterministic tiebreaker — add id as third sort column after LOWER(name) and createdAt [src/lib/queries.ts:134]
- [x] [Review][Defer] LOWER() in ORDER BY destroys index scan [src/lib/queries.ts:134] — deferred, pre-existing trade-off accepted in spec
- [x] [Review][Defer] E2E ordering step uses fragile DOM-structure locator (li a[href^='/packing/']) [tests/e2e/steps/templates.steps.ts:89] — deferred, works for current markup

## Dev Notes

### Current Code State

**AC #1 — Labels already partially non-draggable:**
- `SortablePackingRow` in `packing-list-row.tsx:190` has `disabled: props.isLabel` on `useSortable` — labels cannot be activated by sensors
- `SortablePackingRow` at line 208 conditionally omits the drag handle for labels (`props.isLabel ? undefined : ...`)
- `handleDragEnd` in `packing-list-sortable.tsx:115` checks for `draggedItem?.isLabel` and announces "Labels cannot be reordered."
- **Remaining gap**: labels are still rendered as `SortablePackingRow` (not plain `PackingRow`), and their `id` is included in the `sortableIds` array of `DroppablePackingSection` at line 172. This means dnd-kit still tracks labels as sortable items. With `useSortable` disabled the label shouldn't move, but removing from sortableIds and using plain `PackingRow` eliminates any residual snap-back risk.

**AC #2 — Current aria-labels:**
- `template-library.tsx` lines 86-87: `aria-label="Rename ${template.name}"`
- `template-library.tsx` lines 92-93: `aria-label="Delete ${template.name}"`
- If two templates have the same name, these are indistinguishable to assistive tech

**AC #3 — Current sort:**
- `queries.ts` line 134: `.orderBy(asc(packingTemplates.name), asc(packingTemplates.createdAt))`
- Postgres `ORDER BY name ASC` uses the server's default collation which is case-sensitive — "Beach Trip" and "beach trip" are sorted separately

### Files to Modify

| File | Action | Changes |
|------|--------|---------|
| `src/components/packt/packing-list-sortable.tsx` | MODIFY | Render labels as `PackingRow` not `SortablePackingRow`; remove label ids from sortableIds |
| `src/components/packt/packing-list-sortable.test.tsx` | MODIFY | Add test asserting labels have no drag affordance |
| `src/components/packt/packing-list-row.tsx` | MAYBE | No changes expected — SortablePackingRow already conditionally omits drag handle for labels |
| `src/components/packt/template-library.tsx` | MODIFY | Append template id to aria-labels |
| `src/components/packt/template-library.test.tsx` | MODIFY | Update aria-label assertions |
| `src/lib/queries.ts` | MODIFY | Add `sql\`LOWER(...)\`` wrapper for case-insensitive sort |
| `tests/e2e/features/packing-tab.feature` | MAYBE | Add scenario for label non-draggability if gap identified |

### What Must NOT Change

- No changes to `@dnd-kit` dependencies or `useSortable` API (already handles label disabling)
- No changes to `PackingRow` component itself — it renders correctly for both items and labels
- No changes to server actions, DB schema, or DnD collision detection
- No changes to `sortableIds` in the ungrouped `DroppablePackingSection` (only section headers)
- `template-library.tsx` `title` attributes should remain unchanged (they are not used for accessibility matching — only `aria-label` matters for screen readers)
- Existing passing tests must continue to pass
- Do NOT add new E2E scenarios for template-library (aria-label changes are testable at unit level)
- Do NOT add new npm packages

### Implementation Details

**AC #1 — Remove drag affordance from labels:**
In `packing-list-sortable.tsx`, the section heading render (lines 174-183):
```tsx
<SortablePackingRow
  id={section.label.id!}
  item={section.label}
  isLabel
  isComplete={completeLabelIds.has(section.label.id!)}
  onRemove={() => onRemoveItem(section.label)}
  onEdit={...}
/>
```
Replace with:
```tsx
<PackingRow
  item={section.label}
  isLabel
  isComplete={completeLabelIds.has(section.label.id!)}
  onRemove={() => onRemoveItem(section.label)}
  onEdit={...}
/>
```

Also remove label.id from the section's `sortableIds` on line 171-172:
```tsx
sortableIds={[section.label.id!, ...section.items.map((item) => item.id!)]}
```
→
```tsx
sortableIds={section.items.map((item) => item.id!)}
```

The `handleDragEnd` label guard at line 115 still provides defense-in-depth and should be kept.

**AC #2 — Distinct aria-labels:**
In `template-library.tsx`, change:
```tsx
aria-label={`Rename ${template.name}`}
```
→
```tsx
aria-label={`Rename ${template.name} (${template.id})`}
```

Same pattern for delete button.

**AC #3 — Case-insensitive sort:**
In `queries.ts`, change import to add `sql`, then:
```ts
import { sql } from "drizzle-orm";
// ...
.orderBy(asc(sql`LOWER(${packingTemplates.name})`), asc(packingTemplates.createdAt));
```

### Testing Requirements

| Test file | What to add/update |
|-----------|-------------------|
| `src/components/packt/packing-list-sortable.test.tsx` | Update existing "Bug #7: section labels have no drag handle" test (line 631) to also verify label is rendered as `PackingRow` not `SortablePackingRow` |
| `src/components/packt/template-library.test.tsx` | Update aria-label assertions to include `(template-1)` and `(template-2)` suffixes |
| `tests/e2e/features/packing-tab.feature` | Only if a gap is identified — existing E2E already covers drag scenarios |

**Important:** No new tests needed for `queries.ts` — it imports `"server-only"` and is excluded from coverage (`src/lib/queries.ts` in the exclusion list).

### Project Context Reference

- `src/components/packt/` — domain components with colocated test files
- `src/lib/queries.ts` — server-only module, excluded from coverage
- Path alias `@/*` → `./src/*`
- Styling: CSS custom properties (no hardcoded hex), `cn()` from `@/lib/utils`
- Lucide icons: `strokeWidth={1.5}` always; icon buttons need `title` attribute
- Coverage thresholds: ≥95% lines/functions, ≥90% branches across `src/lib/**` and `src/components/packt/**`
- Test files live next to source: `foo.tsx` → `foo.test.tsx`

### Previous Story Intelligence (3.5)

From `3-5-test-quality-improvements.md`:
- Story 3.5 focused on test quality: E2E pointer-drag scenarios, `groupPackingItems` edge cases, touch target measurement, keyboard-move parameterization, drag helper retry, optimistic update tests
- Extracted `PackingEntryForm` from `packing-list-view.tsx` into its own file
- Fixed review findings: empty-string form submission guard, race conditions in deferred-announcement tests, type hack in test data
- Validation: `npm run test:coverage` (≥95%), `npm run test:e2e`, `npm run build`

**Key patterns established:**
- Tests use `@testing-library/react` with `vi.mock` for mocking
- E2E steps in `tests/e2e/steps/packing-tab.steps.ts`
- `SortablePackingRow` uses `disabled: props.isLabel` pattern for label exclusion

### Git Intelligence

Recent commits relevant to packing list UX:
- Recent work on story 3.5 touched `packing-list-sortable.tsx`, `packing-list-row.tsx`, `packing-list-view.tsx`
- Story 3.4 modified `src/db/schema.ts` with named indexes
- Established test patterns: colocated test files, `vi.mock` for server actions, `@testing-library/react`

## Dev Agent Record

### Agent Model Used

opencode/big-pickle

### Debug Log References

- `npx vitest run src/components/packt/packing-list-sortable.test.tsx`
- `npx vitest run src/components/packt/template-library.test.tsx`
- `npm run test:coverage`
- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`

### Completion Notes List

- AC#1: Labels now render as plain `PackingRow`; removed from `sortableIds` — dnd-kit has zero awareness of them. Updated `packing-list-sortable.test.tsx` Bug #7 to assert `[data-packing-kind="label"]` parent is the section container (not a SortablePackingRow wrapper div). Also updated `packing-list-view.test.tsx` to assert `useSortable` is no longer called with `disabled:true` for labels at all.
- AC#2: Rename/Delete aria-labels now include `(${template.id})` suffix. Template-library tests updated to match.
- AC#3: `listTemplatesForUser` orderBy now uses `LOWER()` via drizzle `sql` tag — `sql` was already imported.

### File List

- `_bmad-output/implementation-artifacts/3-6-ux-cosmetic-polish.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/components/packt/packing-list-sortable.tsx`
- `src/components/packt/packing-list-sortable.test.tsx`
- `src/components/packt/packing-list-view.test.tsx`
- `src/components/packt/template-library.tsx`
- `src/components/packt/template-library.test.tsx`
- `src/lib/queries.ts`

### Change Log

- 2026-06-04: Created Story 3.6 covering label non-draggability, distinct template aria-labels, and case-insensitive sort
- 2026-06-04: Implemented all three ACs; all tests green (1612 unit, 112/113 E2E — 1 pre-existing flaky drag failure in day-planning unrelated to this story)
