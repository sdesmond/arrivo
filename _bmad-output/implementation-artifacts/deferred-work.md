## Deferred from: code review of 2-1-template-library-create-rename-and-delete-templates (2026-06-02)

- `renameTemplate`/`deleteTemplate` silent no-op on missing/wrong-user ID — intentional per spec ("silent no-op, never a cross-user mutation"); established codebase pattern
- Server action errors leak raw message to client via Next.js serialization — systemic, pre-existing across all actions in codebase
- Duplicate template names produce ambiguous aria-labels — spec explicitly forbids uniqueness constraint; "duplicate template names are allowed"
- Anonymous index name on `packingTemplates.userId` — pre-existing pattern throughout schema.ts (`index().on(...)` without a name)
- Case-sensitive collation on template name sort — pre-existing PostgreSQL default; `lower()` or `COLLATE` can be applied in a future story when list grows

## Deferred from: code review of 1-4-inline-editing-label-strikethrough-and-contextual-add (2026-06-01)

- Section labels are draggable but cannot be reordered (snap back) — label id is in each section's SortableContext and renders as SortablePackingRow, but computeReorder rejects label drags; conflicts with "Do NOT add drag-to-reorder section labels." Cosmetic, likely partly pre-existing from 1.3
- Server actions don't validate that a supplied labelId references a label row in the same trip — self-FK only guarantees row existence, not isLabel/same-trip; legit UI never sends a bad value — defense-in-depth
- Optimistic reorder is last-write-wins — full-list position rewrite can clobber a concurrent reorder/add from another tab/session; inherent to the 1.3 optimistic pattern
- Non-null assertions (item.id!, item.position!) persist and grow in new code — open Second Pass item; project-wide pattern, not a regression
- E2E drag helper `if (!box) break` abandons a vanished target and relies on `.toPass()` retries — minor test-robustness

## Deferred from: code review of 1-3-drag-to-reorder-items-with-position-persistence second pass (2026-06-01)

- Non-label item dragged over disabled label may bypass snap-to-nearest, corrupting section grouping — spec-acknowledged collision behavior, Phase 1 flat position model
- Keyboard-move E2E step hardcodes `index === 1` assertion, fragile if step is reused for non-zero-position items — correct for current single usage
- Optimistic reorder clears on concurrent add/remove resolving mid-flight — explicitly deferred in first pass per spec pattern

## Deferred from: code review of 1-3-drag-to-reorder-items-with-position-persistence (2026-06-01)

- No concurrency protection — concurrent reorders/adds/removes can corrupt positions — deferred, Phase 1 is single-user per spec
- Optimistic state uses referential equality — may miss server-triggered re-renders — deferred, follows existing spec pattern
- No mouse/touch E2E coverage for pointer-drag reorder — deferred, keyboard E2E + unit tests cover reorder paths

## Deferred from: code review of 1-1-packing-tab-foundation-list-display-and-item-label-management (2026-05-31)

- Optional `isLabel` type vs not-null DB column — intentional: optional makes sense for input contexts
- No optimistic update pattern — out of scope for this story
- Label removal orphans items as ungrouped — intended behavior per spec
- No dedicated `groupPackingItems` unit test — grouping verified implicitly by render-order test
- Touch target test uses class presence not rendered size — jsdom cannot measure computed pixel dimensions
- Optimistic announcement not rolled back on server error — requires `onAddItem`/`onRemoveItem` props to return `Promise<void>` and handlers to reject on failure; that's a cross-cutting refactor better suited to a dedicated story

## Deferred from: code review of 2-2-template-item-and-label-management (2026-06-02)

- `computeReorder.flatten` reassigns all positions from 0 — on optimistic rollback, original DB positions are lost; the rollback payload carries freshly numbered positions that may not match persisted state.
- No `labelId` index on `packingTemplateItems` — the composite index `(templateId, position)` covers template-scoped queries but queries filtering by `labelId` alone would scan all rows.
- computeReorder silently swallows label drags with no feedback — when `active.isLabel` is true, the function returns `null` with no event, error, or UI feedback; user sees the drag do nothing.
- `byPosition` uses `Infinity` fallback — when ALL items in a sort group have `undefined` position, `Infinity - Infinity` produces `NaN`, making sort order undefined.
- Label with undefined `id` added to `Set` — if a label `PackingItem` lacks an `id`, it's inserted into the labelIds Set as `"undefined"`, causing downstream containment checks to silently fail.
- `containerKeyOfItem` returns null when label `id` is undefined — the `section.label.id ?? null` coalesce produces null when a label has a falsy id, making `activeKey` null and causing `computeReorder` to return null silently.
- Item in reorder array with undefined `id` or `position` — `onReorderItems` callback in `PackingListSortable` can be invoked with `id: undefined` or `position: undefined` for items missing those fields.

## Deferred from: code review of 1-2-check-items-as-packed-with-session-persistence-and-trip-card-progress (2026-05-31)

- Optimistic `aria-live` announcement fires before server action resolves — matches pre-existing pattern from other packing handlers
- Race condition between two COUNT queries in `listTripsForUser` — pre-existing architectural decision (accepted for Phase 1 per spec)
- Test asserts hardcoded `"ungrouped-1"` ID not visible in diff — pre-existing test data context from Story 1.1
