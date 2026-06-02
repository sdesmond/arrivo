# Story 2.1: Template Library — Create, Rename & Delete Templates

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a traveler,
I want a dedicated template library where I can create, rename, and delete named packing templates,
so that I have a personal collection of reusable item collections I can pull into future trips.

**FRs covered:** FR1, FR2, FR3, FR4, FR38, NFR5, NFR7, NFR8, NFR10, NFR12

**This is the first story of Epic 2.** It builds the structural foundation (DB table, app-level route, sidebar nav, template CRUD shell). It deliberately ships **templates with names only** — items and section labels inside a template come in Story 2.2; pulling templates onto trips comes in 2.3. Do not implement those here.

## Acceptance Criteria

**AC1 — Sidebar navigation entry (desktop)**
Given the user is on the desktop app
When they look at the sidebar
Then they see a navigation link labeled "Packing Templates" that routes to `/packing`
And the link shows the active state when the current route is `/packing`

**AC2 — Library list view**
Given the user navigates to `/packing`
When the page loads
Then they see all of their packing templates listed by name

**AC3 — Empty state**
Given the user has no templates
When they open `/packing`
Then they see an empty state prompting them to create their first template
And the empty state offers an action to create a template

**AC4 — Create a template**
Given the user provides a non-empty name and confirms creation
Then a new template appears in the library list
And it persists after a page reload

**AC5 — Create validation**
Given the user attempts to create a template with an empty or whitespace-only name
Then a validation error is shown and no template is created
And names are trimmed and capped at 100 characters

**AC6 — Rename a template**
Given a template exists
When the user renames it to a new non-empty name and confirms
Then the template displays the new name
And the change persists after a page reload

**AC7 — Delete a template**
Given a template exists
When the user deletes it (after confirming via a dialog, not `window.confirm`)
Then it is removed from the library
And the deletion persists after a page reload

**AC8 — User scoping & auth (NFR5, NFR7)**
Given any template action (create, rename, delete) or the library read
Then `requireUser()` is enforced first
And every read/write is scoped to the authenticated user's own templates (`WHERE user_id = <session user>`)
And no user can read, modify, enumerate, or delete another user's templates

**AC9 — Accessibility (NFR8, NFR10, NFR12)**
Given any interactive element on the library page (nav link, New button, rename/delete affordances, dialog inputs/buttons)
Then all touch targets are at minimum 44×44px on mobile viewports
And all interactive elements have a visible focus indicator meeting WCAG 2.1 AA contrast
And icon-only buttons have a `title` + accessible name

## Tasks / Subtasks

- [x] **DB schema** — add `packingTemplates` table to `src/db/schema.ts` (AC: 4, 8)
  - [x] `id uuid pk default gen_random_uuid()`, `userId uuid notNull references users.id onDelete:"cascade"`, `name text notNull`, `createdAt timestamp withTimezone default now()`
  - [x] Add `index().on(t.userId)` (mirrors `userWishlistDestinations` / `userCompanions`)
  - [x] Do NOT add a unique constraint on name — duplicate template names are allowed (spec lists only id/user_id/name/created_at)
- [x] **Types** — add to `src/data/types.ts` in a new `PACKING TEMPLATE` section (AC: 2, 4, 6)
  - [x] `PackingTemplate { id: string; name: string; createdAt?: string }`
  - [x] `CreatePackingTemplateInput { name: string }`
  - [x] `UpdatePackingTemplatePatch { name: string }`
  - [x] Do NOT add an `items` field yet (Story 2.2)
- [x] **DB mapper** — `dbTemplateToType` in `src/lib/db-mappers.ts` (AC: 2)
  - [x] Map row → `PackingTemplate`; `createdAt: row.createdAt?.toISOString() ?? undefined`
  - [x] Import `packingTemplates` from schema and `PackingTemplate` type
- [x] **Query** — `listTemplatesForUser(userId: string): Promise<PackingTemplate[]>` in `src/lib/queries.ts` (AC: 2, 8)
  - [x] `db.select().from(packingTemplates).where(eq(packingTemplates.userId, userId)).orderBy(asc(packingTemplates.name), asc(packingTemplates.createdAt))`
  - [x] Map rows via `dbTemplateToType`
- [x] **Server actions** — new file `src/app/(app)/packing/actions.ts` with `"use server"` (AC: 4, 5, 6, 7, 8)
  - [x] `normalizeTemplateName(name)` helper: `trim()`, throw on empty, throw if > 100 chars
  - [x] `createTemplate(input: CreatePackingTemplateInput): Promise<{ id: string }>` — `requireUser()`; insert `{ userId: user.id!, name }`; `.returning({ id })`; `revalidatePath("/packing")`; return `{ id }`
  - [x] `renameTemplate(id: string, patch: UpdatePackingTemplatePatch): Promise<void>` — `requireUser()`; `update(...).set({ name }).where(and(eq(id), eq(userId, user.id!)))`; `revalidatePath("/packing")`
  - [x] `deleteTemplate(id: string): Promise<void>` — `requireUser()`; `delete(...).where(and(eq(id), eq(userId, user.id!)))`; `revalidatePath("/packing")`
  - [x] Do NOT call `assertTripAccess` — templates are user-scoped, not trip-scoped
- [x] **Route shell** — `src/app/(app)/packing/page.tsx` (server) (AC: 2, 3, 8)
  - [x] `const session = await requireUser();` then `const templates = await listTemplatesForUser(session.id!);`
  - [x] Render `<TemplatesPageClient templates={templates} />`
- [x] **Route shell** — `src/app/(app)/packing/page-client.tsx` (`"use client"`) (AC: 4, 5, 6, 7)
  - [x] **Render the list directly from the `templates` prop — do NOT copy it into `useState`.** After each action's `revalidatePath("/packing")`, the server component re-runs and passes fresh props (the `wishlist-section.tsx` pattern). A `useState(templates)` copy would go stale because the initializer ignores later prop changes.
  - [x] Local state is ONLY: create-dialog open, the template being renamed, the template being deleted, and `useTransition` pending
  - [x] Calls `createTemplate` / `renameTemplate` / `deleteTemplate`; `toast.error(...)` on failure; close the relevant dialog on success
  - [x] Renders `<TemplateLibrary>` + `<TemplateFormDialog>` (create & rename) + `<DeleteTemplateAlertDialog>`
- [x] **Component** — `src/components/packt/template-library.tsx` (`"use client"`) (AC: 2, 3, 6, 7, 9)
  - [x] `TemplateLibraryProps { templates: PackingTemplate[]; onNew: () => void; onRename: (t: PackingTemplate) => void; onDelete: (t: PackingTemplate) => void }`
  - [x] Page header "Packing Templates" + "New template" button (calls `onNew`)
  - [x] When `templates.length === 0` → render empty state (use `Empty` primitives from `@/components/ui/empty`) with a create-first-template action wired to `onNew`
  - [x] Otherwise render each template as a row: name + rename button + delete button (icon buttons need `title` + `aria-label`; min 44×44px touch target)
- [x] **Component** — `src/components/packt/template-form-dialog.tsx` (`"use client"`) (AC: 4, 5, 6, 9)
  - [x] Explicit `TemplateFormDialogProps { mode: "create" | "rename"; initialName?: string; open: boolean; onOpenChange: (open: boolean) => void; onSubmit: (name: string) => void | Promise<void>; isPending?: boolean }`
  - [x] Shared create/rename Base UI `Dialog` (`@/components/ui/dialog`) with `DialogTitle` + `DialogDescription` reflecting mode ("New template" / "Rename template")
  - [x] Name input is associated with a `<label htmlFor>` (visible or `sr-only` + `aria-label`); `autoFocus` the input on open
  - [x] Controlled text input, `maxLength={100}`, Enter submits, trim before submit, disable submit when empty/whitespace
- [x] **Component** — `src/components/packt/delete-template-alert-dialog.tsx` (`"use client"`) (AC: 7)
  - [x] Explicit `DeleteTemplateAlertDialogProps { templateName: string; open: boolean; onOpenChange: (open: boolean) => void; onConfirm: () => void | Promise<void>; isDeleting?: boolean }`
  - [x] Model exactly on `delete-trip-alert-dialog.tsx`: `AlertDialog` with a destructive confirm button
- [x] **Sidebar nav** — `src/components/packt/sidebar-nav.tsx` (AC: 1)
  - [x] Add `{ id: "templates", label: "Packing Templates", icon: LayoutTemplate, href: "/packing" }` to `NAV_ITEMS` (import `LayoutTemplate` from `lucide-react`), placed after the Trips entry
  - [x] Extend the active check: `pathname === item.href || (item.href === "/trips" && pathname.startsWith("/trips")) || (item.href === "/packing" && pathname.startsWith("/packing"))`
  - [x] Do NOT modify `bottom-tab-bar.tsx` (mobile entry point is TBD per spec)
- [x] **Unit tests** — colocated, same change (see Testing section for the full list)
  - [x] `src/lib/db-mappers.test.ts` — `dbTemplateToType`
  - [x] `src/components/packt/template-library.test.tsx`
  - [x] `src/components/packt/template-form-dialog.test.tsx`
  - [x] `src/components/packt/delete-template-alert-dialog.test.tsx`
  - [x] `src/components/packt/sidebar-nav.test.tsx` — assert the new nav item
  - [x] `src/app/(app)/packing/actions.test.ts` — create/rename/delete (auth, user-scoping, validation, revalidate)
  - [x] `src/app/(app)/packing/page-client.test.tsx` — dialog wiring + handler calls (optional but follows the trips/profile precedent)
- [x] **E2E** — new flow, same change (AC: 1, 2, 3, 4, 6, 7)
  - [x] `tests/e2e/e2e-seed-data.ts` — add template seed constants
  - [x] `tests/e2e/global-setup.ts` — add `packing_templates` to the `TRUNCATE` list
  - [x] `tests/e2e/features/templates.feature` — scenarios below
  - [x] `tests/e2e/steps/templates.steps.ts` — step defs + self-seeding `Before`/`After` hooks (DB-level, user-scoped)
- [x] **Operational (before merge/run)** — push schema to both DBs
  - [x] `npm run db:migrate` (dev) **and** `npm run db:migrate:e2e` (E2E) — drizzle-kit push, no migration file expected. Every `/packing` read/write fails until the table exists.

## Dev Notes

### Existing State (Brownfield) — files you touch

| Artifact | Location | Action |
|---|---|---|
| `packingItems` table | `src/db/schema.ts:217` | Reference only — add `packingTemplates` nearby (after `userCompanions`) |
| `dbPackingItemToType` etc. | `src/lib/db-mappers.ts:188` | Add `dbTemplateToType` |
| `getUserById`, `listTripsForUser` | `src/lib/queries.ts:41` | Add `listTemplatesForUser`; import `packingTemplates`, `dbTemplateToType` |
| `NAV_ITEMS`, active check | `src/components/packt/sidebar-nav.tsx:11,81` | Add Packing Templates entry |
| `DeleteTripAlertDialog` | `src/components/packt/delete-trip-alert-dialog.tsx` | Copy pattern for `DeleteTemplateAlertDialog` |
| `WishlistSection` (user-scoped CRUD) | `src/app/(app)/profile/wishlist-section.tsx` | Reference pattern for simple add/delete + `useTransition` |
| Profile user-scoped actions | `src/app/(app)/profile/actions.ts:100` | Reference: `requireUser()` + `and(eq(id), eq(userId, session.id!))` scoping |
| Trips create/delete actions | `src/app/(app)/trips/actions.ts:152,401` | Reference: `requireUser()`, `.returning()`, `revalidatePath` |

### What NOT to do

- Do NOT use `assertTripAccess()` here — it is trip-scoped and calls `notFound()`; templates are user-scoped. Scope with `eq(packingTemplates.userId, user.id!)` instead.
- Do NOT add template **items** or **section labels** (Story 2.2) — no `packing_template_items` table, no `items` field on `PackingTemplate`, no item count badge yet.
- Do NOT add **pull-onto-trip** or **save-as-template** behavior (Stories 2.3 / 2.4).
- Do NOT add a mobile nav entry (`bottom-tab-bar.tsx`) — mobile entry point is explicitly TBD. The page must still render correctly if reached by URL on mobile (responsive + 44px targets).
- Do NOT use `window.confirm` for delete — use the `AlertDialog` pattern (project convention, confirmed across Epic 1 reviews). Note: `profile/page-client.tsx` uses `window.confirm` for unsaved-changes; do not copy that for delete.
- Do NOT hardcode hex/rgb — colors via CSS custom properties / token utilities only.
- Do NOT redefine types locally — all template types go in `src/data/types.ts`.
- Do NOT add a `unique` constraint on `(user_id, name)` — duplicates are allowed.
- Do NOT order the list by `createdAt desc` for the primary sort — order by `name` so AC2 ("listed by name") and E2E assertions are deterministic.

### Route naming decision

Use **`/packing`** (route group `(app)`, folder `src/app/(app)/packing/`) with nav label **"Packing Templates"**. This base path leaves room for Story 2.2's per-template editor at `/packing/[templateId]`. No existing route or symbol named `templates` exists (verified).

### Schema — exact shape (`src/db/schema.ts`)

```ts
export const packingTemplates = pgTable(
  "packing_templates",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
  },
  (t) => [index().on(t.userId)]
);
```

`index`, `timestamp`, `uuid`, `text`, `sql` are already imported in `schema.ts`. Story 2.2 will add `packing_template_items` with a `template_id` FK (`onDelete: "cascade"`), so a future template delete cascades its items — no extra cleanup needed here.

### Types — exact shape (`src/data/types.ts`)

```ts
// ──────────────────────────────────────────────
// PACKING TEMPLATE
// ──────────────────────────────────────────────

export interface PackingTemplate {
  id: string;
  name: string;
  createdAt?: string; // ISO 8601 datetime
}

export interface CreatePackingTemplateInput {
  name: string;
}

export interface UpdatePackingTemplatePatch {
  name: string;
}
```

### Mapper (`src/lib/db-mappers.ts`)

```ts
export function dbTemplateToType(row: typeof packingTemplates.$inferSelect): PackingTemplate {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt?.toISOString() ?? undefined,
  };
}
```

Add `packingTemplates` to the schema import block and `PackingTemplate` to the type import block. `db-mappers.ts` is **covered** (not excluded) — `dbTemplateToType` needs a colocated test in `db-mappers.test.ts`.

### Query (`src/lib/queries.ts`)

```ts
export async function listTemplatesForUser(userId: string): Promise<PackingTemplate[]> {
  const rows = await db
    .select()
    .from(packingTemplates)
    .where(eq(packingTemplates.userId, userId))
    .orderBy(asc(packingTemplates.name), asc(packingTemplates.createdAt));
  return rows.map(dbTemplateToType);
}
```

`asc`, `eq` already imported. Add `packingTemplates` to the schema import, `dbTemplateToType` to the mapper import, `PackingTemplate` to the type import. `queries.ts` is **excluded from coverage** — no unit test required for this function (E2E covers it), matching the existing `getUserById` / `getTripDetail` (no colocated query tests).

### Server actions (`src/app/(app)/packing/actions.ts`)

```ts
"use server";

import { requireUser } from "@/lib/auth-helpers";
import { db } from "@/db";
import { packingTemplates } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { CreatePackingTemplateInput, UpdatePackingTemplatePatch } from "@/data/types";

const NAME_MAX = 100;

function normalizeTemplateName(name: string | undefined): string {
  const trimmed = name?.trim() ?? "";
  if (!trimmed) throw new Error("Template name is required.");
  if (trimmed.length > NAME_MAX) throw new Error(`Template name must be ${NAME_MAX} characters or fewer.`);
  return trimmed;
}

export async function createTemplate(input: CreatePackingTemplateInput): Promise<{ id: string }> {
  const user = await requireUser();
  const name = normalizeTemplateName(input.name);
  const [row] = await db
    .insert(packingTemplates)
    .values({ userId: user.id!, name })
    .returning({ id: packingTemplates.id });
  revalidatePath("/packing");
  return { id: row.id };
}

export async function renameTemplate(id: string, patch: UpdatePackingTemplatePatch): Promise<void> {
  const user = await requireUser();
  const name = normalizeTemplateName(patch.name);
  await db
    .update(packingTemplates)
    .set({ name })
    .where(and(eq(packingTemplates.id, id), eq(packingTemplates.userId, user.id!)));
  revalidatePath("/packing");
}

export async function deleteTemplate(id: string): Promise<void> {
  const user = await requireUser();
  await db
    .delete(packingTemplates)
    .where(and(eq(packingTemplates.id, id), eq(packingTemplates.userId, user.id!)));
  revalidatePath("/packing");
}
```

The `and(eq(id), eq(userId, session))` scoping on rename/delete is the **NFR7 enforcement** — a forged id for someone else's template matches zero rows and is a silent no-op, never a cross-user mutation. This mirrors `deleteWishlistDestination` / `deleteCompanion` in `profile/actions.ts`.

### Route shell

`src/app/(app)/packing/page.tsx` (server component — no `"use client"`):

```tsx
import { requireUser } from "@/lib/auth-helpers";
import { listTemplatesForUser } from "@/lib/queries";
import { TemplatesPageClient } from "./page-client";

export default async function TemplatesPage() {
  const session = await requireUser();
  const templates = await listTemplatesForUser(session.id!);
  return <TemplatesPageClient templates={templates} />;
}
```

`src/app/(app)/packing/page-client.tsx` (`"use client"`) — orchestrates dialogs and server-action calls; keep presentational rendering in the `packt/` components. **Pass the `templates` prop straight through to `<TemplateLibrary>` — do not mirror it in `useState`.** `revalidatePath("/packing")` after each mutation re-runs the server component and feeds fresh props down (the `wishlist-section.tsx` pattern); a `useState(templates)` copy would silently go stale after create/rename/delete. State to hold is only: `createOpen: boolean`, `renaming: PackingTemplate | null`, `deleting: PackingTemplate | null`, plus `const [pending, startTransition] = useTransition()`. On each action wrap in `startTransition(async () => { try { await action(...) } catch (e) { toast.error(...) } })` and close the relevant dialog on success. Import `toast` from `sonner` (Toaster already mounted in `layout.tsx`).

The `(app)/layout.tsx` already wraps every child with `SidebarNav` + auth, so the route inherits the sidebar automatically — do not re-render navigation in the page.

### Empty-state primitives (`@/components/ui/empty`)

Use `Empty`, `EmptyHeader`, `EmptyMedia` (variant `icon`), `EmptyTitle`, `EmptyDescription`, `EmptyContent` for AC3. Put a "Create your first template" `Button` inside `EmptyContent` wired to `onNew`. A Lucide icon (e.g. `LayoutTemplate`, `strokeWidth={1.5}`) goes in `EmptyMedia`.

### Component contracts (place in `src/components/packt/` — covered + tested)

Each component declares an explicit named `*Props` interface (project convention) and `"use client"` as the first line.

- `TemplateLibrary` (`TemplateLibraryProps`) — presentational list/empty switch. No server calls; raises `onNew` / `onRename(t)` / `onDelete(t)`.
- `TemplateFormDialog` (`TemplateFormDialogProps`) — shared create/rename Base UI `Dialog`. Validation lives here (trim, non-empty, `maxLength={100}`, disabled submit on empty). Calls `onSubmit(trimmedName)`.
- `DeleteTemplateAlertDialog` (`DeleteTemplateAlertDialogProps`) — copy `delete-trip-alert-dialog.tsx` verbatim, swap copy to "Delete {name}?" and a template-appropriate description.

Keeping create/rename/delete UI in `packt/` (not in `app/`) is deliberate: `src/app/**` is excluded from coverage, `src/components/packt/**` is not. This is the same split the trips feature uses (`new-trip-dialog.tsx`, `delete-trip-alert-dialog.tsx` live in `packt/`).

### Accessibility (AC9 — NFR8, NFR10, NFR12)

- **Dialog keyboard + focus is handled by the primitives** — `@/components/ui/dialog` (Base UI `Dialog`) and `@/components/ui/alert-dialog` provide focus trap, Escape-to-dismiss, and focus return to the trigger automatically. Do not hand-roll any of this. To use it correctly: open dialogs from a real `<button>` trigger (so focus returns there on close), give `TemplateFormDialog` a `DialogTitle` + `DialogDescription` (wires `aria-labelledby`/`aria-describedby`), and `autoFocus` the name input so focus lands inside on open.
- **Form label** — the name input must be tied to a `<label htmlFor>` (visible or `sr-only`) or carry an `aria-label`; never an unlabeled input.
- **Icon-only buttons** (rename/delete per row) need both `title` and `aria-label` that include the template name for screen-reader context (e.g. `aria-label={`Rename ${template.name}`}`) — a bare "Rename"/"Delete" is ambiguous across rows.
- **Touch targets** — rename/delete row buttons and dialog buttons render at ≥44×44px on mobile (size via tokens/utilities, not arbitrary values).
- **Heading hierarchy** — the library page title ("Packing Templates") is the page `h1`; per-row template names are not headings (use `<span>`/`<p>`). Do not skip levels.
- **No color-only state** — the sidebar active state already pairs the accent color with the `aria-current`/active styling pattern in `NavItem`; reuse it, don't signal active by color alone.

### Sidebar nav change (`src/components/packt/sidebar-nav.tsx`)

```ts
import { Briefcase, Search, Clock, LogOut, LayoutTemplate } from "lucide-react";

const NAV_ITEMS = [
  { id: "trips", label: "Trips", icon: Briefcase, href: "/trips" },
  { id: "templates", label: "Packing Templates", icon: LayoutTemplate, href: "/packing" },
  { id: "search", label: "Search", icon: Search, href: "/search" },
  { id: "travel-history", label: "Travel History", icon: Clock, href: "/travel-history" },
];
```

Active check in the `.map`:

```tsx
active={
  pathname === item.href ||
  (item.href === "/trips" && pathname.startsWith("/trips")) ||
  (item.href === "/packing" && pathname.startsWith("/packing"))
}
```

Update `sidebar-nav.test.tsx`: the existing mock sets `usePathname: () => "/trips"`. Add a test asserting `screen.getByText("Packing Templates")` is rendered and links to `/packing`. The mocked `next/link` already passes `href` through.

## Previous Story Intelligence (Epic 1)

From Stories 1.1–1.4 (`packing_items` feature) — patterns proven and pitfalls already paid for:

- **Server-side name validation is mandatory and was a review-blocker when skipped** (1.4 first/second pass). `normalizeTemplateName` (trim + empty guard + length cap) must live in the action, not only the dialog.
- **Auth before any row read** — 1.4 second pass flagged "fetches item before auth check — unauthenticated user can probe id existence." Here `requireUser()` is the first line of every action and the `WHERE` is user-scoped, so no pre-auth `select` leaks existence.
- **`revalidatePath` after every mutation** or the list goes stale (Epic 1 used `revalidatePath("/trips/${id}")` + `"/trips"`). Templates only need `revalidatePath("/packing")`.
- **No `window.confirm`** — confirmed across 1.1/1.4 reviews; use `AlertDialog`.
- **E2E must self-seed at the DB level in a `Before` hook** and clean up in `After` — chained UI-driven setup races server-action revalidation (see `feedback_e2e_self_seeding` and the `@packing-tab` hooks). Templates are user-scoped: seed against the E2E user, not a trip.
- **`toast` is globally mounted** — import from `sonner`, never add a second `<Toaster>`.
- **`session.id!`** — the non-null assertion is the established idiom after `requireUser()` (id is `string | undefined`).

## Git Intelligence

Recent commits (`main`) are Story 1.4 inline-edit/strikethrough work (`fd6ed5c`, `8fb0c31`, PR #67). Epic 1 is fully merged and `done`; no in-flight packing work conflicts with this story. The `label_id` self-FK migration landed via drizzle push (no migration file) — follow the same push convention for `packing_templates`.

## Testing

### Test layering (mandatory — no cross-layer duplication)

| Behavior | Layer | File |
|---|---|---|
| `dbTemplateToType` field mapping | Unit | `src/lib/db-mappers.test.ts` |
| Library renders list / empty state / raises events | Unit | `src/components/packt/template-library.test.tsx` |
| Dialog validation, submit, maxLength, mode copy | Unit | `src/components/packt/template-form-dialog.test.tsx` |
| Delete dialog confirm/cancel wiring | Unit | `src/components/packt/delete-template-alert-dialog.test.tsx` |
| Sidebar renders Packing Templates link → `/packing` | Unit | `src/components/packt/sidebar-nav.test.tsx` |
| Actions: auth, user-scoping, validation, revalidate | Unit | `src/app/(app)/packing/actions.test.ts` |
| page-client dialog/handler wiring | Unit | `src/app/(app)/packing/page-client.test.tsx` |
| Full create/rename/delete + persistence + nav | E2E | `tests/e2e/features/templates.feature` (+ steps) |

Coverage: `src/components/packt/**` and `src/lib/db-mappers.ts` are enforced (≥95% lines/functions, ≥90% branches). `src/app/**` and `src/lib/queries.ts` are excluded — still author `actions.test.ts` and `page-client.test.tsx` per the colocated-test convention (trips/profile both do), but they don't move the coverage number.

### Unit test specifics

**`db-mappers.test.ts`** — add a `dbTemplateToType` block: full row (with `createdAt`) → `createdAt` is an ISO string; row with `createdAt: null` → `createdAt` is `undefined`.

**`actions.test.ts`** (model the harness on `profile/actions.test.ts` — `vi.hoisted` mocks for `requireUser`, `db`, `revalidatePath`, schema, `drizzle-orm`):
- `createTemplate` inserts `{ userId, name }`, returns `{ id }`, calls `requireUser` + `revalidatePath("/packing")`
- `createTemplate` trims the name; throws on empty/whitespace; throws on > 100 chars (no insert)
- `renameTemplate` updates with a `WHERE` scoped to both `id` and `userId`; trims/validates; revalidates
- `deleteTemplate` deletes with a `WHERE` scoped to both `id` and `userId`; revalidates
- (user-scoping assertion: confirm `and(eq, eq)` is invoked — i.e. the `userId` predicate is present on rename/delete)

**`template-library.test.tsx`**: empty state renders + create action fires `onNew`; non-empty renders one row per template with correct names; rename/delete buttons call `onRename`/`onDelete` with the right template; icon buttons expose accessible names (`title`/`aria-label`).

**`template-form-dialog.test.tsx`**: empty input disables submit; whitespace-only stays disabled; typing + submit calls `onSubmit` with the trimmed value; `maxLength` is 100; rename mode pre-fills `initialName`; Enter submits.

**`delete-template-alert-dialog.test.tsx`**: shows the template name; confirm calls `onConfirm`; cancel calls `onOpenChange(false)`; disabled while `isDeleting`.

### E2E specifics

Add seed constants to `tests/e2e/e2e-seed-data.ts`:

```ts
export const E2E_TEMPLATE = { name: "Beach Weekend" };
export const E2E_TEMPLATE_RENAMED = { name: "Carry-on Only" };
export const E2E_TEMPLATE_LIST = [{ name: "Business Trip" }, { name: "Winter Ski" }];
```

In `tests/e2e/global-setup.ts`, add `packing_templates` to the `TRUNCATE` list (it cascades from `users`, but list it explicitly for clarity and isolation). Do not pre-seed templates in global-setup — seed per-scenario in the steps `Before` hook so the empty-state scenario can assert a truly empty library.

`tests/e2e/steps/templates.steps.ts` — reuse the `withE2EDb` helper pattern from `packing-tab.steps.ts`; resolve the E2E user by `E2E_USER.email`; seed/cleanup `packing_templates` rows for that `userId`. Tag the feature `@templates`; `Before({ tags: "@templates" })` clears the user's templates (so empty-state is deterministic) and seeds the rows a scenario needs; `After` clears them. Navigate via `await page.goto("/packing")` or by clicking the sidebar link `a[href="/packing"]`.

`tests/e2e/features/templates.feature`:

```gherkin
@templates
Feature: Packing template library
  Background:
    Given I am signed in

  Scenario: Sidebar links to the template library
    Then I should see a sidebar link to "Packing Templates"
    When I open the template library
    Then I should be on the template library page

  Scenario: Empty state prompts to create a first template
    Given I have no packing templates
    When I open the template library
    Then I should see the empty templates state

  Scenario: User creates a template and it persists after reload
    Given I have no packing templates
    When I open the template library
    And I create a template named "City Break"
    Then the template library should contain "City Break"
    When I reload the page
    Then the template library should contain "City Break"

  Scenario: User renames a template and it persists after reload
    Given I have a packing template named "Beach Holiday"
    When I open the template library
    And I rename the template "Beach Holiday" to "Beach Trip"
    Then the template library should contain "Beach Trip"
    When I reload the page
    Then the template library should contain "Beach Trip"

  Scenario: User deletes a template and it persists after reload
    Given I have a packing template named "Old Template"
    When I open the template library
    And I delete the template "Old Template"
    Then the template library should not contain "Old Template"
    When I reload the page
    Then the template library should not contain "Old Template"
```

The E2E webServer runs on port 3001 with `NEXT_DISTDIR=.next-e2e`; the `setup` (auth) project must pass before `chromium`. Re-run `npm run db:migrate:e2e` before the first E2E run after adding the table, or every template step fails on the missing relation.

### Project Structure Notes

- New route folder `src/app/(app)/packing/` parallels `src/app/(app)/profile/` (server `page.tsx` → client `page-client.tsx` → colocated `actions.ts`). Consistent with the established route pattern.
- Domain components in `src/components/packt/`; the route only orchestrates. Matches trips (`new-trip-dialog.tsx`, `delete-trip-alert-dialog.tsx`, `trips-desktop-layout.tsx` in `packt/`).
- No conflicts with the unified structure. The only shared-file edits are additive: `schema.ts`, `types.ts`, `db-mappers.ts`, `queries.ts`, `sidebar-nav.tsx`, `e2e-seed-data.ts`, `global-setup.ts`.

### Files to Create

| File | Purpose |
|---|---|
| `src/app/(app)/packing/page.tsx` | Server route — fetch templates |
| `src/app/(app)/packing/page-client.tsx` | Client orchestration (dialog state + actions) |
| `src/app/(app)/packing/page-client.test.tsx` | Wiring tests |
| `src/app/(app)/packing/actions.ts` | `createTemplate` / `renameTemplate` / `deleteTemplate` |
| `src/app/(app)/packing/actions.test.ts` | Action unit tests |
| `src/components/packt/template-library.tsx` | List + empty state (presentational) |
| `src/components/packt/template-library.test.tsx` | Component tests |
| `src/components/packt/template-form-dialog.tsx` | Create/rename dialog |
| `src/components/packt/template-form-dialog.test.tsx` | Dialog tests |
| `src/components/packt/delete-template-alert-dialog.tsx` | Delete confirm dialog |
| `src/components/packt/delete-template-alert-dialog.test.tsx` | Dialog tests |
| `tests/e2e/features/templates.feature` | BDD scenarios |
| `tests/e2e/steps/templates.steps.ts` | Step defs + self-seeding hooks |

### Files to Modify

| File | Change |
|---|---|
| `src/db/schema.ts` | Add `packingTemplates` table |
| `src/data/types.ts` | Add `PackingTemplate`, `CreatePackingTemplateInput`, `UpdatePackingTemplatePatch` |
| `src/lib/db-mappers.ts` | Add `dbTemplateToType` (+ imports) |
| `src/lib/db-mappers.test.ts` | Add `dbTemplateToType` tests |
| `src/lib/queries.ts` | Add `listTemplatesForUser` (+ imports) |
| `src/components/packt/sidebar-nav.tsx` | Add Packing Templates nav entry + active check |
| `src/components/packt/sidebar-nav.test.tsx` | Assert the new nav item |
| `tests/e2e/e2e-seed-data.ts` | Add template seed constants |
| `tests/e2e/global-setup.ts` | Add `packing_templates` to TRUNCATE |

### References

- [Epics doc](_bmad-output/implementation-artifacts/epics.md) — Epic 2, Story 2.1 (lines 320-351); FR1–FR4, FR38, NFR5–NFR12
- [PRD](_bmad-output/implementation-artifacts/prd.md) — Template library scope (lines 75-95, 181-191, 242-252)
- [Project context](_bmad-output/project-context.md) — stack versions, route split, server-action rules, CSS tokens, coverage rules
- [Profile actions](src/app/(app)/profile/actions.ts) — user-scoped CRUD pattern (`requireUser` + `and(eq(id), eq(userId))`)
- [Wishlist section](src/app/(app)/profile/wishlist-section.tsx) — minimal add/delete + `useTransition`
- [Delete trip alert dialog](src/components/packt/delete-trip-alert-dialog.tsx) — `AlertDialog` confirm pattern
- [Sidebar nav](src/components/packt/sidebar-nav.tsx) + [test](src/components/packt/sidebar-nav.test.tsx)
- [DB mappers](src/lib/db-mappers.ts) + [test](src/lib/db-mappers.test.ts)
- [Queries](src/lib/queries.ts) — `getUserById`, `listTripsForUser`
- [Schema](src/db/schema.ts) — `userWishlistDestinations` / `userCompanions` (user-scoped table shape)
- [Packing steps](tests/e2e/steps/packing-tab.steps.ts) — `withE2EDb`, self-seeding `Before`/`After` hooks
- [Common steps](tests/e2e/steps/common.steps.ts) — "I am signed in"
- [Story 1.4](_bmad-output/implementation-artifacts/1-4-inline-editing-label-strikethrough-and-contextual-add.md) — validation/auth review findings, drizzle-push convention

## Dev Agent Record

### Agent Model Used

GPT-5 Codex (Amelia persona)

### Debug Log References

- `npx vitest run src/lib/db-mappers.test.ts src/components/packt/template-library.test.tsx src/components/packt/template-form-dialog.test.tsx src/components/packt/delete-template-alert-dialog.test.tsx src/components/packt/sidebar-nav.test.tsx 'src/app/(app)/packing/actions.test.ts' 'src/app/(app)/packing/page-client.test.tsx'`
- `npm run db:migrate`
- `npm run db:migrate:e2e`
- `npx bddgen`
- `npx playwright test .features-gen/tests/e2e/features/templates.feature.spec.js`
- `npm run lint 2>&1`
- `npx tsc --noEmit 2>&1`
- `npm run test:coverage 2>&1`
- `npm run test:e2e 2>&1`
- `npm run build 2>&1`

### Completion Notes List

- Added the `packing_templates` schema, canonical template types, DB mapper, and user-scoped query for `/packing`.
- Implemented authenticated template CRUD server actions plus the new server/client route split under `src/app/(app)/packing/`.
- Added the template library UI, shared create/rename dialog, delete confirmation dialog, and sidebar navigation entry with active-state support.
- Added colocated unit/component tests, templates BDD scenarios with DB-backed self-seeding hooks, and pushed the schema to both dev and E2E databases.
- Full validator run passed after a transient first-pass lint race on a missing `test-results` folder; standalone lint rerun passed cleanly.

### File List

- `_bmad-output/implementation-artifacts/2-1-template-library-create-rename-and-delete-templates.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/app/(app)/packing/actions.test.ts`
- `src/app/(app)/packing/actions.ts`
- `src/app/(app)/packing/page-client.test.tsx`
- `src/app/(app)/packing/page-client.tsx`
- `src/app/(app)/packing/page.tsx`
- `src/app/(app)/packing/template-name.ts`
- `src/components/packt/delete-template-alert-dialog.test.tsx`
- `src/components/packt/delete-template-alert-dialog.tsx`
- `src/components/packt/sidebar-nav.test.tsx`
- `src/components/packt/sidebar-nav.tsx`
- `src/components/packt/template-form-dialog.test.tsx`
- `src/components/packt/template-form-dialog.tsx`
- `src/components/packt/template-library.test.tsx`
- `src/components/packt/template-library.tsx`
- `src/data/types.ts`
- `src/db/schema.ts`
- `src/lib/db-mappers.test.ts`
- `src/lib/db-mappers.ts`
- `src/lib/queries.ts`
- `tests/e2e/e2e-seed-data.ts`
- `tests/e2e/features/templates.feature`
- `tests/e2e/global-setup.ts`
- `tests/e2e/steps/templates.steps.ts`

### Change Log

- 2026-06-02: Implemented Story 2.1 template-library foundation, added full unit/E2E coverage, pushed schema updates, and moved the story to review.
- 2026-06-02: Renamed the route from `/templates` to `/packing` to match the product wording.

### Review Findings (First Pass)

- [x] [Review][Dismiss] Route `/packing` instead of spec's `/templates` — confirmed intentional by author; route change was deliberate
- [x] [Review][Patch] `createTemplate` crashes if DB insert returns empty array — `const [template] = await db.insert(…).returning(…)` is destructured without a null guard; if the insert unexpectedly returns nothing, `template.id` throws an unhandled TypeError. [src/app/(app)/packing/actions.ts:15]
- [x] [Review][Patch] Spec-leakage in dialog descriptions — create-mode description reads "items and sections arrive in the next story slice"; delete description reads "Template items arrive in the next story and are not part of this delete yet." These are internal dev notes surfaced as user-visible copy. [src/components/packt/template-form-dialog.tsx:32, src/components/packt/delete-template-alert-dialog.tsx:35]
- [x] [Review][Patch] E2E `"should not see template"` uses `getByText(name).toHaveCount(0)` — matches any element with that text including toasts; a success toast mentioning the template name causes a false failure. [tests/e2e/steps/templates.steps.ts:109]
- [x] [Review][Patch] `TemplateFormDialog` `useState(initialName ?? "")` never syncs if `initialName` changes while mounted — component contract is broken for any consumer reusing the instance without unmount; add a `useEffect` sync or document the unmount requirement. [src/components/packt/template-form-dialog.tsx:25]
- [x] [Review][Patch] Sidebar test asserts text presence only, no href — `getByText("Packing Templates")` passes regardless of route value; added `getByRole("link", { name: "Packing Templates" }).toHaveAttribute("href", "/packing")`. [src/components/packt/sidebar-nav.test.tsx]
- [x] [Review][Defer] `renameTemplate`/`deleteTemplate` silent no-op on missing/wrong-user ID — deferred, pre-existing pattern; spec calls it intentional ("silent no-op, never a cross-user mutation")
- [x] [Review][Defer] Server action errors leak raw message to client via Next.js serialization — deferred, pre-existing; systemic across all actions in codebase
- [x] [Review][Defer] Duplicate template names produce ambiguous aria-labels — deferred, pre-existing; spec explicitly forbids uniqueness constraint
- [x] [Review][Defer] Anonymous index name on `packingTemplates.userId` — deferred, pre-existing pattern throughout schema.ts
- [x] [Review][Defer] Case-sensitive collation on name sort — deferred, pre-existing PostgreSQL default

### Review Findings (Second Pass)

- [x] [Review][Decision] AC5 "validation error" vs disabled submit — AC5 says "a validation error is shown" but the implementation uses a disabled submit button with no inline error text. **Resolved: add inline error text below the name input.** The E2E scenario `Then I should see a template validation error` then checks for that text. Update `TemplateFormDialog` to show an inline error message (e.g., "Name cannot be empty") when validation fails client-side and surface the server-side validation error in the same location.
- [x] [Review][Dismiss] Route inconsistency between document and implementation — `/packing` is the deliberate route choice. Confirmed by author; document narrative sections use generic `/templates` as placeholder but all code paths and spec blocks use `/packing`.
- [x] [Review][Patch] AC2 no multi-template E2E scenario — `E2E_TEMPLATE_LIST` seeded, step definition added, and scenario `Multiple templates are listed by name` added to `templates.feature`.
- [x] [Review][Patch] Open Questions contradict resolved decisions — section removed; all three items are resolved in code.
- [x] [Review][Patch] `normalizeTemplateName` signature only accepts `string` — changed to `name: string | undefined` with `(name ?? "").trim()` guard. [src/app/(app)/packing/template-name.ts:1]
- [x] [Review][Patch] Submit button Enter key races with `isPending` disabled-state re-render — added `if (isPending || !trimmedName) return` guard at the top of `handleSubmit`. [src/components/packt/template-form-dialog.tsx]
- [x] [Review][Patch] Orphaned dialog transition overrides subsequent state — switched to functional state updates: `setRenamingTemplate((prev) => (prev === current ? null : prev))` and same for delete. [src/app/(app)/packing/page-client.tsx]
- [x] [Review][Dismiss] Duplicate template names cause Playwright ambiguous-locator error — no current scenario seeds duplicate names for rename/delete. Addressed when a scenario needs it.
- [x] [Review][Patch] Active-route `startsWith` matches sibling routes — changed to `pathname === "/packing" || pathname.startsWith("/packing/")`. [src/components/packt/sidebar-nav.tsx:85]
- [x] [Review][Dismiss] No text-overflow handling for 100-char max names — already handled: `className="truncate"` on the name element in `template-library.tsx:68`.
- [x] [Review][Defer] `revalidatePath` race with rapid consecutive mutations — three actions call `revalidatePath("/packing")`; rapid create+rename+delete could render stale data. Deferred — unlikely in practice and no user-reported impact pattern.
- [x] [Review][Defer] No `updatedAt` column on `packingTemplates` despite rename being a core operation — no timestamps for conflict detection or audit. Deferred — spec deliberately limits columns; Story 2.2 can add.
- [x] [Review][Defer] 100-char name limit not enforced at DB level — column is `text not null` with no `varchar(100)` constraint. Deferred — pre-existing project pattern across all text fields.
- [x] [Review][Defer] Single `useTransition` gates all three operations — one `isPending` blocks create/rename/delete simultaneously. Deferred — acceptable MVP UX; refinable on feedback.
- [x] [Review][Defer] No loading/error boundary (`loading.tsx`, `error.tsx`) — server component has no loading skeleton or custom error UI. Deferred — pre-existing pattern across all routes (trips also lacks them).
- [x] [Review][Dismiss] DeleteTemplateAlertDialog not verified — depends on `delete-trip-alert-dialog.tsx` component that was assumed to exist. Verified: file exists at `src/components/packt/delete-trip-alert-dialog.tsx`.
- [x] [Review][Dismiss] No success toast on create/rename/delete — dialog close + list re-render is the feedback; `toast.error` fires on failure only. Intentional design choice.
- [x] [Review][Dismiss] AC5/AC6 rename validation wording gap — AC5 specifies validation rules but AC6 says nothing about rename validation. Implementation validates both. AC wording inconsistency only, no code fix needed.

<!-- Open Questions resolved during review: route is `/packing`, sidebar position after Trips, sort by name ASC. -->
