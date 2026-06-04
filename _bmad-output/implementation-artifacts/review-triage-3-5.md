# Story 3.5 — Code Review Triage

## Summary
| Layer | Findings | Status |
|-------|----------|--------|
| Blind Hunter (adversarial) | 12 | ✅ Completed |
| Edge Case Hunter | 10 | ✅ Completed |
| Acceptance Auditor | 0 | ✅ All ACs satisfied, all constraints pass |

## Triaged Findings

### PATCH — Fixable without human input

1. **TypeScript type hack in test data masks real-world edge cases**
   - Source: `blind`
   - Location: `packing-sort-utils.test.ts` — `labelId: undefined as unknown as string`
   - Detail: Bypasses the type system to smuggle `undefined` where the type says `string`. If the real code never receives `undefined` in that field, the test is a false positive.
   - Fix: Use `null` or a valid string ID instead of `undefined as unknown as string`.

2. **Void-operator swallows errors from async callbacks**
   - Source: `blind+edge`
   - Location: `packing-entry-form.test.tsx` — `onSubmitItem={() => void handleSubmitItem()}`
   - Detail: If `handleSubmitItem` (which calls `onAddItem`) throws, the error is silently discarded. The harness has no error handling.
   - Fix: Remove `void` operator; let the promise reject propagate to the test runner.

3. **Race condition in deferred-announcement tests — `resolveAdd` may be undefined**
   - Source: `blind`
   - Location: `packing-list-view.test.tsx` — `resolveAdd?.()` in deferred-announcement tests
   - Detail: `resolveAdd?.()` silently no-ops if the async operation hasn't yet assigned the resolve function. The test would pass even if the component never started the async call (false positive).
   - Fix: Assert `resolveAdd` is defined before calling it, or use a deferred promise pattern that guarantees assignment.

5. **No test coverage for `isSubmitting={true}` in isolated `PackingEntryForm`**
   - Source: `blind+edge`
   - Location: `packing-entry-form.test.tsx`
   - Detail: Test harness hardcodes `isSubmitting={false}`. The button disabled-while-submitting behavior is never exercised at the component level.
   - Fix: Add a test rendering `PackingEntryForm` with `isSubmitting={true}` and asserting both buttons are disabled.

7. **`minWidth` on a `<span>` (inline element) is a no-op**
   - Source: `blind`
   - Location: `packing-list-row.tsx` — `SortablePackingRow` wraps drag handle in `<span>`
   - Detail: A `<span>` with default `display: inline` ignores `minWidth`. The touch target won't enforce 44px minimum width in real browsers (though jsdom reports it).
   - Fix: Change the `<span>` to use `display: inline-flex` or change to a `<div>`.

13. **Retry loop exhaustion skips final mouse moves, fires `mouse.up()` at stale coordinates**
   - Source: `edge`
   - Location: `tests/e2e/steps/packing-tab.steps.ts` — `dragItemOntoTarget` and `dragItemIntoUngroupedArea`
   - Detail: When `boundingBox()` returns null for all 4 attempts, the cursor stays at initial coordinates, then `mouse.up()` fires there. dnd-kit processes the drop at an arbitrary position.
   - Fix: Track the last known valid box coordinates and use them as fallback, or break out after retries and skip the drop entirely.

### DEFER — Real but pre-existing or not actionable in this change

4. **`expectMinimumTouchTarget` relies on `window.getComputedStyle` in jsdom**
   - Source: `blind+edge`
   - Location: `packing-list-view.test.tsx`
   - Detail: jsdom computes inline styles but may not compute cascade-dependent values. Currently works because all tested elements have inline styles, but is an invisible coupling.

6. **Duplicate min-size enforcement — inline style and Tailwind class on same element**
   - Source: `blind`
   - Location: `packing-list-row.tsx`
   - Detail: Both `className="min-h-11 min-w-11"` and `style={minimumTouchTargetStyle}` set the same constraint. Inline style wins over class — a class-only change wouldn't propagate.

10. **`PackingEntryForm` test harness does not match production data flow for submit**
    - Source: `blind`
    - Location: `packing-entry-form.test.tsx`
    - Detail: Harness duplicates production's read-from-state logic. Acceptable for isolated component testing.

11. **Empty-string form submission not guarded**
    - Source: `blind`
    - Location: `packing-entry-form.tsx`

14. **Fewer re-hover moves when target flickers reduces drag reliability**
    - Source: `edge`
    - Location: `tests/e2e/steps/packing-tab.steps.ts`

16. **`submitEntry` remove path lacks retry mechanism on rejection**
    - Source: `edge`
    - Location: `packing-list-view.tsx`

### DISMISSED (8 findings)

- #8 — Old `I drag...` step definitions orphaned (harmless dead code)
- #9 — Label-name assertion couples to internal formatting (acceptable unit test pattern)
- #12 — `toPass` retry misread — `allTextContents()` IS re-evaluated per retry cycle
- #15 — `useId()` SSR incompatibility (Next.js handles this correctly in hydration)
- #17 — Mixed `void`/non-`void` usage (cosmetic, no functional impact)
- #18 — Undefined-position ordering assumption (valid test documenting current behavior)
- #19 — `pointer-drag` steps alias old steps (satisfies AC #1 — scenarios use `page.mouse`)
