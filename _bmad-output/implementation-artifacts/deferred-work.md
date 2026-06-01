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
