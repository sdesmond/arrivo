# Story 2.2: Template Item & Label Management

Status: done

<!-- Reviewer: packt-plan-reviewer checked and all BLOCKING issues resolved before presentation. -->

## Story

As a traveler,
I want to add, edit, remove, and reorder items and section labels within a template,
so that each template accurately reflects the items I need for that trip type.

**FRs covered:** FR5, FR6, FR7, FR8, FR9, FR10, FR11, NFR5, NFR7, NFR8, NFR10, NFR12

**This story builds on Story 2.1's template shell.** The `packing_templates` table, template CRUD actions, and the `/packing` library route are already in place. This story adds the per-template item editor at `/packing/[templateId]`, the `packing_template_items` DB table, and item/label CRUD + drag-to-reorder within a template.

Do NOT implement pull-onto-trip (Story 2.3) or save-as-template (Story 2.4) here.

## Acceptance Criteria

**AC1 — Navigate to the template editor**
Given a packing template exists in the library
When the user clicks the template name in the library
Then they are taken to `/packing/[templateId]`
And the page shows the template name as its `<h1>` heading

**AC2 — Add a plain-text item**
Given the user is viewing a template
When they add a plain-text item
Then it appears in the template list at the correct position
And it persists after a page reload

**AC3 — Edit item text inline**
Given a template item exists
When the user edits its text inline and confirms
Then it displays the updated text
And the change persists after a page reload

**AC4 — Remove an item**
Given a template item exists
When the user removes it
Then it is gone from the template list
And the removal persists after a page reload

**AC5 — Add a section label**
Given the user adds a section label to a template
Then it renders visually distinct from items (no checkbox)
And items added after the label appear beneath it in the flat array

**AC6 — Rename a section label**
Given a section label exists in the template
When the user renames it inline and confirms
Then the new name is displayed
And the change persists after a page reload

**AC7 — Delete a section label (items remain ungrouped)**
Given a section label exists in the template with items beneath it
When the user deletes the label via its inline edit controls
Then the label is removed from the list
And items that were beneath the label remain in the template as ungrouped items
And this state persists after a page reload

**AC8 — Drag to reorder**
Given a template has multiple items
When the user drags an item to a new position
Then the item moves to that position
And the new order persists after a page reload

**AC9 — Auth enforcement (NFR5, NFR7)**
Given any template item action (add, edit, remove, reorder)
Then `requireUser()` is enforced before any read or write
And every read/write is scoped to templates owned by the authenticated user
And no user can read, mutate, or enumerate another user's template items

**AC10 — Accessibility (NFR8, NFR10, NFR12)**
Given any interactive element on the template editor page
Then all touch targets are at minimum 44×44px on mobile viewports
And all interactive elements have a visible focus indicator meeting WCAG 2.1 AA contrast
And the entry form input is associated with a `<label>` (visible or `sr-only`)

## Tasks / Subtasks

- [x] **DB schema** — add `packingTemplateItems` table to `src/db/schema.ts` (AC2–AC8)
  - [x] Columns: `id uuid pk`, `templateId uuid notNull references packing_templates.id onDelete:"cascade"`, `text text notNull`, `isLabel boolean notNull default false`, `position integer notNull`, `labelId uuid references packing_template_items.id onDelete:"set null"` (self-referential — `AnyPgColumn` already imported at line 14)
  - [x] `(t) => [index().on(t.templateId, t.position)]` (mirrors `packingItems` index)
- [x] **Types** — add `PACKING TEMPLATE ITEM` section to `src/data/types.ts` (AC2–AC8)
  - [x] `PackingTemplateItem { id: string; templateId: string; text: string; isLabel: boolean; position: number; labelId?: string | null }`
  - [x] `AddTemplateItemInput { text: string; isLabel?: boolean; afterItemId?: string; beforeItemId?: string; labelId?: string | null }`
  - [x] `UpdateTemplateItemInput { text: string }`
- [x] **DB mapper** — `dbTemplateItemToType` in `src/lib/db-mappers.ts` (AC2)
  - [x] Map row → `PackingTemplateItem`; `labelId: row.labelId ?? null`
  - [x] Import `packingTemplateItems` from schema; import `PackingTemplateItem` from types
- [x] **Query** — `getTemplateWithItems` in `src/lib/queries.ts` (AC1, AC2)
  - [x] `getTemplateWithItems(templateId: string, userId: string): Promise<{ template: PackingTemplate; items: PackingTemplateItem[] } | null>`
  - [x] Fetch template `WHERE id = templateId AND userId = userId` — return `null` if not found (caller shows `notFound()`)
  - [x] Fetch items `WHERE templateId = templateId ORDER BY position ASC`
  - [x] Map rows via `dbTemplateItemToType`; import `packingTemplateItems`, `dbTemplateItemToType`, `PackingTemplateItem`
- [x] **Preparatory split of `PackingListSortable`** — file is 363 lines (over 250-line limit); extract pure utilities before modifying (AC2, AC5)
  - [x] Create `src/components/packt/packing-sort-utils.ts` — move and export: `arrayMove`, `collisionDetection`, the types `PackingSection`/`GroupedPackingItems`, and the pure functions `groupPackingItems`, `containerKeyOfItem`, `resolveContainerKey`, `flatten`, `sameOrder`, `computeReorder`, constants `UNGROUPED_KEY`/`CONTAINER_PREFIX`/`containerDomId`
  - [x] Update `packing-list-sortable.tsx` to import from `./packing-sort-utils` instead of defining those symbols locally (brings file to ~150 lines — component logic only)
  - [x] Update `packing-list-sortable.test.tsx`: change `import { PackingListSortable, collisionDetection, arrayMove } from "./packing-list-sortable"` to import `collisionDetection` and `arrayMove` from `"./packing-sort-utils"` — keep `PackingListSortable` from `"./packing-list-sortable"`
  - [x] No behavior change — pure file extraction
- [x] **Modify `PackingListSortable`** — make `onToggleItem` optional (AC2, AC5)
  - [x] `src/components/packt/packing-list-sortable.tsx`: change `onToggleItem: (item: PackingItem) => Promise<void>` to `onToggleItem?: (item: PackingItem) => Promise<void>`; change both `onToggle={() => void onToggleItem(item)}` calls (in sections loop and ungroupedItems) to `onToggle={onToggleItem ? () => void onToggleItem(item) : undefined}`
  - [x] `src/components/packt/packing-list-sortable.test.tsx`: add test that renders without `onToggleItem` → no `role="checkbox"` elements
- [x] **Modify `template-library.tsx`** — make template names navigate to editor (AC1)
  - [x] Import `Link` from `next/link`; wrap the template name `<p>` in `<Link href={"/packing/" + template.id}>` with the same styling (keep rename/delete buttons outside the link)
  - [x] Update `template-library.test.tsx`: add assertion that each template row contains a link pointing to `/packing/${template.id}`
- [x] **Server actions** — `src/app/(app)/packing/[templateId]/actions.ts` with `"use server"` (AC2–AC9)
  - [x] `normalizeItemText(text)`: trim + throw on empty + cap at 100 chars
  - [x] `assertTemplateOwnership(templateId, userId)`: query `packingTemplates WHERE id = templateId AND userId = userId`, throw if not found
  - [x] `assertItemOwnership(itemId, userId)`: `innerJoin packingTemplates WHERE item.id = itemId AND templates.userId = userId`, throw if not found; return `{ templateId }`
  - [x] `addTemplateItem(templateId, input): Promise<{ id: string }>` — `requireUser()`, `assertTemplateOwnership`, normalize text, insert with the same `afterItemId`/`beforeItemId`/append position logic as `addPackingItem` (see `src/app/(app)/trips/actions.ts:464`), `revalidatePath("/packing/${templateId}")`, return `{ id }`
  - [x] `updateTemplateItem(itemId, input): Promise<void>` — `requireUser()`, `assertItemOwnership`, normalize text, update `text`, revalidate
  - [x] `removeTemplateItem(itemId): Promise<void>` — `requireUser()`, `assertItemOwnership`, delete (DB `onDelete: "set null"` on `labelId` makes children ungrouped automatically), revalidate
  - [x] `reorderTemplateItems(templateId, ordered): Promise<void>` — `requireUser()`, `assertTemplateOwnership`, batch `UPDATE position + labelId` in a transaction, revalidate; empty array is no-op
  - [x] Do NOT use `assertTripAccess()` — templates are user-scoped, not trip-scoped
- [x] **Route server page** — `src/app/(app)/packing/[templateId]/page.tsx` (AC1, AC9)
  - [x] `params: Promise<{ templateId: string }>` (this Next.js version — see `src/app/(app)/trips/[tripId]/page.tsx:12-16` for the exact pattern)
  - [x] `await params` to extract `templateId`; `requireUser()`; `getTemplateWithItems(templateId, session.id!)` → `notFound()` if null
  - [x] Render `<TemplateEditorClient template={...} items={...} />`
- [x] **Route client** — `src/app/(app)/packing/[templateId]/page-client.tsx` (`"use client"`) (AC2–AC8)
  - [x] `TemplateEditorClientProps { template: PackingTemplate; items: PackingTemplateItem[] }`
  - [x] State: `localItems: PackingTemplateItem[] | null` (optimistic reorder only), `isAdding: boolean`, `const [, startTransition] = useTransition()`
  - [x] Reset `isAdding` and `localItems` when `items` prop changes (same "derive state from props" render pattern as `PackingListView`)
  - [x] **Do NOT copy `items` into `useState`** — `revalidatePath` after each action re-runs the server component (the `wishlist-section.tsx` pattern)
  - [x] Wrap each action in `startTransition(async () => { try { await action(...) } catch (e) { toast.error(msg) } })`
  - [x] Renders `<TemplateEditorView>` passing `template`, `effectiveItems` (`localItems ?? items`), and action callbacks
- [x] **Component** — `src/components/packt/template-editor-view.tsx` (`"use client"`) (AC1–AC8, AC10)
  - [x] Explicit `TemplateEditorViewProps { template: PackingTemplate; items: PackingTemplateItem[]; onAddItem: (...) => void; onRemoveItem: (id: string) => void; onEditItem: (id: string, text: string) => void; onReorderItems: (ordered: ..., onError?: () => void) => void; isAdding?: boolean; }`
  - [x] Adapter function `toPackingItem(item: PackingTemplateItem): PackingItem` — map `text → name`, add `done: false` (see Dev Notes for full shape)
  - [x] Page header: "Back to Templates" `<Link href="/packing">` + template name as `<h1>`
  - [x] Empty state + entry form ("Add item" / "Add label" buttons) modeled on `PackingListView`'s `PackingEntryForm`
  - [x] When items exist: `<PackingListSortable items={items.map(toPackingItem)} />` without `onToggleItem` (no checkboxes rendered)
  - [x] Wire `onRemoveItem`, `onEditItem`, `onReorderItems` through the adapter (ids are preserved — no translation needed)
- [x] **Unit tests** — colocated, same change
  - [x] `src/lib/db-mappers.test.ts` — `dbTemplateItemToType`
  - [x] `src/components/packt/template-library.test.tsx` — template name links to `/packing/${id}`
  - [x] `src/components/packt/packing-list-sortable.test.tsx` — no checkbox when `onToggleItem` omitted
  - [x] `src/components/packt/template-editor-view.test.tsx` — empty state, add/remove, entry form
  - [x] `src/app/(app)/packing/[templateId]/actions.test.ts` — auth, ownership, CRUD, reorder
  - [x] `src/app/(app)/packing/[templateId]/page-client.test.tsx` — wiring
- [x] **E2E** — new flow, same change (AC1–AC8)
  - [x] `tests/e2e/e2e-seed-data.ts` — add template item seed constants
  - [x] `tests/e2e/global-setup.ts` — add `packing_template_items` to `TRUNCATE` list
  - [x] `tests/e2e/features/template-items.feature` — BDD scenarios (tag `@template-items`)
  - [x] `tests/e2e/steps/template-items.steps.ts` — step defs + self-seeding `Before`/`After` DB hooks
- [x] **Operational** — push schema to both DBs before any test run
  - [x] `npm run db:migrate` (dev) AND `npm run db:migrate:e2e` (E2E) — drizzle-kit push, no migration file expected. Every `/packing/[templateId]` read fails until `packing_template_items` exists.

## Dev Notes

### Existing State — files you touch

| Artifact | Location | Action |
|---|---|---|
| `packingTemplates` table | `src/db/schema.ts:303` | Reference — add `packingTemplateItems` after it |
| `AnyPgColumn` import | `src/db/schema.ts:14` | Already imported — required for `labelId` self-reference |
| `dbTemplateToType` | `src/lib/db-mappers.ts:202` | Add `dbTemplateItemToType` after it |
| `listTemplatesForUser` | `src/lib/queries.ts:127` | Add `getTemplateWithItems` after it |
| `PackingTemplate` types | `src/data/types.ts:401` | Add `PackingTemplateItem` types in the same section |
| `PackingListSortable` | `src/components/packt/packing-list-sortable.tsx` | Make `onToggleItem` optional |
| `template-library.tsx` | `src/components/packt/template-library.tsx` | Add link from template name to editor |
| `addPackingItem` logic | `src/app/(app)/trips/actions.ts:464` | Reference for `addTemplateItem` position logic |
| `packingItems` table | `src/db/schema.ts:217` | DB shape template items mirror (minus `done`/`tripId`; `text` instead of `name`) |
| `packing-tab.steps.ts` | `tests/e2e/steps/packing-tab.steps.ts` | Reference `withE2EDb` helper + self-seeding pattern |
| `templates.steps.ts` | `tests/e2e/steps/templates.steps.ts` | Reference template self-seeding and `getE2EUserId` |

### Schema — exact shape (`src/db/schema.ts`)

Add immediately after the `packingTemplates` table definition:

```ts
export const packingTemplateItems = pgTable(
  "packing_template_items",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    templateId: uuid("template_id")
      .notNull()
      .references(() => packingTemplates.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    isLabel: boolean("is_label").default(false).notNull(),
    position: integer("position").notNull(),
    labelId: uuid("label_id").references((): AnyPgColumn => packingTemplateItems.id, {
      onDelete: "set null",
    }),
  },
  (t) => [index().on(t.templateId, t.position)]
);
```

**Why `labelId`:** The epics spec lists `id, template_id, text, is_label, position` but omits `labelId`. It is required for section grouping: the `PackingListSortable` component tracks which items belong under which label via `labelId`, and AC7 ("items remain ungrouped after label deletion") is enforced at the DB level by `onDelete: "set null"` — the same mechanism as `packingItems.labelId`. Without it, cross-section drag and ungrouping-on-delete cannot be implemented.

**Cascade chain:** Deleting a `packing_templates` row → cascades to `packing_template_items` (via `templateId`). Deleting a label item → sets `labelId = null` on all items that referenced it (they become ungrouped). Story 2.1's dev notes anticipated this: "Story 2.2 will add packing_template_items with a template_id FK (onDelete: 'cascade')".

### Types — exact shape (`src/data/types.ts`)

Add a new section immediately after the existing `PACKING TEMPLATE` section (after line 413):

```ts
// ──────────────────────────────────────────────
// PACKING TEMPLATE ITEM
// ──────────────────────────────────────────────

export interface PackingTemplateItem {
  id: string;
  templateId: string;
  text: string;       // DB column is "text" (not "name") — distinct from template's "name" field
  isLabel: boolean;
  position: number;
  labelId?: string | null;
}

export interface AddTemplateItemInput {
  text: string;
  isLabel?: boolean;
  afterItemId?: string;
  beforeItemId?: string;
  labelId?: string | null;
}

export interface UpdateTemplateItemInput {
  text: string;
}
```

`done` is absent — template items have no checked state; templates are pristine starting points.

### Mapper (`src/lib/db-mappers.ts`)

Add after `dbTemplateToType`:

```ts
export function dbTemplateItemToType(
  row: typeof packingTemplateItems.$inferSelect
): PackingTemplateItem {
  return {
    id: row.id,
    templateId: row.templateId,
    text: row.text,
    isLabel: row.isLabel,
    position: row.position,
    labelId: row.labelId ?? null,
  };
}
```

Add `packingTemplateItems` to the schema import block; add `PackingTemplateItem` to the types import block. `db-mappers.ts` is **covered** (not excluded) — `dbTemplateItemToType` needs tests.

### Query (`src/lib/queries.ts`)

Add after `listTemplatesForUser`:

```ts
export async function getTemplateWithItems(
  templateId: string,
  userId: string
): Promise<{ template: PackingTemplate; items: PackingTemplateItem[] } | null> {
  const [templateRow] = await db
    .select()
    .from(packingTemplates)
    .where(and(eq(packingTemplates.id, templateId), eq(packingTemplates.userId, userId)));
  if (!templateRow) return null;

  const itemRows = await db
    .select()
    .from(packingTemplateItems)
    .where(eq(packingTemplateItems.templateId, templateId))
    .orderBy(asc(packingTemplateItems.position));

  return {
    template: dbTemplateToType(templateRow),
    items: itemRows.map(dbTemplateItemToType),
  };
}
```

Add `packingTemplateItems` to the schema import; add `dbTemplateItemToType` to the mapper import; add `PackingTemplateItem` to the types import. `queries.ts` is **excluded from coverage** — no unit test required, E2E covers it.

### Server actions (`src/app/(app)/packing/[templateId]/actions.ts`)

Auth pattern:
- `addTemplateItem`/`reorderTemplateItems` (known `templateId`): verify `packingTemplates.userId = user.id!` before mutating
- `updateTemplateItem`/`removeTemplateItem` (known `itemId` only): inner-join to `packingTemplates` to verify ownership in one query — prevents cross-user mutation on valid item IDs

```ts
"use server";

import { and, eq, gt, max, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { packingTemplateItems, packingTemplates } from "@/db/schema";
import { requireUser } from "@/lib/auth-helpers";
import type { AddTemplateItemInput, UpdateTemplateItemInput } from "@/data/types";

const ITEM_TEXT_MAX = 100;

function normalizeItemText(text: string | undefined): string {
  const trimmed = (text ?? "").trim();
  if (!trimmed) throw new Error("Item text is required.");
  if (trimmed.length > ITEM_TEXT_MAX)
    throw new Error(`Item text must be ${ITEM_TEXT_MAX} characters or fewer.`);
  return trimmed;
}

async function assertTemplateOwnership(templateId: string, userId: string): Promise<void> {
  const [row] = await db
    .select({ id: packingTemplates.id })
    .from(packingTemplates)
    .where(and(eq(packingTemplates.id, templateId), eq(packingTemplates.userId, userId)));
  if (!row) throw new Error("Template not found.");
}

async function assertItemOwnership(
  itemId: string,
  userId: string
): Promise<{ templateId: string }> {
  const [row] = await db
    .select({ templateId: packingTemplateItems.templateId })
    .from(packingTemplateItems)
    .innerJoin(
      packingTemplates,
      and(
        eq(packingTemplateItems.templateId, packingTemplates.id),
        eq(packingTemplates.userId, userId)
      )
    )
    .where(eq(packingTemplateItems.id, itemId));
  if (!row) throw new Error("Item not found.");
  return row;
}

export async function addTemplateItem(
  templateId: string,
  input: AddTemplateItemInput
): Promise<{ id: string }> {
  const user = await requireUser();
  await assertTemplateOwnership(templateId, user.id!);
  const text = normalizeItemText(input.text);
  const labelId = input.isLabel ? null : (input.labelId ?? null);

  if (input.afterItemId) {
    const [newItem] = await db.transaction(async (tx) => {
      const [target] = await tx
        .select()
        .from(packingTemplateItems)
        .where(
          and(
            eq(packingTemplateItems.id, input.afterItemId!),
            eq(packingTemplateItems.templateId, templateId)
          )
        );
      if (!target) throw new Error("Target item not found.");
      await tx
        .update(packingTemplateItems)
        .set({ position: sql`${packingTemplateItems.position} + 1` })
        .where(
          and(
            eq(packingTemplateItems.templateId, templateId),
            gt(packingTemplateItems.position, target.position)
          )
        );
      return tx
        .insert(packingTemplateItems)
        .values({ templateId, text, isLabel: input.isLabel ?? false, position: target.position + 1, labelId })
        .returning({ id: packingTemplateItems.id });
    });
    if (!newItem) throw new Error("Failed to add item.");
    revalidatePath(`/packing/${templateId}`);
    return { id: newItem.id };
  }

  if (input.beforeItemId) {
    const [newItem] = await db.transaction(async (tx) => {
      const [target] = await tx
        .select()
        .from(packingTemplateItems)
        .where(
          and(
            eq(packingTemplateItems.id, input.beforeItemId!),
            eq(packingTemplateItems.templateId, templateId)
          )
        );
      if (!target) throw new Error("Target item not found.");
      await tx
        .update(packingTemplateItems)
        .set({ position: sql`${packingTemplateItems.position} + 1` })
        .where(
          and(
            eq(packingTemplateItems.templateId, templateId),
            gt(packingTemplateItems.position, target.position - 1)
          )
        );
      return tx
        .insert(packingTemplateItems)
        .values({ templateId, text, isLabel: input.isLabel ?? false, position: target.position, labelId })
        .returning({ id: packingTemplateItems.id });
    });
    if (!newItem) throw new Error("Failed to add item.");
    revalidatePath(`/packing/${templateId}`);
    return { id: newItem.id };
  }

  const [{ maxPos }] = await db
    .select({ maxPos: max(packingTemplateItems.position) })
    .from(packingTemplateItems)
    .where(eq(packingTemplateItems.templateId, templateId));
  const [newItem] = await db
    .insert(packingTemplateItems)
    .values({ templateId, text, isLabel: input.isLabel ?? false, position: (maxPos ?? -1) + 1, labelId })
    .returning({ id: packingTemplateItems.id });
  if (!newItem) throw new Error("Failed to add item.");
  revalidatePath(`/packing/${templateId}`);
  return { id: newItem.id };
}

export async function updateTemplateItem(
  itemId: string,
  input: UpdateTemplateItemInput
): Promise<void> {
  const user = await requireUser();
  const { templateId } = await assertItemOwnership(itemId, user.id!);
  const text = normalizeItemText(input.text);
  await db.update(packingTemplateItems).set({ text }).where(eq(packingTemplateItems.id, itemId));
  revalidatePath(`/packing/${templateId}`);
}

export async function removeTemplateItem(itemId: string): Promise<void> {
  const user = await requireUser();
  const { templateId } = await assertItemOwnership(itemId, user.id!);
  await db.delete(packingTemplateItems).where(eq(packingTemplateItems.id, itemId));
  // DB cascade (onDelete: "set null" on labelId) makes children ungrouped automatically (AC7)
  revalidatePath(`/packing/${templateId}`);
}

export async function reorderTemplateItems(
  templateId: string,
  ordered: { id: string; labelId: string | null; position: number }[]
): Promise<void> {
  const user = await requireUser();
  await assertTemplateOwnership(templateId, user.id!);
  if (ordered.length === 0) return;
  await db.transaction(async (tx) => {
    for (const entry of ordered) {
      await tx
        .update(packingTemplateItems)
        .set({ position: entry.position, labelId: entry.labelId })
        .where(
          and(
            eq(packingTemplateItems.id, entry.id),
            eq(packingTemplateItems.templateId, templateId)
          )
        );
    }
  });
  revalidatePath(`/packing/${templateId}`);
}
```

`max` and `gt` must be imported from `"drizzle-orm"`. `asc` is not needed here (only in `queries.ts`).

### Route shell

**`src/app/(app)/packing/[templateId]/page.tsx`** (server component — no `"use client"`):

```tsx
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { getTemplateWithItems } from "@/lib/queries";
import { TemplateEditorClient } from "./page-client";

export default async function TemplateEditorPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;   // params is a Promise in this Next.js version
  const session = await requireUser();
  const result = await getTemplateWithItems(templateId, session.id!);
  if (!result) notFound();
  return <TemplateEditorClient template={result.template} items={result.items} />;
}
```

The `params: Promise<{ templateId: string }>` shape is confirmed by `src/app/(app)/trips/[tripId]/page.tsx:12-16`.

**`src/app/(app)/packing/[templateId]/page-client.tsx`** (`"use client"`):

```ts
export interface TemplateEditorClientProps {
  template: PackingTemplate;
  items: PackingTemplateItem[];
}
```

State to hold:
- `localItems: PackingTemplateItem[] | null` — optimistic reorder preview
- `isAdding: boolean` — double-submit guard for entry form
- `const [, startTransition] = useTransition()`
- `prevItems: PackingTemplateItem[]` — for "derive from props" reset

Reset pattern (same as `PackingListView`):
```ts
const [prevItems, setPrevItems] = useState(items);
if (prevItems !== items) {
  setPrevItems(items);
  setIsAdding(false);
  setLocalItems(null);
}
const effectiveItems = localItems ?? items;
```

Handlers:
- `handleAddItem`: set `isAdding = true`, call `addTemplateItem` in a `startTransition`
- `handleEditItem(id, text)`: call `updateTemplateItem(id, { text })` in a `startTransition`; `toast.error` on failure
- `handleRemoveItem(id)`: call `removeTemplateItem(id)` in a `startTransition`; `toast.error` on failure
- `handleReorderItems(ordered, onError?)`: optimistic update `setLocalItems(...)`, call `reorderTemplateItems` in `startTransition`; call `onError?.()` on failure (restores list)

Render: `<TemplateEditorView template={template} items={effectiveItems} onAddItem={handleAddItem} .../>`.

**Do NOT mirror `items` in a `useState` initializer.** `revalidatePath` re-runs the server component and feeds fresh props — a `useState(items)` copy would silently go stale after create/edit/remove.

### `PackingListSortable` — split then modify

**Step 1 — extract utilities** (`packing-list-sortable.tsx` is 363 lines; split first):

Create `src/components/packt/packing-sort-utils.ts` and move all pure, non-React exports and helpers there: `arrayMove`, `collisionDetection`, `PackingSection`, `GroupedPackingItems`, `groupPackingItems`, `containerKeyOfItem`, `resolveContainerKey`, `flatten`, `sameOrder`, `computeReorder`, `UNGROUPED_KEY`, `CONTAINER_PREFIX`, `containerDomId`. Update `packing-list-sortable.tsx` to import from `"./packing-sort-utils"`. Update `packing-list-sortable.test.tsx` to import `arrayMove` and `collisionDetection` from `"./packing-sort-utils"` (keep `PackingListSortable` from `"./packing-list-sortable"`).

**Step 2 — make `onToggleItem` optional:**

In `src/components/packt/packing-list-sortable.tsx`, change the interface:

```ts
// before
onToggleItem: (item: PackingItem) => Promise<void>;

// after
onToggleItem?: (item: PackingItem) => Promise<void>;
```

And in the JSX for each sortable row, change:

```tsx
// before
onToggle={() => void onToggleItem(item)}

// after
onToggle={onToggleItem ? () => void onToggleItem(item) : undefined}
```

(There are two such calls — one inside sections and one in `ungroupedItems`. Update both.)

This is non-breaking: existing callers (`PackingListView`) pass `onToggleItem`; the behavior is identical. When `onToggleItem` is `undefined`, `PackingRow`'s existing `{isLabel || !onToggle ? null : <checkbox>}` hides the checkbox automatically.

### Template Editor View component — adapter pattern

`src/components/packt/template-editor-view.tsx` — converts `PackingTemplateItem[]` to `PackingItem[]` to reuse `PackingListSortable` without duplication. The adapter is a private (non-exported) function in the same file:

```ts
function toPackingItem(item: PackingTemplateItem): PackingItem {
  return {
    id: item.id,
    name: item.text,        // text → name for PackingRow display
    done: false,            // no checked state in templates
    position: item.position,
    isLabel: item.isLabel,
    labelId: item.labelId ?? null,
  };
}
```

Props:

```ts
export interface TemplateEditorViewProps {
  template: PackingTemplate;
  items: PackingTemplateItem[];
  onAddItem: (
    text: string,
    isLabel?: boolean,
    afterItemId?: string,
    beforeItemId?: string,
    labelId?: string | null
  ) => void;
  onRemoveItem: (id: string) => void;
  onEditItem: (id: string, text: string) => void;
  onReorderItems: (
    ordered: { id: string; labelId: string | null; position: number }[],
    onError?: () => void
  ) => void;
  isAdding?: boolean;
}
```

Wire-up: item IDs are preserved through the adapter, so callbacks convert cleanly:

```tsx
<PackingListSortable
  items={items.map(toPackingItem)}
  pendingItemIds={new Set()}        // no pending items in template editor
  onRemoveItem={(item) => onRemoveItem(item.id!)}
  onEditItem={(id, name) => onEditItem(id, name)}  // PackingRow passes the edited "name" → this is the updated text
  onReorderItems={onReorderItems}
  onOptimisticReorder={...}         // set local state in page-client
  onAddItem={...}
  // onToggleItem intentionally omitted — no checkboxes
/>
```

The entry form is a private component in `template-editor-view.tsx` (same structure as `PackingListView`'s `PackingEntryForm`). Use `template.id` for the `formId` instead of `tripId`.

Page header layout:
```tsx
<div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
  <div className="flex flex-col gap-1">
    <Link href="/packing" ...>← Back to Templates</Link>
    <h1 ...>{template.name}</h1>
  </div>
  {/* empty state or PackingListSortable + entry form */}
</div>
```

### Template Library — link to editor

In `src/components/packt/template-library.tsx`, add `import Link from "next/link"` and wrap the template name:

```tsx
// before
<p className="truncate" style={...}>{template.name}</p>

// after
<Link
  href={`/packing/${template.id}`}
  className="min-w-0 flex-1 truncate"
  style={{ color: "var(--fg)", fontFamily: "...", fontSize: "...", fontWeight: 600 }}
>
  {template.name}
</Link>
```

Move the `className="min-w-0 flex-1"` wrapper from the enclosing `<div>` to the `<Link>` itself, or keep the div and make the link `block` inside it. Keep the rename/delete `<Button>` elements outside the link. The link's clickable area is the template name only.

### What NOT to do

- Do NOT add `done`/toggle/checkbox to template items — templates are pristine starting points, not packed lists
- Do NOT use `assertTripAccess()` — templates are user-scoped (no trip context); user-scoping is enforced via `WHERE packingTemplates.userId = user.id!`
- Do NOT skip `assertTemplateOwnership` or `assertItemOwnership` — these are the NFR7 enforcement mechanism
- Do NOT add strikethrough on labels — templates have no `done` state; label strikethrough is a trip-list feature (Story 1.4)
- Do NOT implement pull-onto-trip or save-as-template (Stories 2.3 / 2.4)
- Do NOT hardcode hex/rgb — always CSS custom properties
- Do NOT redefine types locally — all new types in `src/data/types.ts`
- Do NOT use `window.confirm` for label deletion — the inline-edit trash icon in `PackingRow` is the existing pattern
- Do NOT copy `items` into `useState` in `TemplateEditorClient` — optimistic reorder uses `localItems`; persistent state comes from `revalidatePath` re-running the server component

### Accessibility (AC10 — NFR8, NFR10, NFR12)

- **Entry form input**: must have `<label htmlFor>` (visible or `sr-only`) — never an unlabeled input
- **"Add item" / "Add label" buttons**: `min-h-11 min-w-11` touch targets (same pattern as `PackingListView`)
- **Drag handles**: `SortablePackingRow` already implements `aria-label`, `role="button"`, `tabIndex={0}`, and keyboard focus return after drag — reused at no cost via the existing component
- **"Back to Templates" link**: descriptive text, not just "Back" or "←"
- **Heading hierarchy**: `<h1>` = template name; section labels are `<h3>` (already implemented in `PackingRow`)
- **Touch targets for remove buttons**: already meet 44×44px in `PackingRow` via `className="min-h-11 min-w-11"`

## Previous Story Intelligence (Story 2.1)

From Story 2.1 review findings — patterns enforced there that apply here too:

- **`requireUser()` must be the first line of every action** — auth before any DB read. `assertTemplateOwnership` and `assertItemOwnership` are called after `requireUser()`.
- **No `window.confirm`** — confirmed across the project; use inline trash icon in `PackingRow` for label deletion.
- **E2E must self-seed at the DB level in `Before` hooks** — chained UI-driven setup races server-action revalidation (Story 2.1 `feedback_e2e_self_seeding` memory). Template item steps seed via DB (insert `packing_templates` + `packing_template_items` rows directly).
- **`toast` is globally mounted** — import from `sonner`, never add a second `<Toaster>`.
- **`session.id!`** — the non-null assertion is the established idiom after `requireUser()`.
- **`revalidatePath` after every mutation** — or the page goes stale. Here it's `revalidatePath("/packing/${templateId}")`.
- **Return guard on insert** — Story 2.1 review flagged `const [row] = db.insert().returning()` destructuring without a null guard; `addTemplateItem` uses `if (!newItem) throw`.
- **Do NOT mirror `items` prop in `useState`** — Story 2.1 review mandated the `wishlist-section.tsx`/`revalidatePath` pattern for prop-driven list updates.

## Git Intelligence

All Epic 1 stories are merged and `done`. Story 2.1 (template CRUD shell) is in `review` state — its implementation files exist and are the direct foundation for this story. No in-flight packing work conflicts. Follow the same drizzle-kit push convention (no migration file) used in Story 2.1 for `packing_templates`.

## Testing

### Test layering (mandatory — no cross-layer duplication)

| Behavior | Layer | File |
|---|---|---|
| `dbTemplateItemToType` field mapping | Unit | `src/lib/db-mappers.test.ts` |
| Template library row links to editor | Unit | `src/components/packt/template-library.test.tsx` |
| `arrayMove` / `collisionDetection` / `computeReorder` utilities | Unit | `src/components/packt/packing-list-sortable.test.tsx` (update imports from `packing-sort-utils`) |
| No checkbox rendered when `onToggleItem` omitted | Unit | `src/components/packt/packing-list-sortable.test.tsx` |
| Editor empty state + entry form + add/remove callbacks | Unit | `src/components/packt/template-editor-view.test.tsx` |
| Actions: auth, ownership scoping, CRUD, reorder | Unit | `src/app/(app)/packing/[templateId]/actions.test.ts` |
| page-client dialog/handler wiring | Unit | `src/app/(app)/packing/[templateId]/page-client.test.tsx` |
| Navigate to editor + add/edit/remove + label delete/persist | E2E | `tests/e2e/features/template-items.feature` (+ steps) |

Coverage: `src/components/packt/**` and `src/lib/db-mappers.ts` are enforced (≥95% lines/functions, ≥90% branches). `src/app/**` is excluded — still author `actions.test.ts` and `page-client.test.tsx` per the colocated-test convention.

### Unit test specifics

**`db-mappers.test.ts`** — add a `dbTemplateItemToType` block:
- Full row (all fields, `labelId` present) → all fields mapped correctly; `labelId` is the string value
- Row with `labelId: null` → `labelId: null` (not `undefined`)

**`template-library.test.tsx`** — extend existing tests:
- Render with one template → the template name appears as a link (`getByRole("link", { name: templateName })`) with `href="/packing/${template.id}"`
- Rename and delete buttons are still present and fire their callbacks

**`packing-list-sortable.test.tsx`** — add a test block:
- Render without `onToggleItem` prop → `queryAllByRole("checkbox")` returns empty (no checkboxes rendered)

**`template-editor-view.test.tsx`**:
- Empty state renders when `items=[]`; entry form "Add item" and "Add label" buttons are present
- Blank input: "Add item" does not call `onAddItem`
- After typing text, clicking "Add item" calls `onAddItem(trimmedText, false, ...)`
- After typing text, clicking "Add label" calls `onAddItem(trimmedText, true, ...)`
- With items present: renders each item name (mock `PackingListSortable`)

**`actions.test.ts`** (model on `src/app/(app)/packing/actions.test.ts` with `vi.hoisted` mocks for `requireUser`, `db`, `revalidatePath`, schema, `drizzle-orm`):
- `addTemplateItem`: calls `requireUser()` first; calls `assertTemplateOwnership` (template not found → throws); normalizes text (empty → throws; >100 chars → throws); inserts row; returns `{ id }`; calls `revalidatePath("/packing/${templateId}")`
- `updateTemplateItem`: calls `requireUser()` + ownership join check; updates `text`; revalidates; throws on empty text
- `removeTemplateItem`: calls `requireUser()` + ownership check; deletes item; revalidates
- `reorderTemplateItems`: calls `requireUser()` + ownership check; empty array → no transaction; non-empty → updates position+labelId in loop; revalidates

### E2E specifics

**Add to `tests/e2e/e2e-seed-data.ts`:**

```ts
export const E2E_TEMPLATE_EDITOR = { name: "Editor Template" };
export const E2E_TEMPLATE_EDITOR_ITEMS = [
  { text: "Sunscreen", isLabel: false, position: 0 },
  { text: "Sunglasses", isLabel: false, position: 1 },
];
export const E2E_TEMPLATE_LABEL_ITEMS = [
  { text: "Beach Gear", isLabel: true, position: 0 },
  { text: "Towel", isLabel: false, position: 1 },
];
```

**`tests/e2e/global-setup.ts`**: add `packing_template_items` to the `TRUNCATE` list (it cascades from `packing_templates` already, but list it explicitly for isolation — same rationale as `packing_templates` in Story 2.1):

```sql
TRUNCATE users, accounts, sessions, verification_tokens,
         trips, days, events, documents, collaborators, packing_items,
         packing_templates, packing_template_items
CASCADE
```

**`tests/e2e/steps/template-items.steps.ts`**: reuse the `withE2EDb` + `getE2EUserId` helpers from `templates.steps.ts` (copy — they are short and there is no shared utility yet). Seed both `packing_templates` and `packing_template_items`. `After` hook deletes the template rows (cascade removes items). Tag: `@template-items`.

Seeding `packing_template_items` with a `labelId` (for the label-delete scenario):
```ts
async function seedTemplateWithLabelAndItem(templateName: string): Promise<void> {
  await withE2EDb(async (db) => {
    const userId = await getE2EUserId(db);
    const [template] = await db.insert(packingTemplates).values({ userId, name: templateName }).returning({ id: packingTemplates.id });
    const [label] = await db.insert(packingTemplateItems)
      .values({ templateId: template.id, text: "Beach Gear", isLabel: true, position: 0 })
      .returning({ id: packingTemplateItems.id });
    await db.insert(packingTemplateItems)
      .values({ templateId: template.id, text: "Towel", isLabel: false, position: 1, labelId: label.id });
  });
}
```

Navigate to the template editor by clicking its name in the library, or directly via `page.goto("/packing/${templateId}")` after seeding.

**`tests/e2e/features/template-items.feature`:**

```gherkin
@template-items
Feature: Template item and label management
  Background:
    Given I am signed in

  Scenario: Navigate to a template editor from the library
    Given I have a packing template named "Editor Template"
    When I open the templates page
    And I click on the template "Editor Template"
    Then I should be on the template editor for "Editor Template"

  Scenario: Add a plain-text item and keep it after reload
    Given I have a packing template named "Editor Template" with no items
    When I open the template editor for "Editor Template"
    And I add a template item "Sunscreen"
    Then the template editor should contain "Sunscreen"
    When I reload the page
    Then the template editor should contain "Sunscreen"

  Scenario: Edit a template item and keep it after reload
    Given I have a packing template "Editor Template" with item "Sunscreen"
    When I open the template editor for "Editor Template"
    And I edit the template item "Sunscreen" to "SPF 50 Sunscreen"
    Then the template editor should contain "SPF 50 Sunscreen"
    When I reload the page
    Then the template editor should contain "SPF 50 Sunscreen"

  Scenario: Remove a template item and keep it removed after reload
    Given I have a packing template "Editor Template" with item "Sunscreen"
    When I open the template editor for "Editor Template"
    And I remove the template item "Sunscreen"
    Then the template editor should not contain "Sunscreen"
    When I reload the page
    Then the template editor should not contain "Sunscreen"

  Scenario: Add a section label
    Given I have a packing template named "Editor Template" with no items
    When I open the template editor for "Editor Template"
    And I add a template label "Beach Gear"
    Then the template editor should contain a label "Beach Gear"

  Scenario: Delete a section label, items remain ungrouped after reload
    Given I have a packing template "Editor Template" with label "Beach Gear" and item "Towel" beneath it
    When I open the template editor for "Editor Template"
    And I delete the template label "Beach Gear"
    Then the template editor should not contain a label "Beach Gear"
    And the template editor should contain "Towel"
    When I reload the page
    Then the template editor should contain "Towel"
```

The E2E web server runs on port 3001 with `NEXT_DISTDIR=.next-e2e`. Run `npm run db:migrate:e2e` after adding `packing_template_items` before the first E2E run.

### Project Structure Notes

- New route folder `src/app/(app)/packing/[templateId]/` parallels `src/app/(app)/trips/[tripId]/` (server `page.tsx` → client `page-client.tsx` → colocated `actions.ts`). Consistent with the established route pattern.
- Domain components (`TemplateEditorView`) in `src/components/packt/` — the route only orchestrates.
- No conflicts with the unified structure. Shared-file edits are additive: `schema.ts`, `types.ts`, `db-mappers.ts`, `queries.ts`, `packing-list-sortable.tsx`, `template-library.tsx`, `e2e-seed-data.ts`, `global-setup.ts`.

### Files to Create

| File | Purpose |
|---|---|
| `src/components/packt/packing-sort-utils.ts` | Pure sort/group utilities extracted from `packing-list-sortable.tsx` |
| `src/app/(app)/packing/[templateId]/page.tsx` | Server route — fetch template + items |
| `src/app/(app)/packing/[templateId]/page-client.tsx` | Client orchestration (action handlers, optimistic reorder) |
| `src/app/(app)/packing/[templateId]/page-client.test.tsx` | Wiring tests |
| `src/app/(app)/packing/[templateId]/actions.ts` | Template item CRUD server actions |
| `src/app/(app)/packing/[templateId]/actions.test.ts` | Action unit tests |
| `src/components/packt/template-editor-view.tsx` | Template item list + entry form (presentational) |
| `src/components/packt/template-editor-view.test.tsx` | Component tests |
| `tests/e2e/features/template-items.feature` | BDD scenarios |
| `tests/e2e/steps/template-items.steps.ts` | Step defs + self-seeding `Before`/`After` hooks |

### Files to Modify

| File | Change |
|---|---|
| `src/db/schema.ts` | Add `packingTemplateItems` table |
| `src/data/types.ts` | Add `PackingTemplateItem`, `AddTemplateItemInput`, `UpdateTemplateItemInput` |
| `src/lib/db-mappers.ts` | Add `dbTemplateItemToType` (+ imports) |
| `src/lib/db-mappers.test.ts` | Add `dbTemplateItemToType` tests |
| `src/lib/queries.ts` | Add `getTemplateWithItems` (+ imports) |
| `src/components/packt/packing-list-sortable.tsx` | Extract utilities to `packing-sort-utils.ts`; make `onToggleItem` optional |
| `src/components/packt/packing-list-sortable.test.tsx` | Update imports to `packing-sort-utils`; add no-checkbox test |
| `src/components/packt/template-library.tsx` | Make template name a link to `/packing/[id]` |
| `src/components/packt/template-library.test.tsx` | Assert template name links to editor |
| `tests/e2e/e2e-seed-data.ts` | Add template item seed constants |
| `tests/e2e/global-setup.ts` | Add `packing_template_items` to `TRUNCATE` |

### References

- [Epics doc](_bmad-output/implementation-artifacts/epics.md) — Epic 2, Story 2.2 (lines 355-394); FR5–FR11, NFR5–NFR12
- [Story 2.1](_bmad-output/implementation-artifacts/2-1-template-library-create-rename-and-delete-templates.md) — template shell, auth patterns, review learnings (search for "Previous Story Intelligence", "Review Findings")
- [Project context](_bmad-output/project-context.md) — stack versions, route split, server-action rules, CSS tokens, coverage rules
- [packingItems table](src/db/schema.ts:217) — DB shape `packingTemplateItems` mirrors
- [addPackingItem action](src/app/(app)/trips/actions.ts:464) — position logic to replicate in `addTemplateItem`
- [PackingListView](src/components/packt/packing-list-view.tsx) — entry form + derive-from-props reset pattern
- [PackingListSortable](src/components/packt/packing-list-sortable.tsx) — DnD context to reuse (after making `onToggleItem` optional)
- [PackingRow / SortablePackingRow](src/components/packt/packing-list-row.tsx) — row rendering (inline edit, drag handle, remove button)
- [packing-tab.steps.ts](tests/e2e/steps/packing-tab.steps.ts) — `withE2EDb`, self-seeding `Before`/`After` hooks
- [templates.steps.ts](tests/e2e/steps/templates.steps.ts) — template seeding + `getE2EUserId` helper
- [trips/[tripId]/page.tsx](src/app/(app)/trips/[tripId]/page.tsx) — `params: Promise<{ ... }>` pattern (lines 12-16)

### Review Findings

#### Patch (fixable — no human input needed)

- [x] [Review][Patch] `"use client"` on `packing-sort-utils.ts` — removed. [`src/components/packt/packing-sort-utils.ts:1`]
- [ ] [Review][Dismiss] Dead imports in `packing-list-sortable.test.tsx` — `closestCenter`, `pointerWithin`, `rectIntersection` are still used for mocking `collisionDetection` in the test file. Not dead imports. [`src/components/packt/packing-list-sortable.test.tsx:5-7`]
- [x] [Review][Patch] `section.label.id!` non-null assertion in `computeReorder` — added `if (!section.label.id) return null` guard before Map key insertion. [`src/components/packt/packing-sort-utils.ts:117`]

#### Deferred (pre-existing, not introduced by this change)

- [x] [Review][Defer] `computeReorder.flatten` reassigns all positions from 0 — on optimistic rollback, original DB positions are lost; the rollback payload carries freshly numbered positions that may not match persisted state. [`src/components/packt/packing-sort-utils.ts:59-75`] — deferred, pre-existing
- [x] [Review][Defer] No `labelId` index on `packingTemplateItems` — the composite index `(templateId, position)` covers template-scoped queries but queries filtering by `labelId` alone would scan all rows. [`src/db/schema.ts:367`] — deferred, pre-existing pattern
- [x] [Review][Defer] computeReorder silently swallows label drags with no feedback — when `active.isLabel` is true, the function returns `null` with no event, error, or UI feedback. User sees the drag do nothing. [`src/components/packt/packing-sort-utils.ts:111-113`] — deferred, pre-existing behavior
- [x] [Review][Defer] `byPosition` uses `Infinity` fallback — when ALL items in a sort group have `undefined` position, `Infinity - Infinity` produces `NaN`, making sort order undefined. [`src/components/packt/packing-sort-utils.ts:23-25`] — deferred, pre-existing
- [x] [Review][Defer] Label with undefined `id` added to `Set` — if a label `PackingItem` lacks an `id`, it's inserted into the labelIds Set as the string `"undefined"`, causing downstream containment checks to silently fail. [`src/components/packt/packing-sort-utils.ts:29`] — deferred, pre-existing
- [x] [Review][Defer] `containerKeyOfItem` returns null when label `id` is undefined — the `section.label.id ?? null` coalesce produces null when a label has a falsy id, making `activeKey` null and causing `computeReorder` to return null silently. [`src/components/packt/packing-sort-utils.ts:42-43`] — deferred, pre-existing
- [x] [Review][Defer] Item in reorder array with undefined `id` or `position` — `onReorderItems` callback in `PackingListSortable` can be invoked with `id: undefined` or `position: undefined` for items missing those fields. [`src/components/packt/packing-list-sortable.tsx:126`] — deferred, pre-existing

#### Dismissed (5 findings)
- Seed data constants unused in global-setup — they ARE consumed in `template-items.steps.ts`
- Missing migration file — per spec: "drizzle-kit push, no migration file expected"
- E2E_TEMPLATE_USER password hash — both users use `E2E_PASSWORD` env var, same hash, correct
- Route `/packing/[templateId]` doesn't exist — it DOES exist as the new untracked `page.tsx` and `page-client.tsx`
- Input types omit `templateId` — by design, `templateId` comes from the URL param, not the input type

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `npm run db:migrate`
- `npm run db:migrate:e2e`
- `npx tsc --noEmit`
- `npx vitest run src/lib/db-mappers.test.ts src/components/packt/packing-list-sortable.test.tsx src/components/packt/template-library.test.tsx src/components/packt/template-editor-view.test.tsx 'src/app/(app)/packing/[templateId]/actions.test.ts' 'src/app/(app)/packing/[templateId]/page-client.test.tsx`
- `npx bddgen`
- `npx playwright test .features-gen/tests/e2e/features/template-items.feature.spec.js`
- `npm run lint`
- `npm run test:coverage`
- `npm run test:e2e`
- `npm run build`

### Completion Notes List

- Added `packing_template_items` schema, template item types, DB mapper, and `getTemplateWithItems` query to support per-template item data.
- Extracted `packing-sort-utils`, made `PackingListSortable` checkbox behavior optional, and linked template names from the library to their editor route.
- Implemented `/packing/[templateId]` server page, client orchestration, template item server actions, and `TemplateEditorView` with inline add/edit/remove/reorder support.
- Added unit coverage for mapper, sortable, library, editor view, page client, and server actions, plus a new `@template-items` Playwright BDD feature with isolated template-user seeding.
- Validated the completed story with lint, TypeScript, coverage, build, database pushes, targeted browser coverage, and a passing full `npm run test:e2e` sweep.

### File List

- `src/db/schema.ts`
- `src/data/types.ts`
- `src/lib/db-mappers.ts`
- `src/lib/db-mappers.test.ts`
- `src/lib/queries.ts`
- `src/components/packt/packing-sort-utils.ts`
- `src/components/packt/packing-list-sortable.tsx`
- `src/components/packt/packing-list-sortable.test.tsx`
- `src/components/packt/template-library.tsx`
- `src/components/packt/template-library.test.tsx`
- `src/components/packt/template-editor-view.tsx`
- `src/components/packt/template-editor-view.test.tsx`
- `src/app/(app)/packing/[templateId]/page.tsx`
- `src/app/(app)/packing/[templateId]/page-client.tsx`
- `src/app/(app)/packing/[templateId]/page-client.test.tsx`
- `src/app/(app)/packing/[templateId]/actions.ts`
- `src/app/(app)/packing/[templateId]/actions.test.ts`
- `tests/e2e/e2e-seed-data.ts`
- `tests/e2e/global-setup.ts`
- `tests/e2e/features/template-items.feature`
- `tests/e2e/steps/template-items.steps.ts`

### Change Log

- 2026-06-02: Implemented Story 2.2 template editor data model, route, UI, tests, and E2E coverage; validated with migrations, coverage, build, and full E2E.
