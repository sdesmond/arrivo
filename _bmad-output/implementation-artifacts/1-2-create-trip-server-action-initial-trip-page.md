# Story 1.2: Create Trip Server Action & Initial Trip Page

Status: review

## Story

As a traveler,
I want clicking Create in the modal to immediately save my trip and land me on its page,
So that I can start planning without delay.

## Acceptance Criteria

1. Given the title field has content and I click Create, when the server action completes successfully, then I am navigated to the new trip's detail page.
2. Given I provided a date range, then the trip page shows one day card per calendar date in the range, with Day 1 expanded.
3. Given I provided only a start date (no end date), then the trip page shows exactly 1 day card, expanded.
4. Given I provided no dates, then the trip page shows the existing empty itinerary state (no day cards).
5. Given I provided a budget amount, then the trip page reflects that budget value.
6. Given the Create button is clicked, when the action is in progress, then the Create button is disabled and shows a loading indicator; the user cannot submit twice.

## Tasks / Subtasks

- [x] Make trip dates optional in schema, types, and all callers (AC: 2, 3, 4)
  - [x] Edit `src/db/schema.ts`: remove `.notNull()` from `trips.startDate` and `trips.endDate`
  - [x] Run `npm run db:generate` then `npm run db:migrate` then `npm run db:migrate:e2e`
  - [x] Edit `src/data/types.ts`: change `CreateTripInput.startDate` and `.endDate` from `string` to `string | undefined`; change `Trip.startDate` and `.endDate` from `string` to `string | undefined`
  - [x] Edit `src/lib/utils.ts`: update `getTripStatus` signature to `(startDate: string | null | undefined, endDate: string | null | undefined, now?)` — return `"upcoming"` as the placeholder for dateless trips (Story 1.3 replaces this with an Unscheduled section); update `getTripDays` and `formatDate` to accept `string | undefined` and guard against it
  - [x] Edit `src/lib/db-mappers.ts` `dbTripToType`: change `startDate: row.startDate` → `startDate: row.startDate ?? undefined`; same for `endDate`; update `getTripStatus` call to pass potentially-undefined values
  - [x] Fix all TypeScript callers that now receive `string | undefined` for dates — exact sites listed in Dev Notes below
- [x] Extend `createTrip` server action with day generation and redirect (AC: 1, 2, 3, 4, 5)
  - [x] Add `days` to the schema import in `src/app/(app)/trips/actions.ts`
  - [x] Add `redirect` from `next/navigation` import
  - [x] Accept optional `startDate`/`endDate` from updated `CreateTripInput`
  - [x] After inserting the trip and collaborator, generate and insert day rows in a single `db.insert(days).values([...])` call (see day generation rules in Dev Notes)
  - [x] Replace `revalidatePath("/trips")` with `redirect(\`/trips/${trip.id}?new=1\`)` — the redirect subsumes the revalidation for the destination page
- [x] Move `NewTripDraft` to `src/data/types.ts` (required before wiring `onCreate`)
  - [x] Export `NewTripDraft` from `src/data/types.ts` (same interface that currently lives in `new-trip-dialog.tsx`): `title: string; startDate?: string; endDate?: string; budgetAmount?: string`
  - [x] Update `src/components/packt/new-trip-dialog.tsx` to import `NewTripDraft` from `@/data/types` instead of defining it locally
- [x] Wire `onCreate` in trips `page-client.tsx` with pending state (AC: 1, 6)
  - [x] Import `useTransition` from React and `createTrip` from `./actions`; import `NewTripDraft` type from `@/data/types`
  - [x] Add `const [isCreating, startCreation] = useTransition()` to `TripsPageClient`
  - [x] Add `handleCreate(draft: NewTripDraft)` function that calls `startCreation(async () => { await createTrip({...}) })` — map `draft.title` → `name`, `draft.startDate` → `startDate`, `draft.endDate` → `endDate`, `draft.budgetAmount` → `budgetTotal: parseFloat(draft.budgetAmount)` only when defined
  - [x] Pass `onCreate={handleCreate}` and `isPending={isCreating}` to `<NewTripDialog>`
- [x] Add `isPending` prop to `NewTripDialog` for loading state (AC: 6)
  - [x] Add `isPending?: boolean` to `NewTripDialogProps` in `src/components/packt/new-trip-dialog.tsx`
  - [x] Disable Create button additionally when `isPending` is true: `disabled={draft.title.trim().length === 0 || isPending}`
  - [x] Show visual loading feedback on Create button when `isPending` — change the button text to "Creating…" and optionally add a `Loader2` spinner alongside it; never replace the text with the spinner alone (icon-only buttons require a title, and the pending button already has one conveyed through its text)
- [x] Split `src/app/(app)/trips/[tripId]/page-client.tsx` before adding Day 1 expanded (file is 360 lines — REQUIRED before adding more code)
  - [x] Extract the ~25 event/day/note/checklist mutation handler functions (lines ~64–188) into `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts` as a custom hook `useTripDetailHandlers(detail: TripDetailPayload)` that returns the handler map
  - [x] Replace the inline handler definitions in `page-client.tsx` with a single `const handlers = useTripDetailHandlers(detail)` call; spread or destructure as needed at the call sites
  - [x] Confirm `page-client.tsx` is under 250 lines before proceeding
- [x] Split `src/components/packt/day-card.tsx` before adding `initialOpen` prop (file is 385 lines — REQUIRED before adding more code)
  - [x] Extract the DnD orchestration (DndContext, DragOverlay, SortableContext, sensors, drag start/end handlers — approximately lines 120–280) into a wrapper component or hook alongside `day-card.tsx` (e.g., `day-card-dnd.tsx`)
  - [x] Confirm `day-card.tsx` is under 250 lines before proceeding with the `initialOpen` prop addition
- [x] Implement Day 1 expanded on the new trip detail page (AC: 2, 3)
  - [x] Edit `src/app/(app)/trips/[tripId]/page.tsx`: add `searchParams: Promise<{ new?: string }>` to the function props; read `const sp = await searchParams`; pass `initialExpandedDayNumber={sp.new === "1" ? 1 : undefined}` to `TripDetailClient`
  - [x] Edit `TripDetailClientProps` in `src/app/(app)/trips/[tripId]/page-client.tsx`: add `initialExpandedDayNumber?: number`
  - [x] Pass `initialExpandedDayNumber` through `TripDetailClient` → `TripDetailTabBody` → `TripItineraryView`
  - [x] Edit `TripItineraryView`: add `initialExpandedDayNumber?: number` to props; pass `initialOpen={initialExpandedDayNumber === day.dayNumber}` to each `DayCard`
  - [x] Edit `DayCard`: add `initialOpen?: boolean` to `DayCardProps`; change `useState(isToday)` to `useState(initialOpen ?? isToday)`
- [x] Fix cascading TypeScript errors from nullable dates in existing UI (required for build)
  - [x] `src/app/(app)/trips/[tripId]/page-client.tsx` line ~192: guard `getTripDays`, `getTripStatus`, and `heroDateLine` — use `trip.startDate && trip.endDate ? ... : 0 / "No dates" / "draft"` patterns
  - [x] `src/app/(app)/trips/page-client.tsx` lines ~33–52: existing `getTripStatus` filter calls and `startDate` arithmetic already pass through `getTripStatus`'s updated signature; verify TS is satisfied
- [x] Write/update tests (AC: 1–6)
  - [x] Add `src/app/(app)/trips/actions.test.ts` covering day generation logic (see Testing Requirements) — do NOT `vi.mock("next/navigation", ...)` per-file; `next/navigation` is globally mocked in `vitest.setup.mts`; if `redirect` is not in the global mock, add it there
  - [x] Update `src/lib/utils.test.ts`: add tests for `getTripStatus(undefined, undefined)` → `"upcoming"`, `getTripStatus(null, null)` → `"upcoming"`, and `getTripDays(undefined, undefined)` → `0`
  - [x] Update `src/lib/db-mappers.test.ts`: add test for `dbTripToType` with a row where `startDate` and `endDate` are `null` — verify both fields map to `undefined` and `status` maps to `"upcoming"`
  - [x] Update `src/components/packt/new-trip-dialog.test.tsx`: add test that Create button is disabled when `isPending={true}`; add test that button shows "Creating…" text when pending
  - [x] Update `src/components/packt/day-card.test.tsx` — cover `initialOpen=true` starts expanded
  - [x] Add `tests/e2e/features/create-trip.feature` and `tests/e2e/steps/create-trip.steps.ts` (see E2E section below)

## Dev Notes

### Architecture Guardrails

- **Page split pattern**: `src/app/(app)/trips/[tripId]/page.tsx` is the Server Component (data + auth); `page-client.tsx` is the Client Component (interactivity). `initialExpandedDayNumber` flows from page → page-client as a serializable prop — never via search params in a client component.
- **`"use server"` and `"use client"` placement**: `"use server"` must be the first line of `actions.ts`; `"use client"` must be the first line of any interactive component file. These already exist — do not remove or move them.
- **`redirect()` from `next/navigation`** works inside server actions in Next.js App Router (it throws a NEXT_REDIRECT that the framework catches). Import it from `next/navigation`, not from anywhere else. Call it at the end of the action after all DB writes succeed.
- **Never call `new Date()` directly**: The `days` table `date` field stores ISO date strings (`"YYYY-MM-DD"`); compute dates from `startDate` using date arithmetic on plain ISO strings, not `Date` objects. Pattern: advance by `i` days using `addDays(startDate, i)` — implement a small helper or use the arithmetic inline: `new Date(startDate + "T00:00:00")` then format back to ISO.
- **`getTripStatus` return type**: The return union `"upcoming" | "active" | "past"` extends from `TripStatus` — do NOT add `"draft"` to this return type; return `"upcoming"` as the dateless placeholder. Story 1.3 adds the Unscheduled section; this story just ensures TypeScript doesn't break.
- **Drizzle insert array**: `db.insert(days).values([])` is valid when the array is empty; no need to guard the insert with a length check.

### Current Implementation Snapshot

**`src/db/schema.ts`**
```ts
export const trips = pgTable("trips", {
  // ...
  startDate: date("start_date").notNull(),  // ← remove .notNull()
  endDate: date("end_date").notNull(),      // ← remove .notNull()
  // ...
});
```

**`src/data/types.ts`**
```ts
export interface Trip {
  // ...
  startDate: string;  // ← change to string | undefined
  endDate: string;    // ← change to string | undefined
  // ...
}

export interface CreateTripInput {
  name: string;
  startDate: string;  // ← change to string | undefined
  endDate: string;    // ← change to string | undefined
  // ...
}
```

**`src/lib/utils.ts` — functions that need null-guard updates:**
```ts
// Current:
export function getTripStatus(startDate: string, endDate: string, now = getNow()): "upcoming" | "active" | "past"
// Update to:
export function getTripStatus(startDate: string | null | undefined, endDate: string | null | undefined, now = getNow()): "upcoming" | "active" | "past"
// When either date is nullish, return "upcoming" (placeholder for dateless)

// Current:
export function getTripDays(startDate: string, endDate: string): number
// Update to accept undefined; return 0 when either is undefined

// Current:
export function formatDate(dateStr: string, format: string): string
// Callers must guard before calling — do NOT change this signature; fix call sites
```

**`src/lib/db-mappers.ts` `dbTripToType`:**
```ts
// Current:
startDate: row.startDate,
endDate: row.endDate,
status: getTripStatus(row.startDate, row.endDate),
// After schema change, row.startDate / row.endDate are string | null
// Update to:
startDate: row.startDate ?? undefined,
endDate: row.endDate ?? undefined,
status: getTripStatus(row.startDate, row.endDate),
```

**`src/app/(app)/trips/actions.ts` `createTrip` — current:**
```ts
export async function createTrip(input: CreateTripInput) {
  const user = await requireUser();
  const [trip] = await db.insert(trips).values({ ... }).returning();
  await db.insert(collaborators).values({ ... });
  revalidatePath("/trips");
  return trip;
}
```
**After Story 1.2 — key changes:**
- Accept optional `startDate` / `endDate`
- Insert day rows after the collaborator insert (see day generation rules below)
- Replace `revalidatePath` + `return trip` with `redirect(\`/trips/${trip.id}?new=1\`)`

**`src/app/(app)/trips/[tripId]/page.tsx` — current:**
```ts
export default async function TripDetailPage({ params }: { params: Promise<{ tripId: string }> }) {
```
**After Story 1.2:**
```ts
export default async function TripDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  // ... existing logic ...
  const sp = await searchParams;
  return (
    <TripDetailClient
      detail={detail}
      nowISO={now.toISOString()}
      dateFormat={dateFormat}
      initialExpandedDayNumber={sp.new === "1" ? 1 : undefined}
    />
  );
}
```

**`src/app/(app)/trips/page-client.tsx` — current `NewTripDialog` usage:**
```tsx
<NewTripDialog open={newTripOpen} onOpenChange={setNewTripOpen} />
```
**After Story 1.2:**
```tsx
<NewTripDialog
  open={newTripOpen}
  onOpenChange={setNewTripOpen}
  onCreate={handleCreate}
  isPending={isCreating}
/>
```

**`src/app/(app)/trips/[tripId]/page-client.tsx` — cascading null-date fixes:**
- Line ~191: `const dayTotal = getTripDays(trip.startDate, trip.endDate)` → guard with fallback `0`
- Line ~192: `const status = getTripStatus(trip.startDate, trip.endDate, now)` → already handled by updated `getTripStatus`
- Line ~193: `const heroDateLine = \`${formatDate(trip.startDate, dateFormat)} — ${formatDate(trip.endDate, dateFormat)}\`` → guard: `trip.startDate && trip.endDate ? \`${formatDate(trip.startDate, dateFormat)} — ${formatDate(trip.endDate, dateFormat)}\` : ""`

**`src/components/packt/day-card.tsx` — current `open` init:**
```ts
const [open, setOpen] = useState(isToday);
```
**After Story 1.2:**
```ts
const [open, setOpen] = useState(initialOpen ?? isToday);
```

### Day Generation Rules

Implement inside `createTrip` in `src/app/(app)/trips/actions.ts`. Compute an array of day rows and insert in one call:

```ts
function buildDayRows(tripId: string, startDate: string | undefined, endDate: string | undefined) {
  if (!startDate) return []; // no dates → no days
  const start = new Date(startDate + "T00:00:00");
  const end = endDate ? new Date(endDate + "T00:00:00") : start; // start-only → 1 day
  const dayRows = [];
  let current = new Date(start);
  let dayNumber = 1;
  while (current <= end) {
    const dateISO = current.toISOString().slice(0, 10);
    dayRows.push({
      tripId,
      dayNumber,
      date: dateISO,
      label: `Day ${dayNumber}`,
    });
    dayNumber++;
    current = new Date(current.getTime() + 86_400_000);
  }
  return dayRows;
}
```

Then in `createTrip`:
```ts
const dayRows = buildDayRows(trip.id, input.startDate, input.endDate);
if (dayRows.length > 0) {
  await db.insert(days).values(dayRows);
}
```

The `days` table has no `position` field — `dayNumber` is the ordering key. `subtitle`, `weather`, `travelSummary` default to null (omit from insert).

### Budget Mapping

`NewTripDraft.budgetAmount` is a numeric string like `"1500"` or `"1500.50"`. Map it:
```ts
budgetTotal: draft.budgetAmount ? parseFloat(draft.budgetAmount) : undefined,
```
`CreateTripInput.budgetTotal` is `number | undefined`. The existing action already handles `input.budgetTotal?.toString()` when inserting.

### Cascading Callers — Complete List

These exact sites need updates after `Trip.startDate` / `.endDate` become optional:

| File | Line area | Current call | Required fix |
|------|-----------|--------------|--------------|
| `src/app/(app)/trips/page-client.tsx` | ~33–37 | `getTripStatus(e.trip.startDate, e.trip.endDate, now)` | passes undefined through updated signature — verify TS satisfied |
| `src/app/(app)/trips/page-client.tsx` | ~52 | `new Date(trip.startDate + "T00:00:00")` | guard: `trip.startDate ? new Date(trip.startDate + "T00:00:00").getTime() : Infinity` |
| `src/app/(app)/trips/[tripId]/page-client.tsx` | ~191 | `getTripDays(trip.startDate, trip.endDate)` | guard or update `getTripDays` signature |
| `src/app/(app)/trips/[tripId]/page-client.tsx` | ~192 | `getTripStatus(trip.startDate, trip.endDate, now)` | passes undefined through updated signature |
| `src/app/(app)/trips/[tripId]/page-client.tsx` | ~193 | `formatDate(trip.startDate, dateFormat)` (in heroDateLine) | conditional: `trip.startDate && trip.endDate ? ... : ""` |
| `src/lib/queries.ts` | ~80 | `listTripsForUser`: `const todayISO = now.toISOString().slice(0, 10)` | no change here, but `orderBy(trips.startDate)` will sort nulls first in Postgres — acceptable for Story 1.2; Story 1.3 will refine |

Do not change any other files not in this list for Story 1.2 — scope is strictly the items above.

### Empty Dateless State

`TripItineraryView` already renders an empty state when `days.length === 0`:
```tsx
if (days.length === 0) {
  return (
    <Empty>
      <EmptyTitle>No itinerary yet</EmptyTitle>
      ...
    </Empty>
  );
}
```
For a dateless trip (no days created), this empty state renders automatically. No new component or state needed for AC 4.

### `NewTripDraft` Type Location

`NewTripDraft` must live in `src/data/types.ts` (all domain types go there — see Architecture Guardrails). Move it from `new-trip-dialog.tsx` to `types.ts`:
```ts
// In src/data/types.ts — add alongside other action input shapes:
export interface NewTripDraft {
  title: string;
  startDate?: string;
  endDate?: string;
  budgetAmount?: string;
}
```
Then update `new-trip-dialog.tsx` to import it: `import type { NewTripDraft } from "@/data/types"` and remove the local definition. `page-client.tsx` also imports from `@/data/types`.

### Migration Workflow

After editing `src/db/schema.ts`:
1. `npm run db:generate` — generates a new SQL migration in `./drizzle/`
2. `npm run db:migrate` — applies to dev DB
3. `npm run db:migrate:e2e` — applies to E2E DB (`drizzle-kit push --config=drizzle.config.e2e.ts`)

The E2E global-setup inserts trips with `startDate`/`endDate` as non-null, so the seed still works after the schema change.

## Testing Requirements

### Unit Tests — `src/app/(app)/trips/actions.test.ts` (new)

Create a unit test for the day generation helper. Because `createTrip` calls `db.insert` and `redirect`, mock both at the module level:
```ts
vi.mock("@/db", () => ({ db: { insert: vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: "trip-1" }]) }) }) } }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth-helpers", () => ({ requireUser: vi.fn().mockResolvedValue({ id: "user-1", email: "u@test.com", name: "User" }) }));
```

Cover:
- `buildDayRows` (extracted as a named export or tested indirectly through action): date range generates correct count, dayNumbers, dates, labels
- Date range of 1 day (startDate === endDate) → 1 day row
- Start date only (no endDate) → 1 day row
- No dates → 0 day rows
- Multi-day range (e.g., 3 days: 2026-06-01 to 2026-06-03) → 3 rows with correct dates

If `buildDayRows` is not extractable as a named export without refactoring, test it via the action by inspecting what was inserted. Prefer extracting it as a named internal function and exporting it from actions.ts for testability.

### Unit Tests — `src/components/packt/new-trip-dialog.test.tsx` (update)

Add to the existing test file:
- `"disables Create button when isPending=true"` — render with `open`, a valid title, and `isPending={true}`; expect Create button to be disabled
- `"shows Creating text on Create button when isPending=true"` — same setup; expect `screen.getByRole("button", { name: /creating/i })` to be in the document

### Unit Tests — `src/components/packt/day-card.tsx` (if no test file exists, add one; otherwise update)

Add:
- `"starts expanded when initialOpen=true"` — render a DayCard with `initialOpen={true}` and a mock day; confirm the day body is visible (check for aria-expanded or presence of day content)

### E2E Tests

Add `tests/e2e/features/create-trip.feature` and `tests/e2e/steps/create-trip.steps.ts`.

Feature file:
```gherkin
Feature: Create Trip

  Background:
    Given I am signed in

  Scenario: Create a trip with a date range navigates to trip page with Day 1 expanded
    When I open the New Trip dialog
    And I type "E2E Date Trip" in the title field
    And I select dates "2026-08-01" to "2026-08-03"
    And I click the Create button
    Then I am on the trip detail page for "E2E Date Trip"
    And Day 1 is expanded

  Scenario: Create a dateless trip navigates to trip page with empty itinerary
    When I open the New Trip dialog
    And I type "E2E Dateless Trip" in the title field
    And I click the Create button
    Then I am on the trip detail page for "E2E Dateless Trip"
    And the itinerary shows the empty state

  Scenario: Create button shows loading state while submitting
    When I open the New Trip dialog
    And I type "E2E Pending Trip" in the title field
    And I click the Create button
    Then the Create button is not clickable during submission
```

Steps notes:
- "I open the New Trip dialog" → click the "New trip" topbar button (exact match, already defined in `new-trip.steps.ts` as "I click the New trip button in the topbar" — reuse or alias it)
- "I select dates" → interact with the DateRangePicker; use `page.getByRole("button", { name: /optional date range/i })` to open and then click date cells — or use a more direct approach if the picker exposes accessible date cells; this is likely the trickiest step; test the picker behavior carefully in E2E
- "I am on the trip detail page for" → verify URL matches `/trips/<uuid>` and page title matches
- "Day 1 is expanded" → look for the Day 1 card's expanded state; use aria-expanded or visible day content
- "empty state" → look for "No itinerary yet" text
- Use `After` DB hook to clean up newly created trips by name after each scenario:
  ```ts
  After({ tags: "@cleanup-created-trip" }, async () => {
    await withE2EDb(async (db) => {
      // delete trips by name pattern used in the scenario
    });
  });
  ```
- Self-seeding note: these scenarios don't need a `Before` hook to set up data — they only need "I am signed in" which navigates to `/trips`. The create flow itself creates the data.

### Vitest Environment

All new `*.test.ts(x)` files targeting DOM interaction need `// @vitest-environment jsdom` as the first line, following project convention.

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `npm test -- --run "src/app/(app)/trips/actions.test.ts" src/lib/utils.test.ts src/lib/db-mappers.test.ts src/components/packt/new-trip-dialog.test.tsx src/components/packt/day-card.test.tsx` — pass, 5 files / 180 tests
- `npm run db:generate` — pass, generated `drizzle/0000_green_valeria_richards.sql`; SQL corrected to alter existing DB schema instead of generated baseline creates
- `npm run db:migrate` — pass after correcting generated SQL
- `npm run db:migrate:e2e` — pass
- `npm run build` — pass
- `npm test -- --run` — pass, 71 files / 894 tests
- `npm run lint` — pass with 3 existing warnings
- `npm run test:e2e` — create-trip scenarios pass; suite had 1 unrelated documents empty-state failure
- `npm run test:e2e -- --grep "Upload via the empty-state Add document CTA"` — pass, confirming unrelated E2E failure was isolated/flaky

### Completion Notes List

- Implemented optional trip dates end to end: schema, domain types, mappers, utilities, list/detail UI guards, and migration.
- Implemented `createTrip` server action persistence flow: inserts trip, owner collaborator, generated day rows for date ranges/start-only trips, and redirects to `/trips/{id}?new=1`.
- Moved day-row generation into `src/app/(app)/trips/create-trip-days.ts` because Next.js 16 requires top-level `"use server"` files to export only async server actions.
- Wired the New Trip dialog into the trips page with `useTransition`, `isPending`, disabled duplicate submission, and loading text.
- Refactored trip detail handlers into `useTripDetailHandlers` and day card DnD orchestration into `day-card-dnd.tsx`; confirmed `page-client.tsx` and `day-card.tsx` are under 250 lines.
- Added initial Day 1 expansion for newly created trips via server `searchParams` and serializable client props.
- Added unit and E2E coverage for optional dates, day generation, pending state, initial expansion, and create-trip flows.

### File List

- `drizzle/0000_green_valeria_richards.sql` (new)
- `drizzle/meta/_journal.json` (new)
- `drizzle/meta/0000_snapshot.json` (new)
- `src/db/schema.ts`
- `src/data/types.ts`
- `src/lib/utils.ts`
- `src/lib/db-mappers.ts`
- `src/app/(app)/trips/actions.ts`
- `src/app/(app)/trips/create-trip-days.ts` (new)
- `src/app/(app)/trips/[tripId]/page.tsx`
- `src/app/(app)/trips/[tripId]/page-client.tsx`
- `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts` (new — extracted from page-client.tsx)
- `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx`
- `src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx`
- `src/components/packt/day-card.tsx`
- `src/components/packt/day-card-dnd.tsx` (new)
- `src/app/(app)/trips/page-client.tsx`
- `src/components/packt/new-trip-dialog.tsx`
- `src/components/packt/day-ribbon.tsx`
- `src/components/packt/now-card.tsx`
- `src/components/packt/trip-card.tsx`
- `src/components/packt/trips-mobile-tabs.tsx`
- `src/components/packt/trips-past-list.tsx`
- `src/app/(app)/trips/actions.test.ts` (new)
- `src/lib/utils.test.ts` (updated)
- `src/lib/db-mappers.test.ts` (updated)
- `src/components/packt/new-trip-dialog.test.tsx` (updated)
- `src/components/packt/day-card.test.tsx` (updated)
- `tests/e2e/features/create-trip.feature` (new)
- `tests/e2e/steps/create-trip.steps.ts` (new)
- `vitest.setup.mts`

### Change Log

- 2026-05-24 — Implemented Story 1.2 create-trip server action, optional dates, initial trip page expansion, tests, and migrations.
