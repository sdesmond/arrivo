# Story 3.3: Optimistic Update Reliability

Status: ready-for-dev

## Story

As a developer,
I want to fix race conditions and edge cases in packing optimistic updates,
So that announcement rollback, server-triggered re-renders, and concurrent mutation handling work correctly.

## Acceptance Criteria

### AC #1 — Announcement rollback on failure

**Given** a packing add/remove optimistic update triggers an `aria-live` announcement
**When** the server action fails
**Then** the announcement is rolled back or indicates failure

### AC #2 — Deferred announcement on success

**Given** an `aria-live` announcement is queued
**When** the server action resolves successfully
**Then** the announcement fires after confirmation, not before

### AC #3 — Server-triggered re-render detection

**Given** the server triggers a re-render of packing items
**When** optimistic state uses referential equality to detect changes
**Then** the optimistic state detects the server-triggered change correctly

### AC #4 — Concurrent mutation protection

**Given** two tabs both reorder the same packing list
**When** one mutation resolves
**Then** the other tab's optimistic state does not clobber the persisted order

## Tasks / Subtasks

### Task 1: Convert `onAddItem`/`onRemoveItem` to `Promise<void>` (AC #1)

- [ ] In `packing-list-view.tsx`: change `onAddItem` prop type from `(...) => void` to `(...) => Promise<void>`
- [ ] In `packing-list-view.tsx`: change `onRemoveItem` prop type from `(id: string) => void` to `(id: string) => Promise<void>`
- [ ] In `use-trip-detail-handlers.ts`: make `handleAddPackingItem` return the `addPackingItem` promise
- [ ] In `use-trip-detail-handlers.ts`: make `handleRemovePackingItem` return the `removePackingItem` promise
- [ ] In `PackingListView.PackingListSortable.onRemoveItem`: update to match the new signature
- [ ] In `PackingListViewProps` at template-pull-dialog callers: no change needed — `onPullTemplates` and `onSaveAsTemplate` already return `Promise`

### Task 2: Defer aria-live until server confirms (AC #2)

- [ ] `submitEntry()`: await `onAddItem()`, set announcement after resolve; catch error and set failure announcement
- [ ] `handleContextualAdd()`: same pattern — await then announce
- [ ] `handleRemove()`: same pattern — await then announce
- [ ] `handleToggle()`: already correct — announcements fire after `await onToggleItem()`

### Task 3: Fix referential equality for items prop (AC #3)

- [ ] In `packing-list-view.tsx` line 131: replace `prevItems !== items` with a key-based comparison that detects re-renders even when array reference is stable
- [ ] Options: compare by `items.length` change, or by serializing IDs: `items.map(i => i.id).join(',') !== prevItems.map(i => i.id).join(',')`
- [ ] Must still reset `isSubmitting`, `pendingItemIds`, `localItems` on any meaningful items change

### Task 4: Add mutation sequence counter (AC #4)

- [ ] In `packing-list-view.tsx`: add `mutationSeq` state counter (number), increment before each async mutation
- [ ] In `handleReorderPackingItems` in `use-trip-detail-handlers.ts`: pass current sequence to optimistic update
- [ ] In `packing-list-sortable.tsx` or `packing-list-view.tsx`: when a reorder resolves (via `router.refresh()` → new items prop), compare sequence: if a newer mutation has already started, discard the stale optimistic state
- [ ] Store last-completed sequence alongside `localItems` so stale rollbacks are ignored

## Dev Notes

### AC #1 — Convert add/remove to async

**Current state (packing-list-view.tsx):**

```tsx
// PackingListViewProps — current
onAddItem: (name: string, isLabel?: boolean, afterItemId?: string, beforeItemId?: string, labelId?: string | null) => void;
onRemoveItem: (id: string) => void;
```

The callers in `use-trip-detail-handlers.ts` already wrap in `async` functions but discard the return type:

```ts
// use-trip-detail-handlers.ts:238 — returns void
function handleAddPackingItem(...): void {
  React.startTransition(async () => {
    try {
      await addPackingItem(trip.id, { name, ... });
    } catch (error) {
      toast.error(...);
      router.refresh();
    }
  });
}
```

**Fix:** Change the handlers to return the promise so the component can await it:

```ts
function handleAddPackingItem(...): Promise<void> {
  return new Promise((resolve, reject) => {
    React.startTransition(async () => {
      try {
        await addPackingItem(trip.id, { name, isLabel, afterItemId, beforeItemId, labelId });
        resolve();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to add packing entry. Please try again.";
        toast.error(message);
        reject(error instanceof Error ? error : new Error(message));
      }
    });
  });
}
```

Same pattern for `handleRemovePackingItem`. This mirrors the existing `handleTogglePackingItem` (line 275) which already uses this `Promise` pattern.

**Must update:** `PackingListViewProps` and `TripDetailHandlers` interface types to return `Promise<void>`.

**Must update:** `PackingListSortableProps.onRemoveItem` — it receives the same prop from `PackingListView`. The signature must match.

### AC #2 — Deferred announcement

**Current state (packing-list-view.tsx):**

```tsx
function submitEntry(isLabel?: boolean): void {
  const trimmedName = draftName.trim();
  if (!trimmedName || isSubmitting) return;
  setIsSubmitting(true);
  onAddItem(trimmedName, isLabel);                // fires server action
  setAnnouncement(`${isLabel ? "Section" : "Item"} ${trimmedName} added.`);  // announces BEFORE server confirms
  setAnnouncementId((id) => id + 1);
  setDraftName("");
}
```

**Fix:** Convert to async, announce only after server confirms:

```tsx
async function submitEntry(isLabel?: boolean): Promise<void> {
  const trimmedName = draftName.trim();
  if (!trimmedName || isSubmitting) return;
  setIsSubmitting(true);
  try {
    await onAddItem(trimmedName, isLabel);
    setAnnouncement(`${isLabel ? "Section" : "Item"} ${trimmedName} added.`);
    setAnnouncementId((id) => id + 1);
    setDraftName("");
  } catch {
    setAnnouncement(`Failed to add ${isLabel ? "section" : "item"}.`);
    setAnnouncementId((id) => id + 1);
    setIsSubmitting(false);
  }
}
```

Same pattern for `handleContextualAdd()` and `handleRemove()`.

The `handleContextualAdd` is called from `packing-list-sortable.tsx` via the `onAddItem` prop. The caller (`PackingListSortable` → `ContextualAddForm`) currently doesn't await the result — it calls `onAddItem()` and immediately disables the form input via `isAdding`. After the change, `ContextualAddForm` should `await` `onAddItem()` before re-enabling. Check `packing-contextual-add-form.tsx` for the current behavior.

### AC #3 — Referential equality

**Current state (packing-list-view.tsx:131):**

```tsx
if (prevItems !== items) {
  setPrevItems(items);
  setIsSubmitting(false);
  setPendingItemIds(new Set());
  setLocalItems(null);
}
```

React performs strict reference equality (`===`) on props. When the server re-renders via `revalidatePath`/`router.refresh()`, if the parent passes the same array reference (possible with `use`/suspense patterns), this block won't fire and `isSubmitting` stays `true` forever.

**Fix option A — length-based comparison (simplest):**

```tsx
if (prevItems !== items || prevItems.length !== items.length) {
  // ...
}
```

**Fix option B — ID-based comparison (more precise):**

```tsx
const itemsKey = items.map(i => i.id).join(',');
const prevItemsKey = prevItems.map(i => i.id).join(',');
if (prevItems !== items || itemsKey !== prevItemsKey) {
  // ...
}
```

Option A is sufficient for the common cases (add/remove changes length). For reorder (length unchanged), the `prevItems !== items` check would still catch reference changes from `revalidatePath`. Option B is safer.

**Critical:** After the change, `setPrevItems(items)` must still be called last (after all other state resets) to avoid the stale closure resetting state after a newer render.

### AC #4 — Mutation sequence counter

**Design:** Add a `mutationSeq` counter and a `lastAppliedSeq` counter to track which mutations have been applied.

```tsx
const [mutationSeq, setMutationSeq] = useState(0);
const [lastAppliedSeq, setLastAppliedSeq] = useState(0);

// Before each mutation:
const currentSeq = mutationSeq + 1;
setMutationSeq(currentSeq);

// On items change from server (in the derive-from-props block):
if (prevItems !== items) {
  setPrevItems(items);
  // Only reset localItems if no pending mutation has a higher seq
  if (mutationSeq <= lastAppliedSeq) {
    setLocalItems(null);
  }
}

// In handleReorderOptimisticUpdate callback:
// When the server resolves and new items come in:
setLastAppliedSeq(mutationSeq);
```

**Scope check in `handleReorderPackingItems`:** Before calling `onOptimisticReorder(null)` (rollback), check if a newer mutation has started. If `mutationSeq > currentSeq`, skip the rollback — the newer mutation will handle its own state.

**Key challenge:** The reorder flow in `packing-list-sortable.tsx` calls `onOptimisticReorder(moved)` immediately (optimistic UI), then calls `onReorderItems(mapped, onError)`. The `onError` callback (which calls `onOptimisticReorder(null)`) must also check the sequence.

### Detailed Code Path: Reorder Flow

1. User drags → `handleDragEnd` in `packing-list-sortable.tsx`
2. `onOptimisticReorder(moved)` → `setLocalItems(moved)` in `packing-list-view.tsx`
3. `onReorderItems(mapped, onError)` → `handleReorderPackingItems` in `use-trip-detail-handlers.ts`
4. Server action executes; if fails → `onError()` → `onOptimisticReorder(null)` → `setLocalItems(null)`
5. If success → `router.refresh()` → server data re-fetches → new `items` prop → derive-from-props resets `localItems`

**Sequence counter placement:**
- Increment `mutationSeq` before step 2 (optimistic update)
- In `handleReorderPackingItems`, capture the sequence at call time
- When `onError` fires, check if a newer seq has started; skip rollback if so
- When derive-from-props fires (step 5), update `lastAppliedSeq`

### Existing Code That Must Not Break

- `handleTogglePackingItem` — already returns `Promise<void>` with correct error handling pattern. The existing `handleToggle()` in `packing-list-view.tsx:181` already handles errors and announcements correctly — do not change this path.
- `handlePullTemplates` / `handleSaveAsTemplate` — these already work correctly with async/await and proper error handling. No changes needed.
- `handleReorderPackingItems` — the `onError` callback path must continue working. The new sequence counter must not break the existing rollback behavior.
- The `double-submit guard` (`isSubmitting` → `setIsSubmitting`) must still prevent concurrent submissions. After the conversion to async, ensure `isSubmitting` is reset even on error.
- Existing tests (1144 lines in `packing-list-view.test.tsx`) must pass without modification unless they test the specific announcement timing changed by AC #2. Tests that expect immediate announcement will need updating.

### Types to Update

The following interface in `packing-list-view.tsx` must be updated:

```tsx
export interface PackingListViewProps {
  // ...
  onAddItem: (...) => Promise<void>;  // was: void
  onRemoveItem: (id: string) => Promise<void>;  // was: void
  // ...
}
```

The `TripDetailHandlers` interface in `use-trip-detail-handlers.ts` must be updated:

```tsx
export interface TripDetailHandlers {
  // ...
  handleAddPackingItem: (...) => Promise<void>;  // was: void
  handleRemovePackingItem: (id: string) => Promise<void>;  // was: void
  // ...
}
```

### File Structure Requirements

| File | Action | Notes |
|------|--------|-------|
| `src/components/packt/packing-list-view.tsx` | MODIFY | Convert `onAddItem`/`onRemoveItem` to async; defer announcements; fix referential equality; add mutation sequence counter |
| `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts` | MODIFY | Make `handleAddPackingItem`/`handleRemovePackingItem` return `Promise<void>`; add sequence parameter to reorder handler |
| `src/components/packt/packing-list-sortable.tsx` | MODIFY | Update `onRemoveItem` prop type; pass sequence info through callbacks |
| `src/components/packt/packing-contextual-add-form.tsx` | REVIEW | May need update if it doesn't await `onAddItem` |
| `src/components/packt/packing-list-view.test.tsx` | MODIFY | Update tests that assert immediate announcement timing (tests using `setAnnouncement` before server confirmation) |

### Testing Requirements

**Unit tests — `packing-list-view.test.tsx`:**

- **AC #1:** Add test: `onAddItem` rejects → failure announcement shown, `isSubmitting` reset
- **AC #1:** Add test: `onRemoveItem` rejects → failure announcement shown
- **AC #2:** Add test: `onAddItem` pending → no announcement yet; resolved → success announcement
- **AC #2:** Add test: `handleContextualAdd` pending → no announcement yet; resolved → success announcement
- **AC #2:** Modify existing test "announces toggle via aria-live region" — ensure it still works (this path is already correct)
- **AC #3:** Add test: simulate server re-render with same array reference but different items content → `isSubmitting` still reset
- **AC #4:** Add test: concurrent reorder — stale rollback is ignored
- **AC #4:** Add test: sequence counter increments on each mutation

**Existing tests that may break:**
- `"submits a plain-text item from the form"` (line 157) — checks `onAddItem` was called but doesn't assert announcement timing. Should still pass.
- `"announces toggle via aria-live region"` (line 385) — this tests toggle which already works correctly. No change needed.
- `"announces uncheck via aria-live region"` (line 408) — same.
- `"waits for toggle persistence before announcing success"` (line 432) — this pattern is exactly what AC #2 requires. The existing test proves the pattern works.

**New test for AC #2 pattern (add item deferred announcement):**
```tsx
it("waits for add persistence before announcing success", async () => {
  const user = userEvent.setup();
  let resolveAdd: (() => void) | undefined;
  const onAddItem = vi.fn(() => new Promise<void>((resolve) => { resolveAdd = resolve; }));
  const { container } = render(<PackingListView ... />);
  // type and submit
  await user.type(screen.getByRole("textbox", ...), "Passport");
  await user.click(screen.getByRole("button", { name: "Add item" }));
  const liveRegion = container.querySelector("[aria-live=polite]");
  expect(liveRegion).not.toHaveTextContent("Passport added.");
  resolveAdd?.();
  await waitFor(() => expect(liveRegion).toHaveTextContent("Passport added."));
});
```

**Unit tests — `use-trip-detail-handlers.test.tsx`:**

- **AC #1:** Add test: `handleAddPackingItem` returns a promise that resolves on success
- **AC #1:** Add test: `handleAddPackingItem` returns a promise that rejects on failure
- **AC #1:** Add test: `handleRemovePackingItem` returns a promise that resolves on success
- **AC #1:** Add test: `handleRemovePackingItem` returns a promise that rejects on failure
- Modify existing tests (`"adds packing items against the current trip"`) to await the return value

**Coverage:** maintain ≥95% lines/functions, ≥90% branches. New code must be fully covered.

**Global mocks:** `next/navigation` and `next/headers` already mocked globally in `vitest.setup.mts` — do not re-mock.

**E2E tests:** Existing scenarios in `packing-tab.feature` must continue passing. No new E2E scenarios needed for this story (these are internal reliability improvements).

### Previous Story Intelligence (3.2)

From `3-2-server-action-hardening.md`:

**Key learnings:**
- `packing-actions.ts` was extracted from the monolithic `trips/actions.ts` (920 lines) — all packing mutations now live in their own file
- `withErrorHandling()` is applied to all packing action exports — server actions catch and sanitize errors before they reach the client
- `sanitizeError()` passes through known validation errors (starts with known prefixes) and replaces unknown errors with a generic message
- Review found that `withErrorHandling` was sanitizing `redirect()`/`notFound()` signals — fixed with `isNextJsSignal()` check
- Review found idempotency keys were unscoped (no `userId` filter) — fixed with composite PK `(key, userId)`
- Review found TOCTOU race in idempotency logic — fixed by moving cache check inside the transaction
- Review found `addPackingItem` validates `labelId` outside transaction — fixed by moving validation inside for `afterItemId`/`beforeItemId` paths
- Review annotations tracked with `[Review][Patch/Decision/Defer]` prefixes in story file

**Relevance to this story:**
- `sanitizeError()` already wraps all packing server actions — errors from `addPackingItem` etc. will be sanitized by the time they reach the client handler. The `catch` block in the handler receives the sanitized message.
- `withErrorHandling()` re-throws sanitized errors — the `try/catch` in `handleAddPackingItem` will catch them correctly.

### Git Intelligence

Recent commits affecting packing action files:
- `3873bf5` — fix: apply code review patches for story 3.2
- `9bdb662` — feat: harden trip packing server actions
- `09a4cdd` — feat: sanitize packing template action errors
- `52d48ec` — fix: apply code review patches for story 3.1 bug fixes
- `9515837` — fix: eliminate 7 data-corruption and silent-failure bugs in packing sort utils

**Pattern:** Recent work follows a clear pattern: pure logic fixes → server action hardening → now optimistic update reliability. Each layer builds on the previous one.

### Architecture Compliance

- All new types in `src/data/types.ts` if needed (types for sequence counter or mutation state)
- `"use client"` is already the first line of all interactive component files — preserve this
- `requireUser()` + `assertTripAccess()` already enforced in all server actions — no changes to server actions needed for this story
- `revalidatePath` calls already present in all server actions — no changes to server actions needed
- The `sanitizeError` wrapper already handles errors at the server boundary — the client receives sanitized messages
- All interactive packing components already have `"use client"` as first line

### Library / Framework Requirements

- No new npm packages needed
- React 19.2.4 — `useTransition` and `startTransition` are already used in `use-trip-detail-handlers.ts`
- `next/navigation` — `useRouter` already imported
- No changes to Drizzle schema needed

### Project Context Reference

- **No `any` types** — all types explicit
- **Path alias** `@/*` → `./src/*`
- **No single-letter variable names** (except `for` loop `i`)
- **Server actions** live alongside their route: `src/app/(app)/trips/[tripId]/` for trip-level actions; shared packing actions in `src/app/(app)/trips/packing-actions.ts`
- **Every action** must call `requireUser()` then `assertTripAccess()` — already done, do not remove
- **Always call `revalidatePath`** after any mutation
- **All domain types** in `src/data/types.ts` — no local type redefinitions
- **Coverage thresholds:** ≥95% lines/functions, ≥90% branches (enforced in CI)
- **Colocated tests:** `foo.ts` → `foo.test.ts` in same directory
- **Lucide icons:** always `strokeWidth={1.5}`; icon-only buttons need `title`
- **Theme tokens:** use CSS custom properties (`var(--bg)`, `var(--surface)`, `var(--fg)`, `var(--line)`, `var(--accent-brand)`, etc.)
- **No arbitrary Tailwind values** — use inline styles for dynamic values
- **Colors:** always via CSS custom properties — never hardcoded hex/rgb
- **Sonner:** `toast.error()` for failures, `toast.success()` for confirmations
- **Mock `sonner` in tests:** `vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))`

## Dev Agent Record

### Agent Model Used

opencode/big-pickle

### Completion Notes List

- Story 3.3 identified as the first backlog story in epic 3 (Technical Debt & Polish)
- Previous stories 3.1 and 3.2 are done — their learnings are incorporated above
- Current sprint status: epic-3 is in-progress, stories 3.1 (done), 3.2 (done), 3.3 (backlog)
- Source files analyzed: `packing-list-view.tsx` (302 lines), `packing-list-sortable.tsx` (262 lines), `use-trip-detail-handlers.ts` (415 lines), `packing-actions.ts` (475 lines), `packing-list-view.test.tsx` (1144 lines), `use-trip-detail-handlers.test.tsx` (337 lines), `packing-sort-utils.test.ts` (227 lines)

### File List

- `src/components/packt/packing-list-view.tsx` — MODIFY
- `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts` — MODIFY
- `src/components/packt/packing-list-sortable.tsx` — MODIFY
- `src/components/packt/packing-contextual-add-form.tsx` — REVIEW
- `src/components/packt/packing-list-view.test.tsx` — MODIFY
- `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.test.tsx` — MODIFY
