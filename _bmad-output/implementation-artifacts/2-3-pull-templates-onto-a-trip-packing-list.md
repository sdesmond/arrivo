# Story 2.3: Pull Templates onto a Trip Packing List

Status: ready-for-dev

## Story

As a traveler,
I want to pull one or more templates onto my trip's packing list with automatic deduplication,
so that I can populate a trip list from my accumulated packing expertise in seconds.

**FRs covered:** FR14, FR15, FR16, NFR2, NFR5, NFR6, NFR7, NFR8, NFR10, NFR12

**This story builds on Story 2.2's template item editor and Story 1.1's trip packing list.** Templates with items exist in the library. The trip packing list (`PackingListView` at `src/components/packt/packing-list-view.tsx`, rendered from `trip-detail-tab-body.tsx` when `activeTab === "pack"`) currently shows an empty state with only a manual-entry form. This story adds a "Pull from template" affordance to the empty state and a pull dialog, a server action `pullTemplatesOntoTrip` in `trips/actions.ts` that copies template items into `packingItems` with case-insensitive deduplication, the handler wiring through `useTripDetailHandlers` → `TripDetailClient` → `TripDetailTabBody` → `PackingListView`, and a reusable `TemplatePullDialog` component.

Do NOT implement save-as-template (Story 2.4) here.

## Acceptance Criteria

**AC1 — Empty state offers template pull**
Given a trip packing list is empty
When the user views the Packing tab
Then the empty state offers both an "Add items manually" path and a "Pull from a template" path

**AC2 — Pull a single template onto an empty list**
Given the user selects a template to pull onto an empty trip list
When the pull completes
Then all items and labels from the template are copied into the trip list in their original order

**AC3 — Multiple templates merge into one flat list**
Given the user pulls two or more templates
When the pull completes
Then items from all selected templates are merged into a single flat list ordered by template selection order then item position

**AC4 — Deduplication with case-insensitive match**
Given two templates share one or more item texts (case-insensitive match)
When both are pulled onto the same trip list
Then duplicate items appear only once
And a lightweight notice shows "X duplicate(s) skipped"

**AC5 — Dedup against existing items when pulling onto a populated list**
Given a trip already has packing list items
When the user pulls an additional template
Then the template items are appended to the existing list
And deduplication applies against all existing items, not just within the new template

**AC6 — No templates → message with link**
Given the user has no templates
When they attempt to pull a template
Then they see a message indicating no templates exist with a link to create one

**AC7 — Performance: 200 items within 500ms**
Given a pull operation involving up to 200 total items across templates
When the pull completes
Then it completes within 500ms

**AC8 — Auth enforcement (NFR5, NFR6)**
Given the pull server action is called
Then `requireUser()` + `assertTripAccess()` are enforced before writing to the trip list
And templates are scoped to the authenticated user (NFR7)

**AC9 — Accessibility (NFR8, NFR10, NFR12)**
Given any interactive element in the pull dialog
Then all touch targets are at minimum 44×44px on mobile viewports
And all interactive elements have a visible focus indicator meeting WCAG 2.1 AA contrast
And the dialog has a descriptive `aria-label` or `aria-labelledby`

## Tasks / Subtasks

- [ ] **Types** — add `PullTemplatesInput` and `PullTemplatesResult` to `src/data/types.ts` (AC1–AC5, AC8)
- [ ] **Server action** — add `pullTemplatesOntoTrip` to `src/app/(app)/trips/actions.ts` (AC2–AC5, AC7, AC8)
  - [ ] `requireUser()` + `assertTripAccess(tripId, user.id!, "editor")`
  - [ ] Fetch existing `packingItems` names as `Set<string>` for dedup
  - [ ] Fetch each template's items from `packingTemplateItems` (auth check: user owns the template)
  - [ ] Case-insensitive dedup: lowercased text vs lowercased existing names; labels ARE compared (two identical labels = one)
  - [ ] Insert deduped items in template-order; each template's items get sequential positions starting after the last existing item position
  - [ ] Count duplicates across all templates (not per-template)
  - [ ] Return `{ count: number }` (number of unique items added) for the client notice
  - [ ] `revalidatePath` on both `/trips/${tripId}` and `/trips`
- [ ] **Handler** — add `handlePullTemplates` to `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts` (AC1)
  - [ ] Wraps `pullTemplatesOntoTrip` in `startTransition` with `toast.error` on failure
  - [ ] `handlePullTemplates(templateIds: string[]): Promise<{ count: number } | undefined>`
- [ ] **Wiring** — thread `onPullTemplates` through `TripDetailClient` → `TripDetailTabBody` (AC1)
- [ ] **Component** — new `src/components/packt/template-pull-dialog.tsx` (`"use client"`) (AC1, AC6, AC9)
  - [ ] Props: `templates: PackingTemplate[]` (from `PackingListView` via `onPullTemplates`)
  - [ ] Dialog: title "Pull from templates", checkbox list of templates, "Pull selected" button, cancel/close
  - [ ] Empty state: "No templates yet — create one from the template library" with a `<Link href="/packing">` to create
  - [ ] Shows "X item(s) added, Y duplicate(s) skipped" notice after successful pull (auto-dismiss after 4 seconds)
  - [ ] Accessible: `<dialog>` with `aria-labelledby` referencing the title, focus trap, Escape to close
  - [ ] Touch targets: `min-h-11 min-w-11` on all buttons; checkboxes at least 44×44px
- [ ] **Modify `PackingListView`** — add pull-button and wire dialog (AC1, AC6)
  - [ ] New prop: `onPullTemplates: () => Promise<PackingTemplate[]>` (fetches templates via a lightweight wrapper)
  - [ ] New prop: `templates: PackingTemplate[]` — the full template list for the dialog
  - [ ] Empty state: add "Pull from a template" `<Button variant="outline">` alongside the existing entry form
  - [ ] Populated state: add "Pull templates" button above the sortable list (inline with heading area)
  - [ ] Manage dialog open/close state locally
  - [ ] On pull complete, close dialog and show inline notice (number of items added / duplicates skipped)
- [ ] **Fetch templates in trip page** — pass `templates` prop down (AC1)
  - [ ] `page.tsx` calls `listTemplatesForUser(session.id)` and passes templates through
  - [ ] Thread through `TripDetailClient` → `TripDetailTabBody` → `PackingListView`
- [ ] **Unit tests** — colocated, same change
  - [ ] `src/app/(app)/trips/actions.test.ts` — `pullTemplatesOntoTrip` (auth, dedup, cross-user scoping, empty input, count)
  - [ ] `src/components/packt/template-pull-dialog.test.tsx` — dialog renders, shows templates, no-templates message, pull button fires
  - [ ] `src/components/packt/packing-list-view.test.tsx` — pull button in empty state, pull button in populated state
  - [ ] `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.test.ts` — handlePullTemplates calls action, error handling
- [ ] **E2E** — new flow, same change (AC1–AC5, AC8, AC9)
  - [ ] `tests/e2e/features/pull-templates.feature` — BDD scenarios (tag `@pull-templates`)
  - [ ] `tests/e2e/steps/pull-templates.steps.ts` — step defs + self-seeding `Before`/`After` DB hooks
- [ ] **Operational** — schema already has `packingTemplateItems` from Story 2.2; no schema change needed

## Dev Notes

### Existing State — files you touch

| Artifact | Location | Action |
|---|---|---|
| `PackingItem` type | `src/data/types.ts:387` | Reference |
| `AddPackingItemInput` type | `src/data/types.ts:606` | Reference — add `PullTemplatesInput` and `PullTemplatesResult` after it |
| `packingItems` table | `src/db/schema.ts:217` | Insert target |
| `packingTemplateItems` table | `src/db/schema.ts:318` | Read source — import for server action |
| `packingTemplates` table | `src/db/schema.ts:303` | Ownership check |
| `addPackingItem` action | `src/app/(app)/trips/actions.ts:464` | Colleague — add `pullTemplatesOntoTrip` in the same file |
| `normalizePackingItemName` | `src/app/(app)/trips/actions.ts:456` | Reuse for name normalization |
| `PackingListView` | `src/components/packt/packing-list-view.tsx` | Add pull button + dialog state |
| `packing-list-view.test.tsx` | `src/components/packt/packing-list-view.test.tsx` | Add pull-button tests |
| `useTripDetailHandlers` | `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts` | Add `handlePullTemplates` |
| `TripDetailClient` | `src/app/(app)/trips/[tripId]/page-client.tsx` | Thread `templates` prop and `onPullTemplates` |
| `TripDetailTabBody` | `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx` | Thread `templates` and `onPullTemplates` |
| `page.tsx` (trip detail) | `src/app/(app)/trips/[tripId]/page.tsx` | Fetch `listTemplatesForUser` |
| `listTemplatesForUser` | `src/lib/queries.ts:129` | Already exists — import and call from trip page |
| `templates.steps.ts` | `tests/e2e/steps/templates.steps.ts` | Reference `withE2EDb` + `getE2EUserId` pattern |

### Types — exact shape (`src/data/types.ts`)

Add after `UpdatePackingItemInput` (line 616):

```ts
export interface PullTemplatesInput {
  templateIds: string[];
}

export interface PullTemplatesResult {
  added: number;
  skipped: number;
}
```

### Server action (`src/app/(app)/trips/actions.ts`)

Add after `reorderPackingItems` (line 583):

```ts
export async function pullTemplatesOntoTrip(
  tripId: string,
  templateIds: string[]
): Promise<PullTemplatesResult> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");
  if (templateIds.length === 0) return { added: 0, skipped: 0 };

  // Fetch existing item names for dedup (case-insensitive set)
  const existingItems = await db
    .select({ name: packingItems.name })
    .from(packingItems)
    .where(eq(packingItems.tripId, tripId));
  const existingNames = new Set(existingItems.map((r) => r.name.toLowerCase()));

  // Fetch template items for all requested templates (owner-scoped)
  const templates = await db
    .select({ id: packingTemplates.id })
    .from(packingTemplates)
    .where(
      and(
        inArray(packingTemplates.id, templateIds),
        eq(packingTemplates.userId, user.id!)
      )
    );
  const ownedIds = new Set(templates.map((t) => t.id));

  // Get the max current position for appending
  const [{ maxPos }] = await db
    .select({ maxPos: max(packingItems.position) })
    .from(packingItems)
    .where(eq(packingItems.tripId, tripId));

  let nextPosition = (maxPos ?? -1) + 1;
  let added = 0;
  let skipped = 0;

  await db.transaction(async (tx) => {
    for (const templateId of templateIds) {
      if (!ownedIds.has(templateId)) continue; // skip templates not owned by user

      const items = await tx
        .select()
        .from(packingTemplateItems)
        .where(eq(packingTemplateItems.templateId, templateId))
        .orderBy(asc(packingTemplateItems.position));

      for (const templateItem of items) {
        const normalizedText = templateItem.text.toLowerCase();
        if (existingNames.has(normalizedText)) {
          skipped++;
          continue;
        }

        // Build labelId mapping: template labelId → new packing item id
        // For first pass without cross-reference, labels become ungrouped
        // (section labels pulled from a template are grouped as they were in the template)

        await tx.insert(packingItems).values({
          tripId,
          name: templateItem.text,
          done: false,
          isLabel: templateItem.isLabel,
          position: nextPosition++,
          // labelId is set null — labels are inserted first where possible,
          // then a second pass updates item labelIds. For simplicity in v1,
          // preserve label→item grouping by: (1) collecting label IDs from template,
          // (2) after inserting all items, updating labelIds.
          // See "labelId cross-reference" below.
          labelId: null,
        });
        added++;
        existingNames.add(normalizedText);
      }
    }

    // Second pass: update labelId references.
    // For each template, collect the original template labelId → new packing item id mapping.
    // For each non-label template item that had a labelId in the template,
    // find the inserted packing item by matching text + labelId context
    // (simplified: match by position offset from template).
    // This is complex — the simplified approach: read back inserted items
    // by position range and update labelIds.
  });

  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/trips");

  return { added, skipped };
}
```

**labelId cross-reference in template pull:** The tricky part is preserving the label→item grouping from the template. Template items have `labelId` pointing to another `packingTemplateItems.id`. When copying to `packingItems`, the new item IDs are different. Approach:

1. Collect all template items ordered by position into an array.
2. Insert items one by one. For each label item, remember its new ID (from `returning()`).
3. Build a map `templateLabelId → new packingItemId`.
4. After all inserts, update `labelId` on each inserted non-label item that had a `labelId` — the update uses the map.

Implementation detail: collect items per template into memory, then insert in one batch:

```ts
// Collect all items from all templates, preserving order
interface PendingInsert {
  text: string;
  isLabel: boolean;
  position: number;
  templateLabelId: string | null; // the labelId from the template (self-FK)
}

const pendingInserts: PendingInsert[] = [];
let allSkipped = 0;

for (const templateId of templateIds) {
  if (!ownedIds.has(templateId)) continue;
  const items = await tx.select()
    .from(packingTemplateItems)
    .where(eq(packingTemplateItems.templateId, templateId))
    .orderBy(asc(packingTemplateItems.position));

  for (const item of items) {
    if (existingNames.has(item.text.toLowerCase())) {
      allSkipped++;
      continue;
    }
    pendingInserts.push({
      text: item.text,
      isLabel: item.isLabel,
      position: item.position,
      templateLabelId: item.labelId,
    });
    existingNames.add(item.text.toLowerCase());
  }
}
```

For labels, insert first and capture their new IDs. Then insert non-labels. Then update `labelId`:

```ts
// Map: old template labelId → new packingItem id
const labelIdMap = new Map<string, string>();

for (const insert of pendingInserts) {
  if (insert.isLabel) {
    const [row] = await tx.insert(packingItems)
      .values({ tripId, name: insert.text, done: false, isLabel: true, position: nextPosition++, labelId: null })
      .returning({ id: packingItems.id });
    if (insert.templateLabelId) {
      labelIdMap.set(insert.templateLabelId, row.id);
    }
  }
}

for (const insert of pendingInserts) {
  if (!insert.isLabel) {
    const newLabelId = insert.templateLabelId ? (labelIdMap.get(insert.templateLabelId) ?? null) : null;
    await tx.insert(packingItems)
      .values({ tripId, name: insert.text, done: false, isLabel: false, position: nextPosition++, labelId: newLabelId })
      .returning({ id: packingItems.id });
  }
}
```

The dedup notice: each template item text that already exists in `existingNames` (lowercased) increments `skipped`. The final `added = pendingInserts.length`.

Import additions needed in `trips/actions.ts`:
```ts
import { packingTemplateItems, packingTemplates } from "@/db/schema";
import type { PullTemplatesResult } from "@/data/types";
// asc may already be imported; if not add it
```

### Handler (`src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts`)

Add to the `TripDetailHandlers` return value:
```ts
handlePullTemplates: (templateIds: string[]) => Promise<{ added: number; skipped: number } | undefined>;
```

Implementation:
```ts
function handlePullTemplates(templateIds: string[]): Promise<{ added: number; skipped: number } | undefined> {
  return new Promise((resolve) => {
    startTransition(async () => {
      try {
        const result = await pullTemplatesOntoTrip(trip.id, templateIds);
        resolve(result);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to pull templates. Please try again.");
        resolve(undefined);
      }
    });
  });
}
```

Import `pullTemplatesOntoTrip` from `"../actions"` (same import line as other packing actions, line 18).

### Template pull dialog (`src/components/packt/template-pull-dialog.tsx`)

New component, `"use client"`:

```ts
"use client";

import { useState, type ReactElement } from "react";
import { Check, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PackingTemplate } from "@/data/types";

export interface TemplatePullDialogProps {
  open: boolean;
  templates: PackingTemplate[];
  onClose: () => void;
  onPull: (templateIds: string[]) => Promise<{ added: number; skipped: number } | undefined>;
}
```

- Uses a `<dialog>` element with `open` prop, or a controlled overlay div with `aria-*` attributes.
- If `templates.length === 0`: show "No templates yet" message with `<a href="/packing">` (Link to the template library page).
- Otherwise: checkbox list of templates. Each row = checkbox + template name.
- "Pull selected (N)" button (disabled when none selected).
- Shows result notice inline after pull: "3 item(s) added, 1 duplicate(s) skipped" — auto-hides after 4 seconds via `useEffect` + `setTimeout`.
- Uses existing style tokens: `var(--surface)`, `var(--line)`, etc.
- Touch targets: `className="min-h-11 min-w-11"` on buttons. Checkbox rows `className="flex items-center gap-3 py-2 min-h-11"`.
- The dialog overlay: fixed, full-screen backdrop with centered content panel.
- Accessible: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` on the title `<h2>`.

### `PackingListView` — integration

Add props:
```ts
templates: PackingTemplate[];
onPullTemplates: (templateIds: string[]) => Promise<{ added: number; skipped: number } | undefined>;
```

In the empty state (line 188–210), after the `<p>` description, add a second button:
```tsx
<Button className="min-h-11 min-w-11 flex-1 rounded-2xl" variant="outline" onClick={() => setDialogOpen(true)}>
  <FolderOpen size={16} strokeWidth={1.5} />
  Pull from a template
</Button>
```

Local state: `const [dialogOpen, setDialogOpen] = useState(false);` and `const [resultNotice, setResultNotice] = useState<{ added: number; skipped: number } | null>(null);`

On successful pull:
```tsx
async function handlePullTemplates(templateIds: string[]): Promise<void> {
  const result = await onPullTemplates(templateIds);
  if (result) {
    setResultNotice(result);
    setDialogOpen(false);
    setTimeout(() => setResultNotice(null), 4000);
  }
}
```

Render the result notice inline when non-null:
```tsx
{resultNotice && (
  <div className="rounded-2xl border p-3 text-sm" style={{ background: "var(--surface)", borderColor: "var(--line)", color: "var(--fg)" }}>
    {resultNotice.added} item(s) added{resultNotice.skipped > 0 ? `, ${resultNotice.skipped} duplicate(s) skipped` : ""}
  </div>
)}
```

Pass `onAddItem` placeholder warning: the empty state form already works — the pull button is an alternative path, not a replacement.

For the populated state, add a "Pull templates" button above the list heading area (before `PackingListSortable`):
```tsx
<div className="flex items-center justify-between">
  <span className="text-sm" style={{ color: "var(--fg-2)" }}>
    {effectiveItems.length} item{effectiveItems.length !== 1 ? "s" : ""}
  </span>
  <Button className="min-h-9 min-w-9 rounded-xl" variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
    <FolderOpen size={14} strokeWidth={1.5} />
    Pull templates
  </Button>
</div>
```

### Wiring — fetch templates in trip page

In `src/app/(app)/trips/[tripId]/page.tsx`:

Add import:
```ts
import { listTemplatesForUser } from "@/lib/queries";
```

Add fetch in the `Promise.all`:
```ts
const [detail, profile, now, templates] = await Promise.all([
  getTripDetail(tripId, session.id!),
  getUserById(session.id!),
  getServerNow(),
  listTemplatesForUser(session.id!),
]);
```

Pass to `TripDetailClient`:
```tsx
<TripDetailClient
  detail={detail}
  nowISO={now.toISOString()}
  dateFormat={dateFormat}
  initialExpandedDayNumber={...}
  isNew={...}
  templates={templates}
/>
```

Thread through `TripDetailClient` → `TripDetailTabBody` → `PackingListView`:
- `TripDetailClientProps` adds `templates: PackingTemplate[]`
- `TripDetailTabBodyProps` adds `templates: PackingTemplate[]`
- `PackingListView` gets them as the `templates` prop

The `onPullTemplates` handler comes from `useTripDetailHandlers`:
- `TripDetailHandlers` adds `handlePullTemplates`
- `TripDetailClient` passes `onPullTemplates={handlers.handlePullTemplates}`
- `TripDetailTabBody` receives and passes `onPullTemplates`

### What NOT to do

- Do NOT implement save-as-template (Story 2.4)
- Do NOT add per-item cherry-pick — pull is all-or-nothing per template (Phase 1)
- Do NOT add section-label drag-to-reorder (Phase 1: items only; labels are non-draggable in both template and trip list)
- Do NOT add "select all" / "deselect all" in the pull dialog — Phase 1 simplicity; user selects individual checkboxes
- Do NOT use `fetch` or an API route — the pull action is a server action called from the handler
- Do NOT store `done` on template items — templates are pristine; all pulled items start with `done: false`
- Do NOT add real-time sync — all mutations via server actions with `revalidatePath`
- Do NOT hardcode hex/rgb — always CSS custom properties
- Do NOT redefine types locally — all new types in `src/data/types.ts`
- Do NOT use `window.confirm` for any confirmation in the dialog — use dialog buttons
- Do NOT skip the `labelId` cross-reference mapping — without it, pulled section labels will not group their items; all items appear ungrouped at the bottom. The template editor (`template-editor-view.tsx`) correctly groups items, so pulling a template that has sections should preserve that grouping.
- Do NOT use `assertTripAccess` with a template ID — template access and trip access are separate concerns; the action checks both independently

### Deduplication rules

| Source | Match target | Algorithm |
|---|---|---|
| Template item `text` | Existing packing item `name` | `.toLowerCase()` equality |
| Template label `text` | Existing packing item `name` | `.toLowerCase()` equality (labels CAN be deduped — two labels with same text are a single label) |
| Template item `text` | Template item `text` (within same pull) | Same `.toLowerCase()` check; deduplication is **global** across all selected templates |

Deduplication is scoped to the trip's existing `packingItems` + all items already added from earlier templates in the same pull call. The `existingNames` Set accumulates as items are added.

### Performance (AC7 — NFR2)

For up to 200 total items:
- All fetches (existing items + template items) are batched — no N+1 queries
- Insert is within a single transaction
- The in-memory dedup Set is O(n) total
- This is well under the 500ms budget; no additional optimization needed

### Accessibility (AC9 — NFR8, NFR10, NFR12)

- **Dialog**: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` on `<h2>` title; close button has `aria-label="Close"`
- **Checkbox list**: each checkbox `<input type="checkbox">` with `<label>` wrapping the template name; visible focus ring
- **"Pull selected" button**: `min-h-11 min-w-11`; disabled when `selectedIds.length === 0`
- **Result notice**: rendered in a `aria-live="polite"` region for screen reader announcement
- **"No templates" message**: includes a text link to `/packing` (template library) — not just an icon
- **Close/Escape**: dialog closes on Escape key press; click-outside close optional but not required

## Previous Story Intelligence (Stories 2.2 & 2.1)

From previous story review findings — patterns that apply here:

- **`requireUser()` must be the first line of every action** — auth before any DB read
- **Dual auth check**: both `requireUser()` (authentication) and `assertTripAccess()` (trip-level authorization) — templates are user-scoped checked separately via `packingTemplates.userId`
- **No `window.confirm`** — use dialog buttons/controls
- **`toast` is globally mounted** — import `toast` from `"sonner"`, never add a second `<Toaster>`
- **`session.id!`** — the non-null assertion is the established idiom after `requireUser()`
- **`revalidatePath` after every mutation** — revalidate both `/trips/${tripId}` and `/trips`
- **Return guard on insert** — check `if (!row) throw new Error(...)` after `returning()`
- **Do NOT mirror server-driven props in `useState`** — use derive-from-props pattern (Story 2.2 review mandated this)
- **E2E must self-seed at the DB level in `Before` hooks** — chained UI-driven setup races server-action revalidation. Template and packing item steps seed via DB directly.
- **`inArray` must handle empty arrays** — `trips/actions.ts` already guards `templateIds.length === 0` at the top of the action

## Git Intelligence

Stories 2.1 and 2.2 are done and merged. Epic 2 is in-progress. The `packingTemplateItems` table and all template infrastructure exist. The trip packing list exists with full CRUD + reorder. No in-flight work conflicts with this story.

The `labelId` cross-reference pattern (mapping old template label IDs to new packing item IDs during pull) is new — no existing pattern in the codebase handles this specific case. The approach described above (two-pass: insert labels first with `returning()`, build map, then update non-labels) is the recommended simple solution.

## Testing

### Test layering (mandatory — no cross-layer duplication)

| Behavior | Layer | File |
|---|---|---|
| `PullTemplatesInput`/`PullTemplatesResult` types | Unit | Type-only — verified by compilation |
| `pullTemplatesOntoTrip` action (auth, dedup, ownership) | Unit | `src/app/(app)/trips/actions.test.ts` |
| Pull dialog renders, shows templates, no-templates message | Unit | `src/components/packt/template-pull-dialog.test.tsx` |
| Packing list view shows pull button in empty/populated states | Unit | `src/components/packt/packing-list-view.test.tsx` |
| `handlePullTemplates` calls action, handles error | Unit | `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.test.ts` |
| Pull a template onto empty list, dedup, cross-template merge | E2E | `tests/e2e/features/pull-templates.feature` (+ steps) |

Coverage: `src/components/packt/**` and `src/app/(app)/trips/actions.ts` (packing actions) are enforced (≥95% lines/functions, ≥90% branches). `src/app/(app)/trips/**` is excluded — still author colocated tests per the colocated-test convention.

### Unit test specifics

**`actions.test.ts`** — add `pullTemplatesOntoTrip` test block:
- Empty `templateIds` → returns `{ added: 0, skipped: 0 }`, no DB calls
- Template not owned by current user → skipped silently (no error thrown)
- No existing items + template with 2 items → `{ added: 2, skipped: 0 }`, inserts 2 rows
- Existing item "Sunscreen" + template item "sunscreen" (lowercase match) → `{ added: 0, skipped: 1 }`
- Two templates, each with 1 unique item → `{ added: 2, skipped: 0 }`, inserts in order
- Two templates, each with "Sunscreen" → `{ added: 1, skipped: 1 }`
- Existing trip item "Passport" + template item "Toothbrush" and "passport" → `{ added: 1, skipped: 1 }`
- `requireUser()` called; `assertTripAccess` called with "editor" role

**`template-pull-dialog.test.tsx`**:
- Renders with `open=true` and templates → shows each template name with a checkbox
- Selecting a template and clicking "Pull selected" calls `onPull` with that template's id
- No templates → shows "No templates yet" message with link
- After pull, shows result notice with added/skipped counts
- Closes on keyboard Escape

**`packing-list-view.test.tsx`**:
- Empty state: "Pull from a template" button is present
- Populated state: "Pull templates" button is present
- Clicking pull button opens dialog (dialog component renders)

**`use-trip-detail-handlers.test.ts`** (model on existing pattern `use-trip-detail-handlers.test.ts`):
- `handlePullTemplates(['id1', 'id2'])` → calls `pullTemplatesOntoTrip(tripId, ['id1', 'id2'])`
- On success, resolves with `{ added, skipped }`
- On error, shows `toast.error` and resolves with `undefined`

### E2E specifics

**Add to `tests/e2e/e2e-seed-data.ts`:**

```ts
export const E2E_TEMPLATE_PULL = { name: "Pull Template" };
export const E2E_TEMPLATE_PULL_ITEMS = [
  { text: "Passport", isLabel: false, position: 0 },
  { text: "Phone Charger", isLabel: false, position: 1 },
  { text: "Toothbrush", isLabel: false, position: 2 },
];
export const E2E_TEMPLATE_PULL_WITH_LABEL = { name: "Pull Label Template" };
export const E2E_TEMPLATE_PULL_LABEL_ITEMS = [
  { text: "Toiletries", isLabel: true, position: 0 },
  { text: "Toothbrush", isLabel: false, position: 1, labelId: /* resolved at runtime */ null },
  { text: "Shampoo", isLabel: false, position: 2, labelId: /* resolved at runtime */ null },
];
```

**`tests/e2e/global-setup.ts`**: `packing_template_items` is already in the truncate list from Story 2.2.

**`tests/e2e/steps/pull-templates.steps.ts`**: reuse `withE2EDb` + `getE2EUserId` helpers from `templates.steps.ts`.

Seeding `packing_templates` and `packing_template_items`:
```ts
async function seedTemplateWithItems(templateName: string): Promise<string> {
  return withE2EDb(async (db) => {
    const userId = await getE2EUserId(db);
    const [template] = await db.insert(packingTemplates)
      .values({ userId, name: templateName })
      .returning({ id: packingTemplates.id });
    for (const item of E2E_TEMPLATE_PULL_ITEMS) {
      await db.insert(packingTemplateItems)
        .values({ templateId: template.id, ...item });
    }
    return template.id;
  });
}

async function seedTemplateWithLabeledItems(templateName: string): Promise<string> {
  return withE2EDb(async (db) => {
    const userId = await getE2EUserId(db);
    const [template] = await db.insert(packingTemplates)
      .values({ userId, name: templateName })
      .returning({ id: packingTemplates.id });
    const [label] = await db.insert(packingTemplateItems)
      .values({ templateId: template.id, text: "Toiletries", isLabel: true, position: 0 })
      .returning({ id: packingTemplateItems.id });
    await db.insert(packingTemplateItems)
      .values({ templateId: template.id, text: "Toothbrush", isLabel: false, position: 1, labelId: label.id });
    await db.insert(packingTemplateItems)
      .values({ templateId: template.id, text: "Shampoo", isLabel: false, position: 2, labelId: label.id });
    return template.id;
  });
}
```

Tag: `@pull-templates`.

**`tests/e2e/features/pull-templates.feature`:**

```gherkin
@pull-templates
Feature: Pull templates onto a trip packing list
  Background:
    Given I am signed in

  Scenario: Empty state offers pull from template
    Given I have a trip with no packing items
    And I have a packing template "Pull Template" with items
    When I open the packing tab for the trip
    Then I see a "Pull from a template" option in the empty state

  Scenario: Pull a template onto an empty trip list
    Given I have a trip with no packing items
    And I have a packing template "Pull Template" with items
    When I open the packing tab for the trip
    And I pull the template "Pull Template" onto the trip
    Then the packing list should contain "Passport"
    And the packing list should contain "Phone Charger"
    And the packing list should contain "Toothbrush"

  Scenario: Deduplication skips matching items
    Given I have a trip with no packing items
    And I have 2 packing templates "Pull Template" and "Pull Template 2" both with item "Toothbrush"
    When I open the packing tab for the trip
    And I pull both templates onto the trip
    Then the packing list should contain "Toothbrush" only once
    And I should see a notice that "1 duplicate(s) skipped"

  Scenario: Pull onto an already-populated list
    Given I have a trip with packing item "Laptop"
    And I have a packing template "Pull Template" with items
    When I open the packing tab for the trip
    And I pull the template "Pull Template" onto the trip
    Then the packing list should contain "Laptop"
    And the packing list should contain "Passport"
    And the packing list should contain "Phone Charger"
```

The E2E web server runs on port 3001 with `NEXT_DISTDIR=.next-e2e`. No DB migration needed — no schema change.

### Project Structure Notes

- All new/modified files follow existing patterns. The pull dialog is a new component in `src/components/packt/` (domain component). The server action goes into the existing `trips/actions.ts` (already has packing actions). No new routes needed.
- The `templateIds` prop and `onPullTemplates` handler follow the same prop-threading pattern as `onAddPackingItem` / `onTogglePackingItem` through `TripDetailClient` → `TripDetailTabBody`.
- No conflicts with the unified structure. Shared-file edits are additive: `types.ts`, `trips/actions.ts`, `page.tsx`, `page-client.tsx`, `trip-detail-tab-body.tsx`, `use-trip-detail-handlers.ts`.

### Files to Create

| File | Purpose |
|---|---|
| `src/components/packt/template-pull-dialog.tsx` | Pull dialog with template checkbox list + result notice |
| `src/components/packt/template-pull-dialog.test.tsx` | Dialog component tests |
| `tests/e2e/features/pull-templates.feature` | BDD scenarios |
| `tests/e2e/steps/pull-templates.steps.ts` | Step defs + self-seeding `Before`/`After` hooks |

### Files to Modify

| File | Change |
|---|---|
| `src/data/types.ts` | Add `PullTemplatesInput`, `PullTemplatesResult` after line 616 |
| `src/app/(app)/trips/actions.ts` | Add `pullTemplatesOntoTrip` action (after line 583); add import `packingTemplateItems`, `packingTemplates`, `inArray`, `asc`, `PullTemplatesResult` |
| `src/app/(app)/trips/actions.test.ts` | Add `pullTemplatesOntoTrip` tests |
| `src/app/(app)/trips/[tripId]/page.tsx` | Import `listTemplatesForUser`, fetch templates, pass to client |
| `src/app/(app)/trips/[tripId]/page-client.tsx` | Add `templates` to `TripDetailClientProps`; thread to `TripDetailTabBody` |
| `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx` | Add `templates` prop and `onPullTemplates`; pass to `PackingListView` |
| `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts` | Add `handlePullTemplates`; import `pullTemplatesOntoTrip` |
| `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.test.ts` | Add `handlePullTemplates` test |
| `src/components/packt/packing-list-view.tsx` | Add `templates` and `onPullTemplates` props; add pull button + dialog + result notice |
| `src/components/packt/packing-list-view.test.tsx` | Add pull button tests |
| `tests/e2e/e2e-seed-data.ts` | Add pull template seed constants |

### References

- [Epics doc](_bmad-output/implementation-artifacts/epics.md) — Epic 2, Story 2.3 (lines 398-436); FR14–FR16, NFR2, NFR5–NFR8
- [Story 2.2](_bmad-output/implementation-artifacts/2-2-template-item-and-label-management.md) — Template item schema, `packingTemplateItems` table, template editor, `PackingListSortable` optional checkbox
- [Story 1.1](_bmad-output/implementation-artifacts/1-1-packing-tab-foundation-list-display-and-item-label-management.md) — `packingItems` table, `PackingListView`, `PackingListSortable` foundation
- [Project context](_bmad-output/project-context.md) — stack versions, route split, server-action rules, CSS tokens, coverage rules
- [packingItems table](src/db/schema.ts:217) — DB insert target for pull
- [packingTemplateItems table](src/db/schema.ts:318) — DB read source for pull
- [packingTemplates table](src/db/schema.ts:303) — ownership check for template scope
- [trips/actions.ts](src/app/(app)/trips/actions.ts) — existing packing action patterns, `addPackingItem` position logic
- [PackingListView](src/components/packt/packing-list-view.tsx) — empty state, entry form, list rendering
- [useTripDetailHandlers](src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts) — handler pattern for server action calls
- [trip-detail-tab-body.tsx](src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx) — tab routing, prop threading
- [templates.steps.ts](tests/e2e/steps/templates.steps.ts) — `withE2EDb`, `getE2EUserId` helpers
- [packing-tab.steps.ts](tests/e2e/steps/packing-tab.steps.ts) — self-seeding `Before`/`After` hooks
- [actions.test.ts](src/app/(app)/trips/actions.test.ts) — action test pattern with `vi.hoisted` mocks

## Dev Agent Record

### Agent Model Used

(To be filled by dev agent)

### Debug Log References

- `npm run db:migrate` (if schema changes — not needed for this story)
- `npx tsc --noEmit`
- `npx vitest run src/app/(app)/trips/actions.test.ts src/components/packt/template-pull-dialog.test.tsx src/components/packt/packing-list-view.test.tsx 'src/app/(app)/trips/[tripId]/use-trip-detail-handlers.test.ts'`
- `npx bddgen`
- `npx playwright test .features-gen/tests/e2e/features/pull-templates.feature.spec.js`
- `npm run lint`
- `npm run test:coverage`
- `npm run test:e2e`
- `npm run build`

### Completion Notes List

(To be filled by dev agent)

### File List

(To be filled by dev agent)
