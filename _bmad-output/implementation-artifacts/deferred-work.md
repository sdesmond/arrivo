## Deferred from: code review of 1-1-packing-tab-foundation-list-display-and-item-label-management (2026-05-31)

- Optional `isLabel` type vs not-null DB column — intentional: optional makes sense for input contexts
- No optimistic update pattern — out of scope for this story
- Label removal orphans items as ungrouped — intended behavior per spec
- No dedicated `groupPackingItems` unit test — grouping verified implicitly by render-order test
- Touch target test uses class presence not rendered size — jsdom cannot measure computed pixel dimensions
- Optimistic announcement not rolled back on server error — requires `onAddItem`/`onRemoveItem` props to return `Promise<void>` and handlers to reject on failure; that's a cross-cutting refactor better suited to a dedicated story
