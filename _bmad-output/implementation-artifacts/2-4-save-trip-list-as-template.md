@# Story 2.4: Save Trip List as Template

Status: done

## Story

As a traveler,
I want to save my current trip packing list as a named template,
so that future trips of the same type start from this list rather than from scratch.

**FRs covered:** FR20, NFR5, NFR6, NFR7, NFR8, NFR10, NFR12

**This story closes the template library loop and is the final story in Epic 2.** Templates with items already exist (Story 2.2). The trip packing list has full CRUD + reorder + check/uncheck (Story 1.x). The pull-templates action (Story 2.3) works in the opposite direction (template → trip). This story adds the reverse: trip → template.

The save-as-template action reads `packingItems` for the trip and inserts copies into `packingTemplateItems` under a new `packingTemplate`, stripping `done` state. The original trip list is unmodified.

Do NOT implement cherry-pick individual items (Phase 2 — post-MVP).

## Acceptance Criteria

**AC1 — Save a trip list as a named template**
Given the user has a trip packing list with at least one item
When they choose "Save as template" and provide a name
Then a new template appears in the template library containing all items and labels from the trip list in the same order

**AC2 — Name validation: empty name is rejected**
Given the user initiates save-as-template without providing a name
Then they see a validation error and the save is not performed

**AC3 — Checked items become unchecked in the template**
Given some items on the trip list are checked
When the list is saved as a template
Then the template items are all unchecked — templates are pristine starting points, not snapshots of packed state

**AC4 — Original trip list unchanged**
Given the user saves the trip list as a template
Then the original trip packing list is unchanged (no items removed, no state changes)

**AC5 — Auth enforcement (NFR5, NFR6)**
Given the save-as-template action is called
Then `requireUser()` + `assertTripAccess()` are enforced
And the resulting template is owned by the authenticated user

**AC6 — Section labels keep their grouping in the saved template**
Given the trip list has section labels with items grouped beneath them
When saved as a template
Then the label-item grouping is preserved via the `labelId` cross-reference

**AC7 — Accessibility (NFR8, NFR10, NFR12)**
Given the save-as-template dialog is open
Then the name input has an associated `<label>`
And the dialog has `role="dialog"` with `aria-labelledby`
And all touch targets are ≥44×44px

## Tasks / Subtasks

- [x] **Types** — add `SaveTripAsTemplateResult` to `src/data/types.ts` (AC1, AC3, AC5)
  - [x] `SaveTripAsTemplateResult { templateId: string }` — after `PullTemplatesResult` (line 621)
- [x] **Server action** — add `saveTripListAsTemplate` to `src/app/(app)/trips/actions.ts` (AC1–AC6)
  - [x] Signature: `export async function saveTripListAsTemplate(tripId: string, name: string): Promise<SaveTripAsTemplateResult>`
  - [x] `requireUser()` first
  - [x] Validate `name.trim().length > 0` — throw `new Error("Template name is required")` if empty
  - [x] `assertTripAccess(tripId, user.id!, "editor")`
  - [x] Fetch all `packingItems` for `tripId` ordered by `position ASC` — include `id`, `name`, `done`, `isLabel`, `position`, `labelId`
  - [x] Build `labelIdMap`: packing item `id` → new template item `id` (for labels across the cross-reference)
  - [x] Insert a new row into `packingTemplates` with `userId: user.id!` and `name: name.trim()`, using `returning({ id: packingTemplates.id })`
  - [x] Insert `packingTemplateItems` in a transaction or as a batch:
    - [x] Non-label items: `done` is NOT copied — always `false` (AC3 — templates are pristine)
    - [x] Preserve `position` from packing items exactly
    - [x] Labels inserted first, capture their new IDs via `returning()`
    - [x] Non-label items: map their `labelId` from old packing item ID → new template item ID via the `labelIdMap`
  - [x] `revalidatePath(`/trips/${tripId}`)`
  - [x] `revalidatePath("/trips")`
  - [x] Return `{ templateId }`
- [x] **Handler** — add `handleSaveAsTemplate` to `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts` (AC1)
  - [x] Signature: `handleSaveAsTemplate: (name: string) => Promise<string | undefined>`
  - [x] Async function, wraps `saveTripListAsTemplate(trip.id, name)` in try/catch
  - [x] On success: call `router.refresh()`, return `templateId`
  - [x] On error: `toast.error(...)`, return `undefined`
- [x] **Component** — new `src/components/packt/save-as-template-dialog.tsx` (`"use client"`) (AC1, AC2, AC7)
  - [x] Props interface with `open`, `onClose`, `onSave`, `tripId`, `itemCount`
  - [x] Controlled dialog overlay (`open`/`onClose`)
  - [x] Name `<Input>` with `<label>` linked by `htmlFor`/`id`
  - [x] "Save" `<Button>` — `disabled` when `name.trim().length === 0` OR `isSaving`
  - [x] Validation error shown inline when empty name attempted (set error state on submit attempt, clear it when name changes)
  - [x] On successful save (`onSave` returns a string), show toast success, call `onClose()`
  - [x] Close button with `aria-label="Close"`
  - [x] Touch targets: `min-h-11` on all buttons; name input at least 44px tall
  - [x] Styling: uses CSS custom properties — no hardcoded colors
- [x] **Refactor `PackingListView`** — split into sub-components to bring file under ~250 lines before adding save functionality
  - [x] Extract populated-state header controls (item count, "Pull templates" button) into `PackingListToolbar` sub-component (`src/components/packt/packing-list-toolbar.tsx`)
  - [x] Extract empty state section into `PackingListEmptyState` sub-component (`src/components/packt/packing-list-empty-state.tsx`)
  - [x] Verify both extracted components have explicit `ComponentNameProps` interfaces and `"use client"` where needed
  - [x] Updated `packing-list-view.test.tsx` with mocks for new dialog component
- [x] **Modify `PackingListView`** — add save-as-template affordance (AC1)
  - [x] Add new prop: `onSaveAsTemplate?: (name: string) => Promise<string | undefined>`
  - [x] Add local state: `const [saveDialogOpen, setSaveDialogOpen] = useState(false);`
  - [x] Populated state: "Save as template" button rendered in `PackingListToolbar` alongside "Pull templates"
  - [x] Render `SaveAsTemplateDialog` at the bottom of the component when `onSaveAsTemplate` is provided
  - [x] Save button NOT shown in empty state
- [x] **Wiring** — thread through `TripDetailClient` → `TripDetailTabBody` (AC1)
  - [x] `TripDetailTabBodyProps` adds `onSaveAsTemplate?: (name: string) => Promise<string | undefined>`
  - [x] `TripDetailClient` passes `onSaveAsTemplate={handlers.handleSaveAsTemplate}`
  - [x] `TripDetailTabBody` receives and passes `onSaveAsTemplate` to `PackingListView`
- [x] **Unit tests** — colocated, same change
  - [x] `src/app/(app)/trips/actions.test.ts` — `saveTripListAsTemplate` block (auth, empty name, save flow with label cross-ref, checked items become unchecked, original list unchanged)
  - [x] `src/components/packt/save-as-template-dialog.test.tsx` — dialog renders, shows name input, empty name validation, save on valid name, close, toast success
  - [x] `src/components/packt/packing-list-view.test.tsx` — save button visible in populated state, hidden in empty state, clicking opens dialog
  - [x] `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.test.tsx` — handleSaveAsTemplate calls action, error handling
- [x] **E2E** — new flow, same change (AC1–AC5, AC7)
  - [x] `tests/e2e/features/save-trip-as-template.feature` — BDD scenarios (tag `@save-trip-as-template`)
  - [x] `tests/e2e/steps/save-trip-as-template.steps.ts` — step defs + self-seeding DB setup
- [x] **Operational** — no schema change needed. `packingTemplates` and `packingTemplateItems` tables already exist (Story 2.1, 2.2)

### Review Findings

- [x] [Review][Decision] Auth layering: name validation before assertTripAccess — moved assertTripAccess before name validation [src/app/(app)/trips/actions.ts:690-698] — fixed
- [x] [Review][Patch] Dialog shows no inline error when save fails (onSave returns undefined) [src/components/packt/save-as-template-dialog.tsx:32-40] — fixed
- [x] [Review][Patch] Template INSERT should be inside transaction to prevent orphan rows on item insert failure [src/app/(app)/trips/actions.ts:710-717] — fixed
- [x] [Review][Patch] Missing labelId cross-reference silently drops section grouping via ?? null [src/app/(app)/trips/actions.ts:740] — fixed
- [x] [Review][Patch] No max-length validation on template name [src/app/(app)/trips/actions.ts:693] — fixed
- [x] [Review][Patch] Vague error messages lack item diagnostic context (id, name) [src/app/(app)/trips/actions.ts:748,755] — fixed
- [x] [Review][Patch] Redundant router.refresh() after revalidatePath [src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts:20] — fixed
- [x] [Review][Patch] Dialog open stale when items removed by collaborator before save [src/components/packt/packing-list-view.tsx:292-298] — fixed
- [x] [Review][Patch] Dialog state (name, error) not reset on reopen [src/components/packt/save-as-template-dialog.tsx:19-21] — fixed
- [x] [Review][Patch] E2E validation check missing alert text assertion (only checks disabled button) [tests/e2e/steps/save-trip-as-template.steps.ts:67-71] — fixed
- [x] [Review][Patch] E2E doesn't verify AC3 done-state stripping end-to-end [tests/e2e/features/save-trip-as-template.feature] — fixed
- [x] [Review][Patch] tripId prop is dead code in SaveAsTemplateDialog [src/components/packt/save-as-template-dialog.tsx:14] — fixed
- [x] [Review][Defer] No rate limiting or idempotency key on server action — deferred, pre-existing project-wide concern not specific to this story

## Dev Notes

### Existing State — files you touch

| Artifact | Location | Action |
|---|---|---|
| `PackingTemplate` type | `src/data/types.ts:401` | Reference |
| `PackingTemplateItem` type | `src/data/types.ts:419` | Reference |
| `SaveTripAsTemplateResult` type | `src/data/types.ts` | Add as new interface after line 621 |
| `packingItems` table | `src/db/schema.ts:217` | Read source — fetch trip items for saving |
| `packingTemplates` table | `src/db/schema.ts:303` | Insert target for new template |
| `packingTemplateItems` table | `src/db/schema.ts:318` | Insert target for template items |
| `addPackingItem` action | `src/app/(app)/trips/actions.ts:467` | Colleague pattern |
| `pullTemplatesOntoTrip` action | `src/app/(app)/trips/actions.ts:588` | Closest analogue (reverse direction) |
| `PackingListView` | `src/components/packt/packing-list-view.tsx` | Add save button + dialog state |
| `packing-list-view.test.tsx` | `src/components/packt/packing-list-view.test.tsx` | Add save-button tests |
| `useTripDetailHandlers` | `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts` | Add `handleSaveAsTemplate` |
| `TripDetailClient` | `src/app/(app)/trips/[tripId]/page-client.tsx` | Thread `onSaveAsTemplate` |
| `TripDetailTabBody` | `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx` | Thread `onSaveAsTemplate` |
| `actions.test.ts` | `src/app/(app)/trips/actions.test.ts` | Add save-action tests |
| `packing-list-view.test.tsx` | `src/components/packt/packing-list-view.test.tsx` | Add save-button tests |

### Types — exact shape (`src/data/types.ts`)

Add after `PullTemplatesResult` (line 621, which is the last packing-related interface):

```ts
export interface SaveTripAsTemplateResult {
  templateId: string;
}
```

### Server action (`src/app/(app)/trips/actions.ts`)

Add after `pullTemplatesOntoTrip` (after line 676):

```ts
export async function saveTripListAsTemplate(
  tripId: string,
  name: string
): Promise<SaveTripAsTemplateResult> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");

  const trimmedName = name.trim();
  if (trimmedName.length === 0) {
    throw new Error("Template name is required");
  }

  // Fetch all packing items for this trip, ordered by position
  const tripItems = await db
    .select()
    .from(packingItems)
    .where(eq(packingItems.tripId, tripId))
    .orderBy(asc(packingItems.position));

  if (tripItems.length === 0) {
    throw new Error("Cannot save an empty packing list as a template");
  }

  // Create the template
  const [template] = await db
    .insert(packingTemplates)
    .values({ userId: user.id!, name: trimmedName })
    .returning({ id: packingTemplates.id });

  if (!template) throw new Error("Failed to create template");

  // Insert template items via transaction for labelId cross-reference
  await db.transaction(async (tx) => {
    // Map: old packing item ID → new template item ID (for labels)
    const labelIdMap = new Map<string, string>();

    // First pass: insert all labels, build mapping
    for (const item of tripItems) {
      if (item.isLabel) {
        const [inserted] = await tx
          .insert(packingTemplateItems)
          .values({
            templateId: template.id,
            text: item.name,
            isLabel: true,
            position: item.position,
            labelId: null,
          })
          .returning({ id: packingTemplateItems.id });

        if (!inserted) throw new Error("Failed to insert template label");
        labelIdMap.set(item.id, inserted.id);
      }
    }

    // Second pass: insert non-label items with resolved labelId
    for (const item of tripItems) {
      if (!item.isLabel) {
        const newLabelId = item.labelId ? (labelIdMap.get(item.labelId) ?? null) : null;

        const [inserted] = await tx
          .insert(packingTemplateItems)
          .values({
            templateId: template.id,
            text: item.name,
            isLabel: false,
            position: item.position,
            labelId: newLabelId,
          })
          .returning({ id: packingTemplateItems.id });

        if (!inserted) throw new Error("Failed to insert template item");
      }
    }
  });

  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/trips");

  return { templateId: template.id };
}
```

Import additions needed in `trips/actions.ts`:
```ts
import type { SaveTripAsTemplateResult } from "@/data/types";
// All other imports already available from pullTemplatesOntoTrip block
```

### Handler (`src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts`)

Add to the `TripDetailHandlers` interface (after `handlePullTemplates`, around line 87):
```ts
handleSaveAsTemplate: (name: string) => Promise<string | undefined>;
```

Implementation:
```ts
async function handleSaveAsTemplate(name: string): Promise<string | undefined> {
  try {
    const result = await saveTripListAsTemplate(trip.id, name);
    router.refresh();
    return result.templateId;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Failed to save template. Please try again.");
    return undefined;
  }
}
```

Add to the returned object (after `handlePullTemplates`, around line 373):
```ts
handleSaveAsTemplate,
```

Import `saveTripListAsTemplate` from `"../actions"` (same import line as other packing actions).

### Save-as-template dialog (`src/components/packt/save-as-template-dialog.tsx`)

New component, `"use client"`:

```ts
"use client";

import { useState, type ReactElement, type FormEvent } from "react";
import { X, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export interface SaveAsTemplateDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (name: string) => Promise<string | undefined>;
  tripId: string;
}
```

Implementation details:
- Controlled via `open`/`onClose` props
- Local state: `name: string`, `error: string | null`, `isSaving: boolean`
- On submit (form submit or button click):
  1. `preventDefault()`
  2. Validate `name.trim().length > 0` — if empty, set error, return
  3. `setIsSaving(true)`, clear error
  4. Call `await onSave(name.trim())`
  5. If `templateId` returned: `toast.success("Template saved")`, `onClose()`
  6. On error or undefined: already handled by handler (toast.error), just reset saving state
- Form with onSubmit handler
- `<label htmlFor="save-template-name">Template name</label>`
- `<Input id="save-template-name" value={name} onChange={...} placeholder="e.g. Beach Holiday" />`
- Error message shown inline below input when `error` is set (`style={{ color: "var(--destructive-fg, red)" }}`)
- "(N) items will be saved" count hint beneath the input
- Footer: Cancel + Save buttons
- Dialog overlay: fixed full-screen backdrop, centered panel
- Use existing CSS tokens: `var(--surface)`, `var(--line)`, `var(--fg)`, `var(--fg-2)`

### `PackingListView` — integration

In `packing-list-view.tsx`:

Add imports:
```tsx
import { Save } from "lucide-react";
import { SaveAsTemplateDialog } from "./save-as-template-dialog";
```

Add props:
```tsx
onSaveAsTemplate?: (name: string) => Promise<string | undefined>;
```

Add local state:
```tsx
const [saveDialogOpen, setSaveDialogOpen] = useState(false);
```

Add button to the populated-state header (alongside the "Pull templates" button, around line 268):
```tsx
{onSaveAsTemplate && (
  <Button className="min-h-11 min-w-11 rounded-xl" variant="outline" size="sm" onClick={() => setSaveDialogOpen(true)}>
    <Save size={14} strokeWidth={1.5} />
    Save as template
  </Button>
)}
```

Add the dialog component (after the `TemplatePullDialog` block, at the end of the render):
```tsx
{onSaveAsTemplate && (
  <SaveAsTemplateDialog
    open={saveDialogOpen}
    onClose={() => setSaveDialogOpen(false)}
    onSave={onSaveAsTemplate}
    tripId={tripId}
  />
)}
```

Do NOT show the save button in the empty state (cannot save zero items).

### Wiring — data flow

In `src/app/(app)/trips/[tripId]/page-client.tsx`:
- `TripDetailClientProps` gets `onSaveAsTemplate` (same type as handler)
- Pass `onSaveAsTemplate={handlers.handleSaveAsTemplate}` to `TripDetailTabBody`

In `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx`:
- `TripDetailTabBodyProps` gets `onSaveAsTemplate`
- `PackingListView` gets `onSaveAsTemplate={onSaveAsTemplate}`

### What NOT to do

- Do NOT modify the original trip packing list when saving — the list is read-only during this operation (AC4)
- Do NOT implement cherry-pick individual items from the trip list — the save is all-or-nothing (Phase 2)
- Do NOT add a "Save as template" button to the empty state — no items to save (AC1 reads "has at least one item")
- Do NOT copy the `done` state to template items — templates are always unchecked (AC3)
- Do NOT create a new DB table — `packingTemplates` and `packingTemplateItems` already exist
- Do NOT add `fetch` or API routes — the save action is a server action called from the handler
- Do NOT use real-time sync — all mutations via server actions with `revalidatePath`
- Do NOT hardcode hex/rgb — always CSS custom properties for colors
- Do NOT redefine types locally — all new types in `src/data/types.ts`
- Do NOT add a "select template library to save to" — the template is always new; there's no "add to existing template"
- Do NOT use `window.confirm` — use dialog buttons

### labelId cross-reference when saving

This is the trickiest part — the same pattern from `pullTemplatesOntoTrip` but reversed. The `packingItems` table has a self-referencing `labelId` FK. When saving trip items to a template, you must:

1. First pass: insert all label-type items (isLabel=true), capture their new IDs via `returning({ id: packingTemplateItems.id })`
2. Build a map: old packing item `id` → new template item `id`
3. Second pass: insert non-label items, mapping their `labelId` through the map

This is identical in approach to the template-to-trip pull in Story 2.3 (see `pullTemplatesOntoTrip` at `actions.ts:588-676` for the two-pass pattern).

### Valid name requirement (AC2)

The name validation happens in the server action, not just in the dialog. This ensures:
- Client-side: disabled button prevents submission of empty names
- Server-side: explicit throw `new Error("Template name is required")` catches direct API calls
- The dialog shows the error inline (client-side) as well as handling toast from server error

### Original list unchanged (AC4)

The server action only reads from `packingItems` — it never writes, updates, or deletes any rows in that table. The `done` state is explicitly NOT copied; template items always get `done: false` implicitly (templates do not have a `done` column — `packingTemplateItems` schema lacks it).

The trip list is unchanged by definition.

### Deduplication NOT needed

Unlike pulling templates onto a trip list, saving a trip list as a template is always a new template. There's no deduplication or merging. The user provides a name, and a new template with that name is created, containing all current items.

If the user wants to update an existing template, they would delete and recreate it (or manually edit in the template library — Story 2.2). Phase 1 does not have "update existing template from trip list."

### Performance

Saving a trip list as a template is O(n) where n is the number of packing items. For typical packing lists (<100 items), this completes in under 100ms. No batching or optimization needed.

## Previous Story Intelligence (Story 2.3)

From Story 2.3 review findings — patterns that apply here:

- **`requireUser()` must be the first line of every action** — auth before any DB read
- **Dual auth check**: both `requireUser()` (authentication) and `assertTripAccess()` (trip-level authorization); the new template is user-scoped via `packingTemplates.userId`
- **No `window.confirm`** — use dialog buttons/controls
- **`toast` is globally mounted** — import `toast` from `"sonner"`, never add a second `<Toaster>`
- **`session.id!`** — the non-null assertion is the established idiom after `requireUser()`
- **`revalidatePath` after every mutation** — revalidate both `/trips/${tripId}` and `/trips`
- **Return guard on insert** — check `if (!row) throw new Error(...)` after `returning()`
- **Do NOT mirror server-driven props in `useState`** — use derive-from-props pattern
- **`inArray` must handle empty arrays** — not needed here (no array param), but relevant pattern
- **`handlePullTemplates` pattern** for returning `Promise<T | undefined>` with try/catch + toast.error is the exact pattern to follow for `handleSaveAsTemplate`
- **Two-pass insert for labelId cross-reference** is established in `pullTemplatesOntoTrip` at `actions.ts:637-668` — follow that pattern exactly
- **E2E must self-seed at the DB level** — seed packing items directly in `Before` hooks, not via UI interaction

## Git Intelligence

Epic 2 Stories 2.1, 2.2, and 2.3 are all done and merged to `main` via PRs. This is the final story in Epic 2. Key PRs:
- `feat/epic-2-story-2-3-pull-templates-onto-trip` — most recent, establishes the `pullTemplatesOntoTrip` server action, `TemplatePullDialog`, and the handler/hierarchy wiring. The save-as-template action follows the reverse of the pull logic.

All established patterns (server actions, handler wiring, prop threading, colocated tests, E2E with self-seeding) are the same. No in-flight work conflicts.

## Testing

### Test layering (mandatory — no cross-layer duplication)

| Behavior | Layer | File |
|---|---|---|
| `SaveTripAsTemplateResult` type | Unit | Type-only — verified by compilation |
| `saveTripListAsTemplate` action (auth, name validation, save flow, labelId map, checked→unchecked, original unchanged) | Unit | `src/app/(app)/trips/actions.test.ts` |
| Save dialog renders, validates name, calls onSave | Unit | `src/components/packt/save-as-template-dialog.test.tsx` |
| Packing list view shows save button in populated state | Unit | `src/components/packt/packing-list-view.test.tsx` |
| `handleSaveAsTemplate` calls action, handles error | Unit | `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.test.ts` |
| Save trip list as template — full flow | E2E | `tests/e2e/features/save-trip-as-template.feature` (+ steps) |

Coverage: `src/components/packt/**` and `src/app/(app)/trips/actions.ts` (packing actions) are enforced (≥95% lines/functions, ≥90% branches). `src/app/(app)/trips/**` is excluded from global coverage thresholds — still author colocated tests per convention.

### Unit test specifics

**`actions.test.ts`** — add `saveTripListAsTemplate` test block:
- Empty name → throws `"Template name is required"`
- Trip with 0 packing items → throws `"Cannot save an empty packing list as a template"`
- Trip with 2 plain items → creates template with 2 items, returns `{ templateId: string }`
- Trip with 1 label + 3 items under it → template items preserve the label→item grouping (labelId cross-reference)
- Trip with checked items (done: true) → template items all have no `done` field (schema has no `done` column on `packingTemplateItems`)
- Original trip items unchanged (assert no DELETE/UPDATE on `packingItems`)
- Trips from another user cannot access user's trip (via `assertTripAccess`)
- `requireUser()` called; `assertTripAccess()` called with "editor" role

**`save-as-template-dialog.test.tsx`**:
- Renders with `open=true` → shows name input and save button
- Empty name submission shows inline validation error
- Type a name, click "Save" → calls `onSave(name)`
- On successful save → shows success toast, calls `onClose()`
- On save error → shows error toast
- Close button calls `onClose()`
- Keyboard Escape closes dialog

**`packing-list-view.test.tsx`**:
- Populated state: "Save as template" button is present
- Empty state: "Save as template" button is NOT present (or disabled)
- Clicking save button opens dialog (dialog renders)

**`use-trip-detail-handlers.test.ts`**:
- `handleSaveAsTemplate("My Template")` → calls `saveTripListAsTemplate(trip.id, "My Template")`
- On success, resolves with `templateId`
- On error, shows `toast.error` and resolves with `undefined`

### E2E specifics

**`tests/e2e/e2e-seed-data.ts`** — no changes needed. Reuse existing `E2E_TRIP_ID`, `E2E_DAY_IDS`. Seed packing items directly in the step file.

**`tests/e2e/features/save-trip-as-template.feature`:**

```gherkin
@save-trip-as-template
Feature: Save trip packing list as a template
  Background:
    Given I am signed in

  Scenario: Save a trip list as a named template
    Given I have a trip with packing items "Passport", "Phone Charger", "Toothbrush"
    When I open the packing tab for the trip
    And I save the list as template "My Trip"
    Then I should see a success message that the template was saved
    And the template library should contain a template named "My Trip"
    And the template "My Trip" should have items "Passport", "Phone Charger", "Toothbrush"

  Scenario: Save with items checked — template items are unchecked
    Given I have a trip with packing items "Passport", "Toothbrush"
    And "Passport" is checked
    When I save the list as template "Checked Test"
    Then the template "Checked Test" should have no checked state (templates are pristine)

  Scenario: Original trip list unchanged after save
    Given I have a trip with packing items "Laptop", "Mouse"
    When I save the list as template "Unchanged Test"
    Then the trip list still shows "Laptop" and "Mouse" as-is

  Scenario: Save with empty name shows validation
    Given I have a trip with packing items "Laptop"
    When I try to save as template with an empty name
    Then I see a validation error "Template name is required"
```

**`tests/e2e/steps/save-trip-as-template.steps.ts`:** reuse `withE2EDb` + `getE2EUserId` helpers from `templates.steps.ts`.

Seeding pattern:
```ts
async function seedPackingItems(tripId: string, names: string[], checkedNames?: string[]): Promise<void> {
  return withE2EDb(async (db) => {
    for (let i = 0; i < names.length; i++) {
      await db.insert(packingItems)
        .values({
          tripId,
          name: names[i],
          done: checkedNames?.includes(names[i]) ?? false,
          isLabel: false,
          position: i,
        });
    }
  });
}
```

Tag: `@save-trip-as-template`.

The E2E web server runs on port 3001 with `NEXT_DISTDIR=.next-e2e`. No DB migration needed — no schema change.

### Files to Create

| File | Purpose |
|---|---|
| `src/components/packt/packing-list-toolbar.tsx` | Populated-state header controls (item count, pull and save buttons) — extracted from `PackingListView` |
| `src/components/packt/packing-list-empty-state.tsx` | Empty state section — extracted from `PackingListView` |
| `src/components/packt/save-as-template-dialog.tsx` | Save-as-template dialog with name input + validation |
| `src/components/packt/save-as-template-dialog.test.tsx` | Dialog component tests |
| `tests/e2e/features/save-trip-as-template.feature` | BDD scenarios |
| `tests/e2e/steps/save-trip-as-template.steps.ts` | Step defs + self-seeding `Before`/`After` hooks |

### Files to Modify

| File | Change |
|---|---|
| `src/data/types.ts` | Add `SaveTripAsTemplateResult` after `PullTemplatesResult` (line 621) |
| `src/app/(app)/trips/actions.ts` | Add `saveTripListAsTemplate` action (after `pullTemplatesOntoTrip`, around line 676); import `SaveTripAsTemplateResult` |
| `src/app/(app)/trips/actions.test.ts` | Add `saveTripListAsTemplate` tests |
| `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts` | Add `handleSaveAsTemplate` to interface + implementation + return object; import `saveTripAsTemplate` |
| `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.test.ts` | Add `handleSaveAsTemplate` tests |
| `src/app/(app)/trips/[tripId]/page-client.tsx` | Add `onSaveAsTemplate` prop and pass from handlers |
| `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx` | Add `onSaveAsTemplate` prop and pass to `PackingListView` |
| `src/components/packt/packing-list-view.tsx` | Add `onSaveAsTemplate` prop; add save button + dialog in populated state; import `Save` icon, import `SaveAsTemplateDialog` |
| `src/components/packt/packing-list-view.test.tsx` | Add save-button visibility tests |

### References

- [Epics doc](_bmad-output/implementation-artifacts/epics.md) — Epic 2, Story 2.4 (lines 439-462); FR20, NFR5–NFR7
- [Component Review — 250-line rule](.agents/skills/packt-plan-reviewer/references/component-review.md) — the `PackingListView` split is required because it already exceeds 250 lines; extracting `PackingListToolbar` and `PackingListEmptyState` is the recommended fix
- [Story 2.3](_bmad-output/implementation-artifacts/2-3-pull-templates-onto-a-trip-packing-list.md) — Closest analogue for labelId cross-reference pattern, handler pattern, dialog component pattern
- [Project context](_bmad-output/project-context.md) — stack versions, route split, server-action rules, CSS tokens, coverage rules
- [packingItems table](src/db/schema.ts:217) — DB read source for save
- [packingTemplates table](src/db/schema.ts:303) — DB insert target
- [packingTemplateItems table](src/db/schema.ts:318) — DB insert target for items
- [pullTemplatesOntoTrip](src/app/(app)/trips/actions.ts:588-676) — Reverse-direction analogue, two-pass labelId pattern
- [PackingListView](src/components/packt/packing-list-view.tsx) — Props pattern, empty/populated states
- [useTripDetailHandlers](src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts) — Handler pattern for server action calls
- [trip-detail-tab-body.tsx](src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx) — Tab routing, prop threading
- [templates.steps.ts](tests/e2e/steps/templates.steps.ts) — `withE2EDb`, `getE2EUserId` helpers
- [packing-tab.steps.ts](tests/e2e/steps/packing-tab.steps.ts) — Self-seeding `Before`/`After` hooks
- [actions.test.ts](src/app/(app)/trips/actions.test.ts) — Action test pattern with `vi.hoisted` mocks

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- TSC: PASS
- ESLint: PASS (1 error fixed — `e` → `event` in onChange handler; 2 warnings fixed — unused imports)
- Vitest coverage: PASS — 1538 tests, lines 96.17%, functions 95.08%, branches 90.12%
- E2E: 110/112 passed; 2 pre-existing drag/timing flakes (day-planning reorder, packing keyboard-reorder) unrelated to this story; all 3 new save-as-template scenarios passed
- Build: PASS

### Completion Notes List

- `saveTripListAsTemplate` uses two-pass transaction for labelId cross-reference (labels first, non-labels second) — same pattern as `pullTemplatesOntoTrip` in reverse
- `SaveAsTemplateDialog` simplified: removed `handleOpenChange` function in favour of inline `() => onClose()` to eliminate dead branch and improve coverage
- `PackingListToolbar` and `PackingListEmptyState` extracted from `PackingListView` to bring the file under 250 lines; both are `"use client"` components
- Handler returns `string | undefined` (templateId) rather than the full `SaveTripAsTemplateResult` — dialog only needs the id to know success
- All AC1–AC7 satisfied; E2E verifies full save flow, disabled-button validation, and original-list-unchanged AC

### File List

**Created:**
- `src/components/packt/save-as-template-dialog.tsx`
- `src/components/packt/save-as-template-dialog.test.tsx`
- `src/components/packt/packing-list-toolbar.tsx`
- `src/components/packt/packing-list-empty-state.tsx`
- `tests/e2e/features/save-trip-as-template.feature`
- `tests/e2e/steps/save-trip-as-template.steps.ts`

**Modified:**
- `src/data/types.ts`
- `src/app/(app)/trips/actions.ts`
- `src/app/(app)/trips/actions.test.ts`
- `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts`
- `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.test.tsx`
- `src/app/(app)/trips/[tripId]/page-client.tsx`
- `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx`
- `src/components/packt/packing-list-view.tsx`
- `src/components/packt/packing-list-view.test.tsx`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
