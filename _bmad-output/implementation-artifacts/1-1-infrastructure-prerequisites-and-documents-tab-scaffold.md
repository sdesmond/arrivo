---
story_id: "1.1"
story_key: "1-1-infrastructure-prerequisites-and-documents-tab-scaffold"
epic: 1
story: 1
title: "Infrastructure Prerequisites & Documents Tab Scaffold"
status: "ready-for-dev"
created: "2026-05-19"
---

# Story 1.1 — Infrastructure Prerequisites & Documents Tab Scaffold

## User Story

As a **developer**,
I want the technical prerequisites in place and an empty Documents tab rendered in the trip detail view,
So that all subsequent documents feature stories can build on a clean, correct foundation.

## Acceptance Criteria

**Given** the project needs Vercel Blob for file storage
**When** Story 1.1 is complete
**Then** `@vercel/blob` is installed and `BLOB_READ_WRITE_TOKEN=` is present in `.env.example` and `.env`

**Given** the `dbDocToType` mapper currently returns `"trip"` scope for all documents (because it checks `tripId` which is always set)
**When** the mapper is fixed
**Then** `scope` is derived as `row.eventId ? "event" : "trip"` — documents with an `eventId` return `"event"` scope, all others return `"trip"`

**Given** `place-row.tsx` is 425 lines (over the project component size limit)
**When** it is split
**Then** the inline-edit name field is extracted to `place-row-name-field.tsx` and the pill-button action bar is extracted to `place-row-action-bar.tsx`; `place-row.tsx` retains the outer container and orchestration; all existing tests still pass

**Given** the defunct `onAdd` callback chain threads through `AddDocDialog` → `place-row` → `TripItineraryView` → `page-client.tsx`
**When** it is removed
**Then** none of those files reference `onAdd` or `onAddDoc` anymore

**Given** the trip detail page currently shows "Document view coming soon."
**When** the tab is wired to a new `TripDocsTab` component
**Then** the "Document view coming soon." placeholder is replaced by the empty `TripDocsTab` rendering (initially shows the empty state or a loading scaffold); the component declares `"use client"` and has a `TripDocsTabProps` interface

**Given** E2E tests need a pre-existing trip-level document and must not hit real Blob storage
**When** Story 1.1 is complete
**Then** `e2e-seed-data.ts` includes one trip-level document for the E2E user's trip, and `playwright.config.ts` webServer env includes `UPLOAD_STUB=true`

**Given** the story implementation is complete
**When** tests are run
**Then** all existing unit tests and E2E tests continue to pass; unit tests are written for any modified files in `src/components/packt/**` or `src/lib/**` (NFR9)

---

## Dev Notes

### Critical Context: The Mapper Bug

**File:** `src/lib/db-mappers.ts`, line 73

Current (broken) code:
```ts
scope: row.tripId ? "trip" : "event",
```

Fixed code:
```ts
scope: row.eventId ? "event" : "trip",
```

**Why this is broken:** Every document row has `tripId` set (documents belong to a trip, whether trip-scoped or event-scoped). The database schema at `src/db/schema.ts:151-152` shows `tripId` and `eventId` are separate nullable FK columns. A trip-scoped doc has `tripId` set and `eventId: null`. An event-scoped doc has BOTH `tripId` AND `eventId` set. Checking `tripId` therefore always returns `"trip"`.

**Test file also needs updating:** `src/lib/db-mappers.test.ts` lines 199-205 test the wrong behavior. The current tests are:
- `"scope is trip when tripId is set"` — uses `BASE_DOC` (tripId set, eventId null) → asserts `"trip"` ✓ (happens to be correct for wrong reason)
- `"scope is event when tripId is null"` — passes `{ ...BASE_DOC, tripId: null }` → asserts `"event"` — THIS TEST IS WRONG. After the fix, `tripId: null` with `eventId: null` returns `"trip"`, not `"event"`.

Rewrite the two `scope` tests to:
```ts
it("scope is trip when eventId is null", () => {
  // tripId set, eventId null → trip-scoped
  expect(dbDocToType(BASE_DOC).scope).toBe("trip");
});

it("scope is event when eventId is set", () => {
  // both tripId and eventId set → event-scoped (eventId takes precedence)
  expect(dbDocToType({ ...BASE_DOC, eventId: "event-1" }).scope).toBe("event");
});
```

### place-row.tsx Split — Exact Extraction Boundaries

**Source:** `src/components/packt/place-row.tsx` (425 lines — the entire file content is available in analysis)

#### `place-row-name-field.tsx` — Inline-Edit Name Field

Extract the inline name row JSX block (currently lines 132–199 in the `PlaceRow` return). Create a new file `src/components/packt/place-row-name-field.tsx`:

```ts
"use client";

import { Pencil } from "lucide-react";

export interface PlaceRowNameFieldProps {
  isEditingName: boolean;
  draftName: string;
  onDraftChange: (v: string) => void;
  onBlur: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  displayName: string;
  isHovered: boolean;
  isDraft?: boolean;
  onStartEdit: () => void;
}
```

The component renders:
- When `isEditingName`: the `<input>` with `autoFocus`, styles from the original (background `var(--surface-2)`, border `var(--accent-brand)`, etc.)
- When not editing: the `<span>` with the display name + the `<Pencil>` edit button (hover-faded)

Props mirror what `PlaceRow` currently owns as state (`isEditingName`, `draftName`, hover visibility, etc.).

#### `place-row-action-bar.tsx` — Pill-Button Action Bar

Extract the `<div className="flex items-center gap-1 flex-wrap mt-2">` block (currently lines 261–349). Create `src/components/packt/place-row-action-bar.tsx`:

```ts
"use client";

import { Clock, MapPin, DollarSign, FileText, ChevronDown, Paperclip } from "lucide-react";
import type { TripEvent } from "@/data/types";

export interface PlaceRowActionBarProps {
  place: TripEvent;
  showDocs: boolean;
  onToggleDocs: () => void;
  onOpenTime: () => void;
  onOpenLocation: () => void;
  onOpenCost: () => void;
  onOpenAddDoc: () => void;
}
```

The component renders the four pill buttons: Time, Location, Cost, Docs/Attach. No state — all state lives in `PlaceRow`.

#### `place-row.tsx` After Split

`place-row.tsx` retains:
- All state declarations (`isEditingName`, `draftName`, `isEditingNote`, `showDocs`, `isHovered`, dialog open states)
- All handler functions (`saveName`, `saveNote`)
- The outer container `<div className="group relative">`
- The drag handle
- The delete (trash) button
- The `DocsBlock` render (when `showDocs && hasDocs`)
- The note area (currently inline, can stay in place-row since it's small)
- All four `Dialog` components at the bottom (`TimeDialog`, `CostDialog`, `LocationDialog`, `AddDocDialog`)

Uses `<PlaceRowNameField>` and `<PlaceRowActionBar>` in the right spots.

**Important:** All existing `place-row.test.tsx` tests must continue to pass. The test file mocks `DocsBlock`, `TimeDialog`, `CostDialog`, `LocationDialog`, and `AddDocDialog` — these mocks remain valid. The new sub-components may need their own mocks in `place-row.test.tsx` if they are imported there, or simply stub them similarly.

### Defunct onAdd/onAddDoc Callback Chain — Full Removal Map

These props/handlers must be completely removed. **Do not replace with anything in Story 1.1** — the real doc-attachment flow is rebuilt from scratch in Stories 1.2 and 3.1.

| File | What to remove |
|------|----------------|
| `src/components/packt/add-doc-dialog.tsx` | `onAdd: (doc: Document) => void` from `AddDocDialogProps`; `onAdd` destructuring; the `onAdd(...)` call in `handleAdd()`; the import of `Document` type (check if it's still needed — `DocKind` is still used). The dialog `handleAdd` function will now just call `handleClose(false)` after validation (becomes a no-op shell). |
| `src/components/packt/place-row.tsx` | `onAddDoc?: (eventId: string, input: {...}) => void` from `PlaceRowProps`; `onAddDoc` destructuring; the `onAddDoc?.(p.id, {...})` call in the `AddDocDialog onAdd` handler (pass `onAdd` as a no-op or remove the prop from `AddDocDialog` usage — see below). |
| `src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx` | `onAddDoc` from `TripItineraryViewProps` interface; `onAddDoc` destructuring; `onAddDoc={onAddDoc}` passed to `DayCard`. |
| `src/components/packt/day-card.tsx` | `onAddDoc?: (...)` from the interface; `onAddDoc` destructuring and the `onAddDoc={onAddDoc}` passed to `PlaceRow`. |
| `src/app/(app)/trips/[tripId]/page-client.tsx` | `handleAddDoc` function; `addDocument` import (remove from the actions import list if no longer used); `onAddDoc={handleAddDoc}` prop on `TripItineraryView`. |

**After removal:** `AddDocDialog` still exists and opens when user clicks "Attach" on an event row, but submitting it does nothing (just closes). This is acceptable state for Story 1.1 — it's a scaffold. Story 3.1 rebuilds the full pick-list flow.

**`AddDocDialog` after removal:** The `handleAdd` function becomes:
```ts
function handleAdd() {
  const name = draftName.trim();
  if (!name) return;
  handleClose(false); // no-op until Story 3.1 adds real attachment
}
```
Remove the `Document` import and `scope: "event"` assignment — confirm `DocKind` import is kept (still used for `draftKind` state and kind selector buttons).

### TripDocsTab Component

**New file:** `src/components/packt/trip-docs-tab.tsx`

```ts
"use client";

import type { Document } from "@/data/types";

export interface TripDocsTabProps {
  docs: Document[];
}

export function TripDocsTab({ docs }: TripDocsTabProps) {
  if (docs.length === 0) {
    return (
      <div style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--fg-2)" }}>
        Add your first trip document — boarding passes, insurance, visas, and more.
      </div>
    );
  }

  // Scaffold: real list rendering comes in Story 1.2
  return (
    <div style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--fg-2)" }}>
      {docs.length} document{docs.length !== 1 ? "s" : ""}
    </div>
  );
}
```

**Split `page-client.tsx` first (required — file is 398 lines):** Before wiring TripDocsTab, extract `TripDetailTabBody` to a new sibling file `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx`. This client component receives `activeTab`, `days`, `docs`, and all handler callbacks, and renders the appropriate tab content. `page-client.tsx` keeps state declarations, handler function definitions, and renders `<TripDetailTabBody>`. This brings `page-client.tsx` to roughly 230 lines. `TripDetailTabBody` is in `src/app/**` and excluded from coverage — no test required.

**Wire into `page-client.tsx`** (after split): Inside `TripDetailTabBody`, replace the "Document view coming soon." block with:

```tsx
{activeTab === "docs" && (
  <TripDocsTab docs={docs.filter((d) => d.scope === "trip")} />
)}
```

Add import: `import { TripDocsTab } from "@/components/packt/trip-docs-tab";`

**Note on filtering:** `detail.docs` from `getTripDetail` in `queries.ts` fetches ALL documents for the trip (`eq(documents.tripId, tripId)`) — including those attached to events (which also carry `tripId`). After the mapper fix, event-attached docs have `scope: "event"`. Filter to `scope === "trip"` before passing to `TripDocsTab`.

### E2E Seed Data

**`tests/e2e/e2e-seed-data.ts`** — Add:
```ts
export const E2E_DOCUMENT = {
  name: "E2E Boarding Pass",
  kind: "pdf",
  size: "1.2 MB",
  url: "https://example.com/boarding-pass.pdf",
};
```

**`tests/e2e/global-setup.ts`** — Changes:
1. Add `documents` to the import from `../../src/db/schema`: `import { users, trips, days, collaborators, userLoyaltyNumbers, userCompanions, documents } from "../../src/db/schema";`
2. Add `E2E_DOCUMENT` to the import from `./e2e-seed-data`
3. After the trip is inserted, seed the document:
```ts
await db.insert(documents).values({
  tripId: trip.id,
  ...E2E_DOCUMENT,
});
```

This gives E2E tests a pre-existing trip-level document (no `eventId` → `scope: "trip"` after mapper fix).

### playwright.config.ts — UPLOAD_STUB

Add `UPLOAD_STUB: "true"` to the webServer `env` block:

```ts
env: {
  DATABASE_URL: process.env.E2E_DATABASE_URL!,
  NEXT_DISTDIR: ".next-e2e",
  UPLOAD_STUB: "true",
},
```

### @vercel/blob Installation

Run: `npm install @vercel/blob`

In `.env.example`, add:
```
BLOB_READ_WRITE_TOKEN=
```

In `.env` (local dev), add:
```
BLOB_READ_WRITE_TOKEN=
```
(Leave value empty for now — actual token is not needed until Story 1.2 wires up real uploads. The stub env var prevents any accidental calls.)

---

## Testing Requirements

### Unit Tests Required

#### 1. `src/lib/db-mappers.test.ts` — Scope tests update
- **UPDATE** the two `scope` tests in `describe("dbDocToType")` to test the correct (fixed) behavior (see mapper bug section above)
- All other existing tests in this file should pass unchanged

#### 2. `src/components/packt/trip-docs-tab.test.tsx` — New file
Required test cases:
```
describe("TripDocsTab")
  - renders empty state message when docs array is empty
  - renders doc count when docs are present
  - empty state message exact text matches "Add your first trip document — boarding passes, insurance, visas, and more."
```

#### 3. `src/components/packt/add-doc-dialog.test.tsx` — Update after onAdd removal

`add-doc-dialog.test.tsx` uses `onAdd={vi.fn()}` in every render call (13 occurrences) and asserts `onAdd` was called with specific doc objects in four tests. Removing `onAdd` from `AddDocDialogProps` breaks all of these. Required updates:
- Remove `onAdd={vi.fn()}` from all render calls (no replacement prop needed)
- Replace tests that assert `onAdd` was called with assertions that `onOpenChange(false)` is called when Attach is clicked with a valid name (the dialog now just closes itself)
- Retain tests for the empty-name guard (Attach disabled / no close), URL field visibility, kind selector buttons, and backdrop-close behavior
- The test "calls onAdd with doc object when name is filled and Attach is clicked" should become "calls onOpenChange(false) when Attach is clicked with a valid name"

#### 4. `src/components/packt/place-row.test.tsx` — Update mocks after split
After extracting `place-row-name-field.tsx` and `place-row-action-bar.tsx`, the `place-row.test.tsx` may need to mock these new sub-components if they're imported by `PlaceRow`. Add mocks similar to the existing `DocsBlock` mock. All existing test cases must still pass.

After removing `onAddDoc` from `PlaceRowProps`, verify no test passes `onAddDoc` in the test helper setup — update the mock if so.

#### 4. `src/components/packt/place-row-name-field.test.tsx` — New file (if substantive logic)
If `PlaceRowNameField` contains meaningful rendering logic (editing/non-editing states), test:
- Renders display name when not editing
- Renders input when editing (with correct placeholder behavior)
- onBlur calls onBlur prop
- Enter key calls onKeyDown prop

#### 5. `src/components/packt/place-row-action-bar.test.tsx` — New file (if substantive logic)
If `PlaceRowActionBar` has conditional rendering logic, test:
- Shows time pill with "Add time" when no startAt
- Shows docs pill when hasDocs
- Shows Attach pill when no docs
- Clicking each pill calls the correct callback

### E2E Tests

Story 1.1 is infrastructure — no new E2E scenarios needed. However, the existing E2E suite must pass:
- `npm run test:e2e` must pass cleanly with the new seed data
- Verify that seeding the document doesn't break the trips or day-planning feature tests

The Documents tab itself will get E2E scenarios in Stories 1.2 and 1.3.

---

## Architecture Compliance Checklist

- [ ] `"use client"` is the first line of `trip-docs-tab.tsx`, `place-row-name-field.tsx`, `place-row-action-bar.tsx`
- [ ] All new components define an explicit `ComponentNameProps` interface before the function
- [ ] All props are destructured in the function signature
- [ ] `cn()` is used for className merging if multiple classes are combined (use `@/lib/utils`)
- [ ] Colors use CSS custom properties only — no hardcoded hex/rgb
- [ ] No `any` types; no single-letter variable names
- [ ] All domain types imported from `@/data/types`, not redefined
- [ ] `Document` import removed from `add-doc-dialog.tsx` if no longer needed after `onAdd` removal (check — `DocKind` is still needed)
- [ ] No new DB queries or types introduced — this story only touches existing infrastructure

---

## Implementation Order (Recommended)

1. **`@vercel/blob` install + env files** — quick, no code risk
2. **Fix `dbDocToType` mapper + update tests** — isolated change, run `npm test` to verify
3. **Split `place-row.tsx`** — extract name field and action bar; run `npm test` after each extraction
4. **Remove `onAdd`/`onAddDoc` chain** — work from `AddDocDialog` outward (`AddDocDialog` → `place-row` → `day-card` → `trip-itinerary-view` → `page-client`); update `add-doc-dialog.test.tsx`; run `npm test` after
5. **Split `page-client.tsx`** — extract `TripDetailTabBody` to `trip-detail-tab-body.tsx`; verify existing E2E still passes
6. **Create `TripDocsTab` + wire into `TripDetailTabBody`** — add unit tests
7. **E2E seed + playwright.config.ts** — update `e2e-seed-data.ts`, `global-setup.ts`, `playwright.config.ts`
8. **Run full test suite** — `npm run test:coverage` + `npm run test:e2e`

---

## Files to Create

| File | Type |
|------|------|
| `src/components/packt/trip-docs-tab.tsx` | New component |
| `src/components/packt/trip-docs-tab.test.tsx` | New unit test |
| `src/components/packt/place-row-name-field.tsx` | New component (split) |
| `src/components/packt/place-row-action-bar.tsx` | New component (split) |
| `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx` | New route component (page-client.tsx split) |

## Files to Modify

| File | Change |
|------|--------|
| `src/lib/db-mappers.ts` | Fix `dbDocToType` scope logic (line 73) |
| `src/lib/db-mappers.test.ts` | Update two scope tests in `describe("dbDocToType")` |
| `src/components/packt/place-row.tsx` | Split out sub-components; remove `onAddDoc` |
| `src/components/packt/add-doc-dialog.tsx` | Remove `onAdd` prop; make `handleAdd` a no-op close |
| `src/components/packt/day-card.tsx` | Remove `onAddDoc` from interface and prop passthrough |
| `src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx` | Remove `onAddDoc` from interface and passthrough |
| `src/app/(app)/trips/[tripId]/page-client.tsx` | Remove `handleAddDoc`; import `TripDocsTab`; wire docs tab |
| `tests/e2e/e2e-seed-data.ts` | Add `E2E_DOCUMENT` export |
| `tests/e2e/global-setup.ts` | Import `documents` table + `E2E_DOCUMENT`; seed the doc |
| `playwright.config.ts` | Add `UPLOAD_STUB: "true"` to webServer env |
| `.env.example` | Add `BLOB_READ_WRITE_TOKEN=` |
| `.env` | Add `BLOB_READ_WRITE_TOKEN=` (empty value, local only) |

---

## Potential Gotchas

1. **`addDocument` import in `page-client.tsx`**: After removing `handleAddDoc`, check whether `addDocument` is still used elsewhere in `page-client.tsx`. If not, remove it from the import list to avoid unused import lint errors.

2. **`place-row.test.tsx` mocks the `AddDocDialog`**: The current mock includes `onAdd` in its props type. After removing `onAdd`, update the mock type signature so it doesn't reference the removed prop.

3. **`day-card.tsx` also passes `onAddDoc` to `PlaceRow`**: Confirmed at `day-card.tsx` line 44. This entire chain must be cleaned up in the same pass.

4. **`Document` type import in `add-doc-dialog.tsx`**: After removing `onAdd: (doc: Document) => void`, `Document` is no longer referenced in the file. Remove the import to avoid unused import lint error. `DocKind` is still used.

5. **E2E `global-setup.ts` truncation statement**: The truncation at line 14 already includes `documents` in the cascade. No change needed there.

6. **`place-row-name-field` keyboard handler**: The `onKeyDown` in the name input currently has logic for both `isDraft` (creates a new event) and non-draft (editing existing) modes. Keep that logic in `PlaceRow`'s `saveName` function and pass it as a handler — don't duplicate the conditional logic in the sub-component.

7. **`@vercel/blob` version**: Install without specifying a version to get the latest stable: `npm install @vercel/blob`. Do not stub or mock anything in the package for Story 1.1 — the stub env var is handled at the server action level in Story 1.2.

---

*Completion note: Ultimate context engine analysis completed — comprehensive developer guide created*
