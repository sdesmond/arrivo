---
story_id: "1.5"
story_key: "1-5-offline-status-indicator-and-save-all-offline"
epic: 1
story: 5
title: "Offline Status Indicator & Save All Offline"
status: "review"
created: "2026-05-20"
---

# Story 1.5 — Offline Status Indicator & Save All Offline

## User Story

As a **traveler**,
I want to see which documents are available offline and save them all with one tap,
So that I can access my boarding passes and tickets even without mobile data.

## Acceptance Criteria

**Given** a document row is rendered
**When** I view the Documents tab
**Then** each row shows an offline status indicator (a filled dot when cached, empty dot when not) alongside the document name (FR10)

**Given** the offline indicator uses a visual dot
**When** inspected for accessibility
**Then** it carries `aria-label="Cached offline"` or `aria-label="Not cached offline"` — state is not conveyed by color alone (NFR4)

**Given** I am on the Documents tab and have at least one document
**When** I view the header area
**Then** a "Save All Offline" button is present (FR11)

**Given** I tap "Save All Offline"
**When** the action completes
**Then** all trip documents are marked as `offline: true` in the database; the offline indicator for each row updates to "Cached offline" (v1 implementation — actual cache sync is a future enhancement; the DB field is the source of truth for now)

**Given** the "Save All Offline" button is rendered
**When** inspected
**Then** it meets the 44×44px minimum touch target (NFR8) and uses CSS custom properties for all colors (NFR2)

**Given** the story implementation is complete
**When** tests are run
**Then** unit tests for the offline indicator and Save All Offline button pass with ≥95% line coverage (NFR9)

> **Note:** This story does NOT require E2E tests (NFR10). The acceptance criteria explicitly reference only NFR9 — no Playwright BDD scenario is expected.

---

## Dev Notes

### Current State (end of Story 1.4)

All prior stories (1.1–1.4) are complete. The relevant files in their current state:

**`src/components/packt/doc-row.tsx`** — 174 lines

Current layout per row:
```
[DocKindBadge] [name-span or rename-input] [Trash2 delete button] [confirm Dialog]
```
- Uses `displayName` state (initialized from `doc.name`), not `doc.name` directly, to reflect optimistic rename updates
- Has `isPending` (delete transition), `confirmOpen`, `error`, `inFlightRef`, `isEditing`, `editName`, `cancelRef` state/refs
- Imports: `useRef, useState, useTransition` | `Trash2` | `DocKindBadge` | `Document` | `removeDocument, renameDocument` | Dialog components | `Button`
- **Does not yet render `doc.offline` in any way**

**`src/components/packt/trip-docs-tab.tsx`** — 127 lines

Current layout:
```
[Add label (button)]    ← header row, justify-end
[Search input]          ← sr-only label + type="search"
[DocRow list / empty state]
```
- Uses `useRef` (inputRef), `useState` (query), `useTransition` (isPending for upload)
- Imports: `useRef, useState, useTransition` | `Plus` | `Document` | `DocRow` | `uploadDocument`
- **Does not yet have a "Save All Offline" button**
- **Does not yet import `markAllDocsOffline`**

**`src/app/(app)/trips/[tripId]/actions.ts`** — last export is `renameDocument` at lines 371–380

Current drizzle-orm imports: `eq, and, max, gte, sql` — **`isNull` is NOT currently imported**

**`src/components/packt/doc-row.test.tsx`** — 244 lines, 22 tests

`makeDoc` factory:
```ts
const makeDoc = (overrides: Partial<Document> = {}): Document => ({
  id: "doc-1",
  name: "Boarding Pass.pdf",
  kind: "pdf",
  scope: "trip",
  offline: false,
  ...overrides,
});
```
Current mock: `removeDocument`, `uploadDocument`, `renameDocument` — no `markAllDocsOffline`

**`src/components/packt/trip-docs-tab.test.tsx`** — 103 lines, 10 tests

`makeDoc` factory:
```ts
const makeDoc = (id: string, name?: string): Document => ({
  id,
  name: name ?? `Doc ${id}`,
  kind: "pdf",
  scope: "trip",
  offline: false,
});
```
Current mock: `uploadDocument` only — no `markAllDocsOffline`
DocRow mock: `({ doc }) => <div data-testid="doc-row">{doc.name}</div>`

**`tests/e2e/features/documents.feature`** — 4 scenarios (Search, Delete, Upload, Rename)
**`tests/e2e/steps/documents.steps.ts`** — step defs for all 4 scenarios

---

### Task 1: Add `markAllDocsOffline` server action

**File:** `src/app/(app)/trips/[tripId]/actions.ts`

**Step 1** — Add `isNull` to the drizzle-orm import line (line 6):
```ts
import { eq, and, max, gte, sql, isNull } from "drizzle-orm";
```

**Step 2** — Append after `renameDocument` (after line 380):
```ts
export async function markAllDocsOffline(tripId: string) {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");
  await db
    .update(documents)
    .set({ offline: true })
    .where(and(eq(documents.tripId, tripId), isNull(documents.eventId)));
  revalidatePath(`/trips/${tripId}`);
}
```

**Why `isNull(documents.eventId)`?** Trip-scope documents have `tripId` set and `eventId = null`. Event-scope documents have both set (tripId inherited from event's trip, eventId set). Filtering `eventId IS NULL` ensures only trip-level docs are marked offline — event-linked docs are managed separately.

**Why no unit test for this action?** `src/app/**` is excluded from coverage. The action is validated indirectly via the `TripDocsTab` test mock (call assertion) and confirmed correct by E2E in a future story.

---

### Task 2: Add Offline Indicator to `DocRow`

**File:** `src/components/packt/doc-row.tsx`

Add the offline dot **between `DocKindBadge` and the name span/input**. This keeps it visually adjacent to the document identity.

**Implementation — offline dot element:**
```tsx
<span
  role="img"
  aria-label={doc.offline ? "Cached offline" : "Not cached offline"}
  style={{
    display: "inline-block",
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: doc.offline ? "var(--accent-brand)" : "transparent",
    border: "1px solid var(--fg-3)",
    flexShrink: 0,
  }}
/>
```

Insert this element in the JSX immediately after `<DocKindBadge kind={doc.kind} />` and before the `{isEditing ? ... : ...}` conditional.

**No new state, no new imports needed** for the indicator — it is purely a render of `doc.offline` (which is already on the `Document` type: `offline: boolean`).

**NFR4 compliance:** `role="img"` with `aria-label` provides text state; the dot's filled vs. empty appearance is a color+background change but is NOT color alone, since the aria-label explicitly states the state in text.

**NFR2 compliance:** Both the filled (`var(--accent-brand)`) and border (`var(--fg-3)`) use CSS custom properties — no hardcoded hex/rgb values.

**Gotcha — `doc.offline` vs. `displayName` tracking:** `displayName` is local state that tracks the renamed name. There is no equivalent local state for `offline` — the offline dot always renders the prop value (`doc.offline`), which updates when the parent re-fetches after `markAllDocsOffline`. This is correct; no local state needed for offline.

---

### Task 3: Add "Save All Offline" Button to `TripDocsTab`

**File:** `src/components/packt/trip-docs-tab.tsx`

**Step 1** — Add `markAllDocsOffline` to the actions import:
```ts
import { uploadDocument, markAllDocsOffline } from "@/app/(app)/trips/[tripId]/actions";
```

**Step 2** — Add a second `useTransition` for the offline save (separate from the upload transition):
```ts
const [isSavingOffline, startSaveOfflineTransition] = useTransition();
```

Add to the existing `import { useRef, useState, useTransition } from "react"` — no, `useTransition` is already imported. Just add a second `const [isSavingOffline, startSaveOfflineTransition] = useTransition();` declaration inside the component body. React allows multiple `useTransition` calls.

**Step 3** — Add the handler:
```ts
function handleSaveOffline() {
  startSaveOfflineTransition(async () => {
    await markAllDocsOffline(tripId);
  });
}
```

**Step 4** — Update the header row to accommodate the conditional button. Currently:
```tsx
<div className="flex justify-end mb-3">
  <input ... />
  <label htmlFor="doc-upload" ...>...</label>
</div>
```

Replace with:
```tsx
<div className="flex items-center justify-between mb-3">
  {docs.length > 0 && (
    <button
      onClick={handleSaveOffline}
      disabled={isSavingOffline}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "5px 10px",
        minHeight: 44,
        minWidth: 44,
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--line)",
        background: "var(--surface)",
        color: "var(--fg)",
        fontFamily: "var(--font-body, ui-sans-serif)",
        fontSize: "calc(12px * var(--font-scale))",
        fontWeight: 500,
        cursor: isSavingOffline ? "wait" : "pointer",
        opacity: isSavingOffline ? 0.5 : 1,
      }}
    >
      Save offline
    </button>
  )}
  <input
    id="doc-upload"
    ref={inputRef}
    type="file"
    accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
    style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 }}
    onChange={handleFileChange}
  />
  <label
    htmlFor="doc-upload"
    title="Add document"
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "5px 10px",
      borderRadius: "var(--radius-sm)",
      border: "1px solid var(--line)",
      background: "var(--surface)",
      color: "var(--fg)",
      fontFamily: "var(--font-body, ui-sans-serif)",
      fontSize: "calc(12px * var(--font-scale))",
      fontWeight: 500,
      cursor: isPending ? "wait" : "pointer",
      opacity: isPending ? 0.5 : 1,
    }}
  >
    <Plus size={13} strokeWidth={1.5} />
    Add
  </label>
</div>
```

**Gotcha — `justify-between` when button is absent:** When `docs.length === 0`, the "Save offline" button is not rendered, so only the Add label renders. `justify-between` on an only-child still right-aligns when using `ml-auto` — but with `justify-between` it will left-align the single child. Use `ml-auto` on the Add label instead of `justify-between` on the container to always right-align Add:

Alternative (cleaner):
```tsx
<div className="flex items-center mb-3">
  {docs.length > 0 && (
    <button ...>Save offline</button>
  )}
  <label htmlFor="doc-upload" style={{ ..., marginLeft: "auto" }}>
    <Plus ... />
    Add
  </label>
</div>
```

Use `marginLeft: "auto"` inline on the `<label>` to right-align it regardless of whether Save offline is present. This is simpler and more robust than toggling the container's justify mode.

**Gotcha — `minHeight: 44` vs `minHeight: "44px"`:** React inline styles accept numbers for unitless values or strings with units. Use the string form `"44px"` or the number `44` — either works for pixel values in inline styles. Existing patterns in this project use numbers (e.g., `minWidth: 44, minHeight: 44` in `doc-row.tsx:133-134`). Be consistent: use numbers.

**AC clarification — "Save All Offline" vs. "Save offline":** The AC says the button is "present" and references FR11's "Save All Offline" label. The visible button text should match "Save offline" for compactness while the title/accessible name says "Save all documents offline" or equivalent. Keep it consistent with the rest of the UI's terse label style (Add button is just "Add", not "Add document"). Exact label choice: "Save offline" as visible text is fine; no icon needed since it's not icon-only.

---

### Task 4: Unit Tests for `doc-row.test.tsx`

**No mock changes needed** — `markAllDocsOffline` is not called from `DocRow`.

**Add to the existing `describe("DocRow")` block:**

```ts
it("renders a 'Not cached offline' indicator when doc.offline is false", () => {
  render(<DocRow doc={makeDoc({ offline: false })} />);
  const indicator = screen.getByRole("img", { name: "Not cached offline" });
  expect(indicator).toBeInTheDocument();
});

it("renders a 'Cached offline' indicator when doc.offline is true", () => {
  render(<DocRow doc={makeDoc({ offline: true })} />);
  const indicator = screen.getByRole("img", { name: "Cached offline" });
  expect(indicator).toBeInTheDocument();
});
```

**Why `getByRole("img", { name: "..." })`?** The dot uses `role="img"` and `aria-label`, which makes it accessible as an img role. Testing Library resolves `aria-label` as the accessible name.

**Gotcha — existing tests already use `makeDoc({ offline: false })` implicitly (default):** The new tests are explicit. No existing test assertions break because none currently query for an offline indicator.

---

### Task 5: Unit Tests for `trip-docs-tab.test.tsx`

**Step 1** — Add `markAllDocsOffline` to the actions mock:
```ts
vi.mock("@/app/(app)/trips/[tripId]/actions", () => ({
  uploadDocument: vi.fn().mockResolvedValue(undefined),
  markAllDocsOffline: vi.fn().mockResolvedValue(undefined),
}));
```

**Step 2** — Add to the import line:
```ts
import { uploadDocument, markAllDocsOffline } from "@/app/(app)/trips/[tripId]/actions";
```

**Step 3** — Add tests to the `describe("TripDocsTab")` block:

```ts
it("does not render the Save offline button when docs array is empty", () => {
  render(<TripDocsTab tripId="trip-1" docs={[]} />);
  expect(screen.queryByRole("button", { name: /save offline/i })).not.toBeInTheDocument();
});

it("renders the Save offline button when at least one doc is present", () => {
  render(<TripDocsTab tripId="trip-1" docs={[makeDoc("1")]} />);
  expect(screen.getByRole("button", { name: /save offline/i })).toBeInTheDocument();
});

it("calls markAllDocsOffline with tripId when Save offline button is clicked", async () => {
  const user = userEvent.setup();
  render(<TripDocsTab tripId="trip-99" docs={[makeDoc("1")]} />);
  await user.click(screen.getByRole("button", { name: /save offline/i }));
  await waitFor(() => {
    expect(vi.mocked(markAllDocsOffline)).toHaveBeenCalledWith("trip-99");
  });
});
```

**Gotcha — button accessible name:** The test uses `{ name: /save offline/i }` (case-insensitive regex) to match the button's visible text. If the button has `title` or `aria-label` that differs from its text content, update accordingly. Keep button accessible name and visible text aligned.

**Gotcha — `waitFor` on the third test:** `markAllDocsOffline` is called inside `startTransition(async () => ...)`. The async nature requires `waitFor` to catch the call. Alternatively, `await vi.mocked(markAllDocsOffline).mock.results[0].value` but `waitFor` is cleaner.

---

### Architecture & Conventions Compliance

| Rule | How Story 1.5 Complies |
|------|----------------------|
| `"use client"` at top | Both `doc-row.tsx` and `trip-docs-tab.tsx` already have it |
| Explicit Props interface | Both already have `DocRowProps` and `TripDocsTabProps` |
| No hardcoded colors | Dot uses `var(--accent-brand)`, `var(--fg-3)`; button uses `var(--surface)`, `var(--line)`, `var(--fg)` |
| Minimum 44px touch target | Save offline button has `minHeight: 44, minWidth: 44` |
| Accessible non-color indicator | `role="img"` + `aria-label` on dot |
| Test files next to source | `doc-row.test.tsx` and `trip-docs-tab.test.tsx` in same directory |
| No new domain types needed | `Document.offline: boolean` already exists in `src/data/types.ts` |
| Server action pattern | `requireUser()` → `assertTripAccess()` → mutation → `revalidatePath()` |
| `isNull` from drizzle-orm | Must add to import line in `actions.ts` |

---

### File Changes Summary

| File | Change |
|------|--------|
| `src/app/(app)/trips/[tripId]/actions.ts` | Add `isNull` to drizzle import; add `markAllDocsOffline` action |
| `src/components/packt/doc-row.tsx` | Add offline indicator dot after `DocKindBadge` |
| `src/components/packt/trip-docs-tab.tsx` | Import `markAllDocsOffline`; add second `useTransition`; add conditional "Save offline" button |
| `src/components/packt/doc-row.test.tsx` | Add 2 tests for offline indicator |
| `src/components/packt/trip-docs-tab.test.tsx` | Add `markAllDocsOffline` to mock + import; add 3 tests |

**Files NOT touched:**
- `tests/e2e/features/documents.feature` — no E2E required for this story
- `tests/e2e/steps/documents.steps.ts` — no E2E required for this story
- `src/data/types.ts` — `Document.offline: boolean` already defined
- `src/db/schema.ts` — `offline: boolean` column already exists
- `src/lib/db-mappers.ts` — `dbDocToType` already maps `offline`

---

## Tasks / Subtasks

- [x] Task 1: Add `markAllDocsOffline` server action to `src/app/(app)/trips/[tripId]/actions.ts`
  - [x] Add `isNull` to the `drizzle-orm` import line
  - [x] Append `markAllDocsOffline` function after `renameDocument`
- [x] Task 2: Add offline indicator dot to `src/components/packt/doc-row.tsx`
  - [x] Insert `<span role="img" aria-label={...}>` between `DocKindBadge` and the name conditional
  - [x] Filled dot (`var(--accent-brand)` background) when `doc.offline === true`
  - [x] Empty dot (transparent background + `var(--fg-3)` border) when `doc.offline === false`
- [x] Task 3: Add "Save offline" button to `src/components/packt/trip-docs-tab.tsx`
  - [x] Import `markAllDocsOffline` from actions
  - [x] Add second `useTransition` (`isSavingOffline`, `startSaveOfflineTransition`)
  - [x] Add `handleSaveOffline` handler
  - [x] Update header row layout to accommodate conditional button
  - [x] Button conditionally renders only when `docs.length > 0`
  - [x] Button has `minHeight: 44, minWidth: 44` and CSS custom properties for all colors
- [x] Task 4: Update `src/components/packt/doc-row.test.tsx`
  - [x] Add test: offline indicator for `offline: false` → `aria-label="Not cached offline"`
  - [x] Add test: offline indicator for `offline: true` → `aria-label="Cached offline"`
- [x] Task 5: Update `src/components/packt/trip-docs-tab.test.tsx`
  - [x] Add `markAllDocsOffline` to mock and import
  - [x] Add test: "Save offline" button absent when docs empty
  - [x] Add test: "Save offline" button present when docs non-empty
  - [x] Add test: clicking "Save offline" calls `markAllDocsOffline("trip-99")`
- [x] Task 6: Run full validation (`npm run test:coverage`)

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

No blockers. All tasks implemented cleanly in a single pass.

### Completion Notes List

- Added `isNull` to drizzle-orm import in actions.ts; appended `markAllDocsOffline` server action that filters to trip-scope docs via `isNull(documents.eventId)`
- Added offline dot indicator (`role="img"` + `aria-label`) to `DocRow` between `DocKindBadge` and name — filled with `var(--accent-brand)` when cached, transparent with `var(--fg-3)` border when not
- Added conditional "Save offline" button to `TripDocsTab` header (only when `docs.length > 0`), with a second `useTransition`, `handleSaveOffline` handler, and `marginLeft: "auto"` on the Add label so it always right-aligns
- Added 2 tests to doc-row.test.tsx for offline indicator (offline true/false)
- Added `markAllDocsOffline` to trip-docs-tab mock and 3 new tests (absent when empty, present when docs exist, calls action with tripId)
- All 697 tests pass; coverage at 95.89% statements, 90.44% branches — meets all thresholds

### File List

- src/app/(app)/trips/[tripId]/actions.ts
- src/components/packt/doc-row.tsx
- src/components/packt/trip-docs-tab.tsx
- src/components/packt/doc-row.test.tsx
- src/components/packt/trip-docs-tab.test.tsx
