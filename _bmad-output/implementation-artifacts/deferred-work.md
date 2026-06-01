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

## Deferred from: code review of 1-2-check-items-as-packed-with-session-persistence-and-trip-card-progress (2026-05-31)

- Optimistic `aria-live` announcement fires before server action resolves — matches pre-existing pattern from other packing handlers
- Race condition between two COUNT queries in `listTripsForUser` — pre-existing architectural decision (accepted for Phase 1 per spec)
- Test asserts hardcoded `"ungrouped-1"` ID not visible in diff — pre-existing test data context from Story 1.1
