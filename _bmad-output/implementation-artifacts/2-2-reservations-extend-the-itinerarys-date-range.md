---
baseline_commit: cb77a2b
---

# Story 2.2 — Reservations Extend the Itinerary's Date Range

**Status:** review
**Epic:** 2 — Reservations Sync to the Itinerary
**Branch:** feature/2-2-reservations-extend-the-itinerarys-date-range

---

## User Story

As a trip planner,
I want my Itinerary's date range to automatically extend when I add a Reservation outside it,
so that I don't have to manually add Days before booking a flight that lands before my trip currently starts (or ends after it currently ends).

---

## Acceptance Criteria

### AC1 — Reservation outside trip's date range extends `startDate` and/or `endDate`

**Given** a trip's current date range is `startDate`–`endDate`
**When** I save a Reservation (via `createReservation` or `updateReservation`) whose `startTime` or `endTime` falls on a date before `startDate` or after `endDate`
**Then** the trip's `startDate` and/or `endDate` is extended to include that date, and a new `days` row is added for each newly-included date

### AC2 — New days inserted at front shift existing `dayNumber`

**Given** a Reservation's date falls before the trip's current `startDate`
**When** the new Day(s) are inserted at the front of the Itinerary
**Then** existing Days' `dayNumber` values shift to remain sequential (e.g. a Reservation 2 days before the current Day 1 becomes Day 1, current Day 1 becomes Day 3)

### AC3 — New days appended preserve existing `dayNumber`

**Given** a Reservation's date falls after the trip's current `endDate`
**When** the new Day(s) are appended to the Itinerary
**Then** they receive the next sequential `dayNumber`(s), and existing Days are unaffected

### AC4 — Reservation write + days extension is transactional

**Given** the days-extension and the Reservation insert/update
**When** either part fails
**Then** both are rolled back together — the extension and the Reservation write happen inside a single `db.transaction()`

### AC5 — Reservation inside existing range does not extend

**Given** a Reservation's `startTime`/`endTime` falls within the trip's existing date range
**When** the Reservation is saved
**Then** no `days` rows are added and `trip.startDate`/`endDate` are unchanged

### AC6 — Newly-added extension Day renders Linked Events

**Given** a newly-added Day created by this story
**When** the Itinerary renders it
**Then** it displays the triggering Reservation's Linked Event(s) (per Story 2.1's `deriveLinkedEvents()`/query merge) exactly like any other Day — no special-casing for "extension" Days

### AC7 — MAX_TRIP_DAYS prevents unbounded extension

**Given** the trip is already at `MAX_TRIP_DAYS` (45) days
**When** a Reservation is saved that would require adding more days
**Then** `createReservation`/`updateReservation` throws `Error("Trip cannot exceed 45 days.")` and no Reservation or Day changes are persisted (transactional rollback)

### AC8 — `createReservation` with dates on the same day as existing boundaries does not duplicate

**Given** a trip with `startDate = "2030-06-10"` and `endDate = "2030-06-15"`
**When** a Reservation is created with `startAt = "2030-06-10T15:00:00Z"` (same day as `startDate`)
**Then** no new Days are added — the existing Day 1 covers it (no duplication, no unnecessary extension)

### AC9 — `updateReservation` with a new date outside the current range triggers extension

**Given** an existing Reservation with dates within the trip's range
**When** the Reservation is updated with a `startAt` or `endAt` that falls outside the trip's current `startDate`–`endDate`
**Then** the same FR-8 extension logic applies (new Days inserted, `dayNumber` shift, trip date updated)

---

## Technical Tasks

### Task 1 — Add `extendTripDateRange()` helper in reservation actions

**File:** `src/app/(app)/trips/[tripId]/reservations/actions.ts`

Add a new function **before** the existing action exports:

```ts
import { eq, asc, sql } from "drizzle-orm";
import { days, trips } from "@/db/schema";

const MAX_TRIP_DAYS = 45;

function nextCalendarDate(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function extendTripDateRange(
  transaction: typeof db,
  tripId: string,
  tripStartDate: string | undefined,
  tripEndDate: string | undefined,
  reservationStartAt: string | undefined,
  reservationEndAt: string | undefined
): Promise<{ newStartDate?: string; newEndDate?: string }> {
  const startDateStr = reservationStartAt ? reservationStartAt.slice(0, 10) : undefined;
  const endDateStr = reservationEndAt ? reservationEndAt.slice(0, 10) : undefined;

  // No extension needed if both dates fall within existing range
  const needsStartExtension = startDateStr && (!tripStartDate || startDateStr < tripStartDate);
  const needsEndExtension = endDateStr && (!tripEndDate || endDateStr > tripEndDate);
  if (!needsStartExtension && !needsEndExtension) {
    return {};
  }

  // Compute new boundaries
  const newStartDate = needsStartExtension ? startDateStr! : tripStartDate!;
  const newEndDate = needsEndExtension ? endDateStr! : tripEndDate!;

  // Count total Days after extension
  const existingDayCount = (
    await transaction
      .select({ count: sql<number>`count(*)::int` })
      .from(days)
      .where(eq(days.tripId, tripId))
  )[0]?.count ?? 0;

  // Generate date strings for new days
  const allDates: string[] = [];
  let cursor = newStartDate;
  while (cursor <= newEndDate) {
    allDates.push(cursor);
    cursor = nextCalendarDate(cursor);
  }

  // Determine which dates need new days
  const existingDayDates = new Set(
    (await transaction
      .select({ date: days.date })
      .from(days)
      .where(eq(days.tripId, tripId)))
      .map((d) => d.date)
      .filter(Boolean) as string[]
  );

  const newDateStrings = allDates.filter((d) => !existingDayDates.has(d));
  const totalDaysAfter = existingDayCount + newDateStrings.length;

  if (totalDaysAfter > MAX_TRIP_DAYS) {
    throw new Error("Trip cannot exceed 45 days.");
  }

  // Insert new day rows — pre-range dates must be inserted newest-first
  // to preserve chronological ordering (each front-insert shifts existing days)
  const sortedForInsert = [...newDateStrings].sort((a, b) => {
    const aBefore = tripStartDate && a < tripStartDate;
    const bBefore = tripStartDate && b < tripStartDate;
    if (aBefore && bBefore) return b.localeCompare(a); // descending: newest first
    if (!aBefore && !bBefore) return a.localeCompare(b); // ascending
    return aBefore ? -1 : 1; // pre-range before post-range
  });

  for (const dateStr of sortedForInsert) {
    const isBeforeRange = tripStartDate && dateStr < tripStartDate;
    const existingDays = await transaction
      .select({ dayNumber: days.dayNumber })
      .from(days)
      .where(eq(days.tripId, tripId))
      .orderBy(asc(days.dayNumber));

    if (isBeforeRange) {
      // Shift all existing dayNumbers and labels up by 1
      await transaction
        .update(days)
        .set({
          dayNumber: sql`${days.dayNumber} + 1`,
          label: sql`concat('Day ', ${days.dayNumber} + 1)`,
        })
        .where(eq(days.tripId, tripId));

      // Insert at dayNumber 1
      await transaction.insert(days).values({
        tripId,
        dayNumber: 1,
        date: dateStr,
        label: `Day 1`,
      });
    } else {
      // Append at the end
      const maxDayNumber = existingDays.at(-1)?.dayNumber ?? 0;
      await transaction.insert(days).values({
        tripId,
        dayNumber: maxDayNumber + 1,
        date: dateStr,
        label: `Day ${maxDayNumber + 1}`,
      });
    }
  }

  // Update trip startDate/endDate
  const updateFields: Record<string, unknown> = { updatedAt: new Date() };
  if (needsStartExtension) updateFields.startDate = newStartDate;
  if (needsEndExtension) updateFields.endDate = newEndDate;

  if (Object.keys(updateFields).length > 1) {
    // updatedAt is always present, so >1 means we have actual changes
    await transaction
      .update(trips)
      .set(updateFields)
      .where(eq(trips.id, tripId));
  }

  return {
    newStartDate: needsStartExtension ? newStartDate : undefined,
    newEndDate: needsEndExtension ? newEndDate : undefined,
  };
}
```

### Task 2 — Wrap `createReservation` in `db.transaction()`

**File:** `src/app/(app)/trips/[tripId]/reservations/actions.ts`

Replace the existing `createReservation` body with a transactional wrapper:

```ts
export async function createReservation(tripId: string, input: CreateReservationInput): Promise<void> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");

  if (!Object.values(ReservationType).includes(input.type)) {
    throw new Error("Invalid reservation type.");
  }

  if (!input.provider.trim()) {
    throw new Error("Provider is required.");
  }

  if (REQUIRES_END_AT.includes(input.type) && !input.endAt) {
    throw new Error("An end date and time is required for this reservation type.");
  }

  await db.transaction(async (tx) => {
    // Fetch current trip dates inside the transaction
    const [trip] = await tx
      .select({ startDate: trips.startDate, endDate: trips.endDate })
      .from(trips)
      .where(eq(trips.id, tripId));
    if (!trip) throw new Error("Trip not found.");

    // Extend date range if needed (AC1–AC3, AC7)
    await extendTripDateRange(
      tx as unknown as typeof db,
      tripId,
      trip.startDate ?? undefined,
      trip.endDate ?? undefined,
      input.startAt,
      input.endAt
    );

    // Insert the reservation
    await tx.insert(reservations).values({
      tripId,
      type: input.type,
      provider: input.provider.trim(),
      startAt: input.startAt ? new Date(input.startAt) : undefined,
      endAt: input.endAt ? new Date(input.endAt) : undefined,
      startAddress: input.startAddress,
      startLocationName: input.startLocationName,
      startLocationLat: input.startLocationLat,
      startLocationLng: input.startLocationLng,
      endAddress: input.endAddress,
      endLocationName: input.endLocationName,
      endLocationLat: input.endLocationLat,
      endLocationLng: input.endLocationLng,
      cost: input.cost != null ? String(input.cost) : undefined,
      confirmationCode: input.confirmationCode,
      serviceNumber: input.serviceNumber,
      notes: input.notes,
    });
  });

  revalidatePath(`/trips/${tripId}`);
}
```

**Critical:** The `tx` from `db.transaction()` is a Drizzle transaction object. The `extendTripDateRange` uses `eq`/`asc`/`sql` etc. which are already imported at the top of the file. The `.select().from()` chain works on the `tx` object the same way as on `db`. However, the Drizzle transaction typing may not accept the full `select().from().where()` chain directly — verify in practice and cast with `as unknown as typeof db` if needed, or destructure the helper to accept `tx` as a bare drizzle instance.

### Task 3 — Wrap `updateReservation` in `db.transaction()`

**File:** `src/app/(app)/trips/[tripId]/reservations/actions.ts`

Same pattern as Task 2 — wrap the existing update logic in `db.transaction()`:

```ts
export async function updateReservation(reservationId: string, patch: UpdateReservationPatch): Promise<void> {
  const user = await requireUser();

  const [existing] = await db.select().from(reservations).where(eq(reservations.id, reservationId));
  if (!existing) throw new Error("Reservation not found.");

  await assertTripAccess(existing.tripId, user.id!, "editor");

  if (patch.provider !== undefined && !patch.provider.trim()) {
    throw new Error("Provider is required.");
  }

  if (patch.startAt && Number.isNaN(new Date(patch.startAt).getTime())) {
    throw new Error("Invalid start date and time.");
  }

  if (patch.endAt && Number.isNaN(new Date(patch.endAt).getTime())) {
    throw new Error("Invalid end date and time.");
  }

  const type = existing.type as ReservationType;
  const nextStartAt = patch.startAt !== undefined ? patch.startAt || undefined : existing.startAt?.toISOString();
  const nextEndAt = patch.endAt !== undefined ? patch.endAt || undefined : existing.endAt?.toISOString();

  if (REQUIRES_END_AT.includes(type) && !nextEndAt) {
    throw new Error("An end date and time is required for this reservation type.");
  }

  if (nextEndAt && !nextStartAt) {
    throw new Error("A start date and time is required when an end date and time is set.");
  }

  if (nextStartAt && nextEndAt && new Date(nextEndAt).getTime() < new Date(nextStartAt).getTime()) {
    throw new Error("The end date and time must be after the start date and time.");
  }

  await db.transaction(async (tx) => {
    const [trip] = await tx
      .select({ startDate: trips.startDate, endDate: trips.endDate })
      .from(trips)
      .where(eq(trips.id, existing.tripId));
    if (!trip) throw new Error("Trip not found.");

    // Extend date range if the new dates require it (AC9)
    await extendTripDateRange(
      tx as unknown as typeof db,
      existing.tripId,
      trip.startDate ?? undefined,
      trip.endDate ?? undefined,
      nextStartAt,
      nextEndAt
    );

    // Existing update logic inside the transaction
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.provider !== undefined) updates.provider = patch.provider.trim();
    if (patch.startAt !== undefined) updates.startAt = patch.startAt ? new Date(patch.startAt) : null;
    if (patch.endAt !== undefined) updates.endAt = patch.endAt ? new Date(patch.endAt) : null;
    if (patch.startAddress !== undefined) {
      updates.startAddress = patch.startAddress || null;
      if (!patch.startAddress) {
        updates.startLocationName = null;
        updates.startLocationLat = null;
        updates.startLocationLng = null;
      } else {
        if (patch.startLocationName !== undefined) updates.startLocationName = patch.startLocationName || null;
        if (patch.startLocationLat !== undefined) updates.startLocationLat = patch.startLocationLat;
        if (patch.startLocationLng !== undefined) updates.startLocationLng = patch.startLocationLng;
      }
    }
    if (patch.endAddress !== undefined) {
      updates.endAddress = patch.endAddress || null;
      if (!patch.endAddress) {
        updates.endLocationName = null;
        updates.endLocationLat = null;
        updates.endLocationLng = null;
      } else {
        if (patch.endLocationName !== undefined) updates.endLocationName = patch.endLocationName || null;
        if (patch.endLocationLat !== undefined) updates.endLocationLat = patch.endLocationLat;
        if (patch.endLocationLng !== undefined) updates.endLocationLng = patch.endLocationLng;
      }
    }
    if (patch.cost !== undefined) updates.cost = patch.cost != null ? String(patch.cost) : null;
    if (patch.confirmationCode !== undefined) updates.confirmationCode = patch.confirmationCode || null;
    if (patch.serviceNumber !== undefined) updates.serviceNumber = patch.serviceNumber || null;
    if (patch.notes !== undefined) updates.notes = patch.notes || null;

    await tx.update(reservations).set(updates).where(eq(reservations.id, reservationId));
  });

  revalidatePath(`/trips/${existing.tripId}`);
}
```

### Task 4 — Update existing unit tests in `actions.test.ts`

**File:** `src/app/(app)/trips/[tripId]/reservations/actions.test.ts`

The test file currently mocks `db` as a bare object with `insert`/`select`/`update`/`delete`. After this change, `db.transaction()` is called and its callback receives a `tx` object.

#### Test mock changes

Replace the existing `db` mock in the hoisted block:

```ts
const { assertTripAccess, db, requireUser, revalidatePath } = vi.hoisted(() => ({
  assertTripAccess: vi.fn(),
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),  // NEW
  },
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
}));
```

Then in each test's `beforeEach`, set up the `transaction` mock to execute its callback:

```ts
db.transaction.mockImplementation(async (callback: (tx: typeof db) => Promise<void>) => {
  await callback(db);
});
```

This way `tx.select()`, `tx.insert()`, etc. all resolve through the same mocks as `db.select()`, `db.insert()`.

#### Order-dependent `db.select()` patterns

The existing tests chain `.mockReturnValueOnce()` on `db.select` expecting the call order. With the transaction, the `extendTripDateRange` helper does its own `db.select()` calls inside the transaction callback. The mock setup needs to handle the new call order:

1. `createReservation` tests: `db.select()` is now called first by the `extendTripDateRange` → `tx.select({ date: days.date })` and `tx.select({ count: sql })` etc. Mock these additional select calls in order.

   For the `createReservation` "inserts a reservation with all provided fields" test, the call sequence inside the transaction is:
   - `tx.select({ startDate, endDate }).from(trips).where(...)` → return `[{ startDate: null, endDate: null }]`
   - `tx.select({ count }).from(days).where(...)` → return `[{ count: 2 }]`
   - `tx.select({ date }).from(days).where(...)` → return `[{ date: "2030-08-01" }, { date: "2030-08-02" }]`
   - `tx.select({ dayNumber }).from(days).where(...).orderBy(...)` → return `[{ dayNumber: 1 }, { dayNumber: 2 }]` (once per date being inserted)
   - Reservation insert

2. For tests that don't extend (existing range), mock `startDate` and `endDate` to already cover the new dates → no extension needed → simpler path.

#### New test cases to add

All inside `describe("createReservation")`:

- `"extends endDate when reservation falls after trip endDate"` — mock trip with `startDate: "2030-06-01", endDate: "2030-06-05"`, create reservation on `"2030-06-10"`, assert new day inserted, trip endDate updated
- `"extends startDate when reservation falls before trip startDate"` — mock trip with `startDate: "2030-06-10", endDate: "2030-06-15"`, create reservation on `"2030-06-05"`, assert new day inserted at front with dayNumber=1, existing days shifted
- `"extends both startDate and endDate when reservation spans beyond both"` — mock trip with `startDate: "2030-06-10", endDate: "2030-06-15"`, create lodging reservation from `"2030-06-05"` to `"2030-06-20"`, assert both boundaries extended
- `"does not extend when reservation falls within existing range"` (AC5) — trip `"2030-06-10"`–`"2030-06-15"`, reservation `"2030-06-12"`, assert no new days, no trip update
- `"throws MAX_TRIP_DAYS error when extension would exceed limit"` — mock existing day count = 45, reservation outside range, assert `Error("Trip cannot exceed 45 days.")`
- `"does not duplicate days when reservation date matches existing boundary"` (AC8) — trip `"2030-06-10"`–`"2030-06-15"`, reservation on `"2030-06-10T15:00:00Z"`, assert no new days inserted
- `"rolls back reservation insert when extendTripDateRange fails"` — mock `tx.select` to throw inside extension, assert reservation not inserted

All inside `describe("updateReservation")`:

- `"extends trip date range when updated startAt falls outside current range"` — mock existing reservation within range, patch `startAt` to a date before trip startDate, assert extension occurs
- `"does not extend when update does not change dates"` — patch only `provider`, assert no extension logic runs
- `"extends when endAt is added that falls outside trip range"` — existing reservation has no endAt, patch endAt to after trip endDate

### Task 5 — E2E

**File:** `tests/e2e/features/linked-events.feature` (extend existing)

Add to the existing `linked-events.feature`:

```gherkin
Scenario: Reservation before trip startDate creates a new Day 1
  Given the trip has a Lodging reservation with Check-in on the day before Day 1 and Check-out on Day 1
  When I view the Itinerary tab
  Then I see a new Day 1 with a "Check-in" Linked Event
  And the previous Day 1 is now Day 2

Scenario: Reservation after trip endDate creates a new last Day
  Given the trip has a Lodging reservation with Check-in on the day after the last Day and Check-out on the day after that
  When I view the Itinerary tab
  Then I see a new Day 4 with a "Check-in" Linked Event
  And a new Day 5 with a "Check-out" Linked Event
```

**File:** `tests/e2e/steps/linked-events.steps.ts`

Add step definitions:

```ts
Given("the trip has a Lodging reservation with Check-in on the day before Day 1 and Check-out on Day 1", async ({ page, scenario }) => {
  await scenario.materialize({
    trip: {
      mother: "threeDayTrip",
      overrides: {
        // Override trip dates so Day 1's date is known
        startDate: "2030-06-10",
        endDate: "2030-06-12",
        reservations: [
          {
            type: "lodging",
            provider: "Torel Avantgarde",
            startAt: "2030-06-09T15:00:00Z", // before trip startDate
            endAt: "2030-06-10T11:00:00Z",   // aligns with original Day 1
          },
        ],
      },
      setCurrent: true,
    },
  });
  await scenario.gotoCurrentTrip(page);
});

Given("the trip has a Lodging reservation with Check-in on the day after the last Day and Check-out on the day after that", async ({ page, scenario }) => {
  await scenario.materialize({
    trip: {
      mother: "threeDayTrip",
      overrides: {
        startDate: "2030-06-10",
        endDate: "2030-06-12",
        reservations: [
          {
            type: "lodging",
            provider: "Seaside Resort",
            startAt: "2030-06-13T15:00:00Z", // after trip endDate
            endAt: "2030-06-14T11:00:00Z",   // further out
          },
        ],
      },
      setCurrent: true,
    },
  });
  await scenario.gotoCurrentTrip(page);
});

Then("I see a new Day {int} with a {string} Linked Event", async ({ page, int, string }) => {
  await expect(page.getByText(`Day ${int}`)).toBeVisible();
  await expect(page.getByText(string, { exact: false })).toBeVisible();
});

Then("the previous Day {int} is now Day {int}", async ({ page, int: oldDay, int: newDay }) => {
  await expect(page.getByText(`Day ${oldDay}`)).not.toBeVisible();
  await expect(page.getByText(`Day ${newDay}`)).toBeVisible();
});
```

---

## Dev Notes

### Architecture constraints

- **Single transaction rule (non-negotiable):** The `extendTripDateRange` call and the Reservation `insert`/`update` MUST happen inside the same `db.transaction()`. If either fails, both roll back (AC4). This is the same pattern used by `addDay`/`removeLastDay` in `src/app/(app)/trips/[tripId]/actions.ts`.
- **No other functions touch `days` for this feature:** The only code writing to `days` table for FR-8 is `extendTripDateRange`. Existing `addDay`/`removeLastDay` in `src/app/(app)/trips/[tripId]/actions.ts` remain unchanged.
- **`dayNumber` shift:** When inserting at the front, use SQL `SET dayNumber = dayNumber + 1` to shift existing days. When appending at the end, compute `max(dayNumber) + 1`.
- **Label pattern:** Extension days use label `"Day {dayNumber}"` (e.g. `"Day 1"` for a pre-trip insert). This matches how `addDay` in `actions.ts` labels days.
- **Date field type:** `trip.startDate` and `trip.endDate` are `date` columns (ISO date strings `"YYYY-MM-DD"`). `reservation.startAt`/`endAt` are `timestamp with time zone` columns (ISO datetime strings). Use `.slice(0, 10)` to extract the date portion for comparison.
- **`trip.startDate`/`endDate` can be `null`** — the DB schema has `date("start_date")` without `.notNull()`. Guard defensively.
- **`MAX_TRIP_DAYS`** = 45 (already defined in `src/app/(app)/trips/[tripId]/actions.ts:32`). Re-define or import — re-defining in `reservations/actions.ts` is fine since there's currently no import dependency between the two action files.

### Key files and their current state

| File | State today | What this story changes |
|------|------------|------------------------|
| `src/app/(app)/trips/[tripId]/reservations/actions.ts` | `createReservation`/`updateReservation` are bare DB writes with no transaction or FR-8 logic | Add `extendTripDateRange()` helper; wrap both actions in `db.transaction()` that calls the helper; add `MAX_TRIP_DAYS` constant; import `days`/`trips`/`asc`/`sql` |
| `src/app/(app)/trips/[tripId]/reservations/actions.test.ts` | Tests mock `db` without `transaction`; test only CRUD validation | Update mock to support `db.transaction()`; add test cases for AC1–AC9 |

### No changes needed to these files

- `src/lib/queries.ts` — Already fetches `trip.startDate`/`endDate` and passes them through. Linked Events merge into days by date prefix match, which works for newly-inserted days because their `day.date` is set to the correct ISO date. No changes needed.
- `src/lib/linked-events.ts` — Pure derivation, no awareness of trip date ranges. No changes needed.
- `src/components/packt/` — No component changes for this story. Day extension is purely a data mutation; the Itinerary already renders any day it receives.
- `src/db/schema.ts` — No schema changes for this story.
- `src/app/(app)/trips/[tripId]/actions.ts` — `addDay`/`removeLastDay` remain untouched.
- `src/data/types.ts` — No type changes.

### Date sequence generation

The approach in `extendTripDateRange` above generates the full date range from the new start boundary to the new end boundary and filters out dates that already have day rows — this is simpler and more robust than trying to compute dates backward/forward incrementally from the trip boundaries.

### Drizzle transaction typing

The `db.transaction()` callback receives a `tx` argument. The Drizzle `pg-core` transaction type may not be type-compatible with the module-level `db` type. The pattern used in the existing codebase is:

```ts
await db.transaction(async (tx) => {
  // tx has the same .select().from().where() etc. as db
  await tx.select().from(trips).where(eq(trips.id, tripId));
});
```

If type errors arise passing `tx` to `extendTripDateRange`, cast: `tx as unknown as typeof db` or use `as any` in the helper signature. Runtime behavior is unaffected.

### Edge cases handled by the implementation plan

- **Existing reservation dates on same day as startDate/endDate boundary** (AC8): The `existingDayDates` Set includes the boundary dates, so no duplicate day is created.
- **Multi-day extension** (e.g. reservation 3 days before start date): Pre-range dates are sorted newest-first so each front-insert piles the dates in correct chronological order (earliest date ends up at the lowest dayNumber).
- **Extension via `updateReservation`** (AC9): The helper runs before the update, using the *patched* dates (not the existing DB dates).
- **`MAX_TRIP_DAYS` overflow** (AC7): Checked before any mutation; throws inside the transaction, causing a full rollback.
- **Trip with null startDate/endDate**: Guarded — `!tripStartDate` is treated as "needs extension" since there's no existing boundary.

### What will break if done wrong

- If the extension logic runs **after** the reservation insert (outside transaction), a failed extension could leave the reservation orphaned in the DB with no corresponding day. **The call order must be: validate → open transaction → extend days → insert/update reservation → commit.**
- If `dayNumber` shift runs twice or skips, the `unique(tripId, dayNumber)` constraint will throw at commit time — test with a multi-day front-insertion scenario.
- If pre-range dates are not sorted newest-first, the day-number shift loop reverses chronological order (e.g. 2030-06-09 becomes Day 1 and 2030-06-08 becomes Day 2). The sorted-insert approach avoids this.

---

## Files to Create

None — this story only modifies existing files.

## Files to Modify

| File | Change summary |
|------|---------------|
| `src/app/(app)/trips/[tripId]/reservations/actions.ts` | Add `extendTripDateRange()` helper + `MAX_TRIP_DAYS`; wrap `createReservation` and `updateReservation` in `db.transaction()` with extension call |
| `src/app/(app)/trips/[tripId]/reservations/actions.test.ts` | Update `db` mock for `transaction`; add test cases for AC1–AC9 |

---

## Definition of Done

- [x] `npm run test:coverage` passes with ≥95% lines/functions, ≥90% branches
- [x] `npm run test:e2e` passes including the new extension scenarios
- [x] `npm run build` succeeds with no TypeScript errors
- [x] `npx eslint src tests --max-warnings 0` passes (no single-letter vars, no `any`, etc.)
- [ ] Manual verification: create a Lodging reservation with Check-in before Day 1, confirm the Itinerary shows a new Day 1 with a "Check-in" Linked Event and the original Day 1 shifted to Day 2
- [ ] Manual verification: create a Flight reservation within the existing date range, confirm no Day extension occurs
- [ ] Manual verification: update an existing Reservation to a date outside the range, confirm Day extension occurs

---

## Change Log

- 2026-06-18: Added transactional reservation date-range extension logic, expanded unit coverage, and added linked-events E2E scenarios for front/back itinerary growth.

## Dev Agent Record

### Implementation Plan

- Add transaction-backed trip date extension helpers in `reservations/actions.ts`.
- Expand `reservations/actions.test.ts` to cover extension, rollback, and boundary cases first.
- Extend linked-events E2E coverage with reservation-created front/back date-range expansion flows.

### Previous Story Learnings (Story 2.1)

Import this story knowledge to avoid repeating mistakes:

1. **DnD exclusion for Linked Events**: Already handled in Story 2.1 — Linked Events are excluded from `SortableContext` and rendered as non-sortable `PlaceRow`. This story's new extension days contain Linked Events that inherit this same rendering.
2. **Position offset for linked events**: Story 2.1 discovered that raw epoch-ms `position` values cause linked events to sort after all manual events. The fix uses a large negative offset constant. This story's extension logic does NOT set `position` on extension days — Linked Events on those days will sort correctly via the same offset mechanism.
3. **`db.transaction()` pattern**: Story 2.1 didn't use transactions, but `addDay`/`removeLastDay` in the adjacent `actions.ts` do. This story follows their transaction pattern exactly.
4. **Query layer already handles new days**: The `getTripDetail()` function in `queries.ts` maps all days from the DB, then matches Linked Events via `toLocalDateKey(linkedEvent.startAt) === day.date`. Newly-inserted extension days will match automatically — no query changes needed.
5. **E2E fixture pattern**: Story 2.1 established the Reservation Object Mother usage with `scenario.materialize()`. Reuse the same pattern with date overrides for this story's scenarios.

### File List

- `src/app/(app)/trips/[tripId]/reservations/actions.ts`
- `src/app/(app)/trips/[tripId]/reservations/actions.test.ts`
- `tests/e2e/features/linked-events.feature`
- `tests/e2e/steps/linked-events.steps.ts`

### Debug Log

- Full linked-events E2E surfaced a real database uniqueness collision when prepending days; fixed by shifting existing `dayNumber` values in two phases inside the transaction before inserting the new Day 1.
- Reservations inline-edit E2E exposed that time-only edits should not re-run extension logic; narrowed `updateReservation` to trigger extension only when the patched calendar date changes.

### Completion Notes

- Added `extendTripDateRange()` to reservation actions and wrapped `createReservation` / `updateReservation` in one transaction per mutation so day creation and reservation writes commit or roll back together.
- Covered front extension, back extension, both-boundary extension, boundary no-op, rollback, MAX_TRIP_DAYS enforcement, and time-only edit behavior in `actions.test.ts`.
- Added linked-events browser scenarios that create reservations through the UI and verify newly inserted leading/trailing itinerary days render the expected Linked Events.
- Validation pass complete: lint, TypeScript, coverage, production build, targeted reservation/linked-events specs, and the full `npm run test:e2e` suite all passed.
- No separate hand-run manual spot check was performed beyond the automated Playwright coverage above.
