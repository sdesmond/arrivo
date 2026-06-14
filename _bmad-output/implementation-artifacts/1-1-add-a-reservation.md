# Story 1.1: Add a Reservation

Status: ready-for-dev

## Story

As a trip planner,
I want to add a Reservation (flight, lodging, rental car, or anything else I've booked) to my trip,
so that I have a single place to record my bookings without re-creating them as itinerary events.

## Acceptance Criteria

1. **Type picker** — On the Reservations tab, tapping "Add Reservation" opens a `DropdownMenu` listing all 8 Reservation Types (Flight, Train, Bus, Ferry, Rental Car, Lodging, Cruise, Other) with the UX-DR1 icon mapping (`Plane`/`Train`/`Bus`/`Ship`/`Car`/`Hotel`/`Anchor`/`Package`, all `strokeWidth={1.5}`).
2. **Add drawer opens into type-specific fields (UX-DR4)** — Selecting a type (e.g. Lodging) opens the Add Reservation drawer directly into that type's fields: title "Add Lodging Reservation", subtitle "Type: Lodging (cannot be changed after saving)", anchor fields labeled "Check-in"/"Check-out", plus Provider* (required), Confirmation code (Optional), Notes (Optional), and an empty Documents section (placeholder only — no upload wiring in this story, see Dev Notes scope boundary).
3. **"Other" type uses generic anchor labels** — Selecting "Other" opens the drawer with title "Add Other Reservation", subtitle "Type: Other (cannot be changed after saving)", and generic anchor labels "Start"/"End" (not a type-specific pair).
4. **Required end-anchor validation for Lodging/Rental Car/Cruise** — For these three types, tapping Save without filling in the second anchor (`endAt`) blocks the save, shows the `endAt` field's required/`aria-invalid` state, and moves focus to it.
5. **Optional end-anchor for Flight/Train/Bus/Ferry/Other** — For these types, tapping Save without `endAt` saves successfully with only `startAt` set.
6. **Save flow** — With all required fields filled, tapping Save calls `createReservation` (`src/app/(app)/trips/[tripId]/reservations/actions.ts`), which runs `requireUser()` → `assertTripAccess(tripId, "editor")` → inserts the `reservations` row → `revalidatePath(/trips/${tripId})`. The drawer closes and the new Reservation appears as a row in its type's accordion section on the Reservations tab.
7. **Type is immutable post-save** — After saving, a Reservation's `type` is shown via the accordion's icon/title only and is not editable anywhere (row or drawer).
8. **Data model additions** — `reservations` table added to `src/db/schema.ts` (modeled on `events`, FK to `trips` with cascade delete, no `position` field, sorted by `startAt`); `ReservationType` (kebab-case const-object + union: `flight | train | bus | ferry | rental-car | lodging | cruise | other`) and `Reservation` added to `src/data/types.ts`; `dbReservationToType()` added to `src/lib/db-mappers.ts`.
9. **Tab wiring** — `TripDetailTab` gains `Reservations: "res"`; `resolveTripDetailTab()` recognizes it; `TripDetailTabBody` renders a new `ReservationsTab` component when `activeTab === "res"`, with minimal accordion rendering sufficient to display newly-added Reservations (full accordion UX is Story 1.2).
10. **Reservation Object Mother** — Added to `tests/e2e/e2e-seed-data.ts` / `tests/e2e/scenario-fixture.ts`: a default Reservation fixture (overridable `type`/`startAt`/`endAt`/`provider`/`confirmationCode`/`notes`) that materializes a fresh `reservations` row scoped to a scenario-owned trip. Stories 1.2–1.5 and Epic 2 scenarios reuse this mother.
11. **Unit/component tests** — `dbReservationToType()` mapper test, `createReservation` action test (covering `endAt` requirement for all 8 types, including "Other"), `reservation-type-picker.test.tsx`, `reservation-edit-drawer.test.tsx` (Add mode, including "Other"'s generic Start/End labels).
12. **E2E** — `tests/e2e/features/reservations.feature` gains a scenario for adding a Lodging Reservation (via the new Object Mother for trip setup) and verifying it appears in the Lodging accordion section.

## Tasks / Subtasks

- [ ] **Task 1: `reservations` table** (AC: 8)
  - [ ] Add `reservations` pgTable to `src/db/schema.ts`, modeled on `events` (see Dev Notes for exact column list)
  - [ ] Run `npm run db:migrate:e2e` to push the schema to the E2E database

- [ ] **Task 2: Types** (AC: 8, 9)
  - [ ] Add `ReservationType` const-object + union to `src/data/types.ts` (kebab-case values, see Dev Notes)
  - [ ] Add `Reservation` interface and `CreateReservationInput` interface to `src/data/types.ts`
  - [ ] Add `TripDetailTab.Reservations = "res"` to the `TripDetailTab` const-object
  - [ ] Add `reservations: Reservation[]` to `TripDetailPayload`

- [ ] **Task 3: `dbReservationToType()` mapper** (AC: 8, 11)
  - [ ] Add `dbReservationToType()` to `src/lib/db-mappers.ts`
  - [ ] Add/extend `src/lib/db-mappers.test.ts` with a `dbReservationToType()` test

- [ ] **Task 4: Query layer — load reservations with trip detail** (AC: 9)
  - [ ] In `src/lib/queries.ts`'s `getTripDetail()`, query `reservations` by `tripId`, map via `dbReservationToType()`, and include in the returned `TripDetailPayload`

- [ ] **Task 5: `createReservation` server action** (AC: 6, 11)
  - [ ] Create `src/app/(app)/trips/[tripId]/reservations/actions.ts` (new file) with `createReservation(tripId, input: CreateReservationInput): Promise<void>` — `requireUser()` → `assertTripAccess(tripId, user.id!, "editor")` → server-side `endAt` requirement check for Lodging/Rental Car/Cruise (throw `Error(...)` if missing) → `db.insert(reservations).values(...)` → `revalidatePath(/trips/${tripId})`
  - [ ] Add `src/app/(app)/trips/[tripId]/reservations/actions.test.ts` covering: successful insert for each of the 8 types, `endAt`-required error thrown for Lodging/Rental Car/Cruise when `endAt` is missing, success with `endAt` omitted for Flight/Train/Bus/Ferry/Other, `assertTripAccess` called with `"editor"`, `revalidatePath` called with the trip path

- [ ] **Task 6: Reservation Type → icon mapping** (AC: 1, 7, 9)
  - [ ] Create `src/components/packt/reservation-type-badge.tsx` exporting the centralized `ReservationType → { icon, label }` map (UX-DR1) and a small `ReservationTypeBadge` (or equivalent icon-rendering helper) — single exported source, imported by the type picker and the accordion header
  - [ ] Create `src/components/packt/reservation-type-badge.test.tsx` asserting all 8 `ReservationType` values have a `RESERVATION_TYPE_META` entry with the correct `label` and `icon`

- [ ] **Task 7: Reservation Type picker** (AC: 1, 11)
  - [ ] Create `src/components/packt/reservation-type-picker.tsx` — `"use client"` (has `onClick` handlers), explicit `ReservationTypePickerProps` interface, `DropdownMenu`/`DropdownMenuTrigger`("Add Reservation")/`DropdownMenuContent` with 8 `DropdownMenuItem`s (one per `ReservationType`, using the Task 6 icon map), `onClick` invokes a callback with the selected `ReservationType`
  - [ ] Create `src/components/packt/reservation-type-picker.test.tsx`

- [ ] **Task 8: Add Reservation drawer (Add mode)** (AC: 2, 3, 4, 5, 6, 11)
  - [ ] Create `src/components/packt/reservation-anchor-fieldset.tsx` — `"use client"`, explicit `ReservationAnchorFieldsetProps` interface, the `<fieldset>`/`<legend>` + `DatePicker` + `TimePicker` pair described in Dev Notes (used twice by the drawer, for the start and end anchors) — extracted as its own component to keep the drawer under the file-size limit
  - [ ] Create `src/components/packt/reservation-anchor-fieldset.test.tsx`
  - [ ] Create `src/components/packt/reservation-edit-drawer.tsx` — `"use client"`, explicit `ReservationEditDrawerProps` interface, `Drawer`/`DrawerContent`/`DrawerHeader`/`DrawerFooter` per UX-DR4, composed from two `ReservationAnchorFieldset` instances (see Dev Notes for full field spec, anchor-label table, validation rules, and focus management)
  - [ ] Create `src/components/packt/reservation-edit-drawer.test.tsx` covering: field rendering per type, "Other" generic Start/End labels, `endAt`-required validation + focus movement for Lodging/Rental Car/Cruise, successful save with `endAt` omitted for the other 5 types, `createReservation` called with correct payload, drawer closes on success, focus enters the drawer on open and returns to the "Add Reservation" trigger on close

- [ ] **Task 9: `ReservationsTab` + tab wiring** (AC: 9)
  - [ ] Create `src/components/packt/reservations-tab.tsx` — `"use client"`, explicit `ReservationsTabProps` interface (`{ tripId: string; reservations: Reservation[] }`): renders the Task 7 type picker ("Add Reservation" button), manages `selectedType`/drawer-open local state, renders the Task 8 drawer, and renders a minimal per-type grouping of `reservations` (full accordion polish is Story 1.2 — a simple grouped list is sufficient here)
  - [ ] Create `src/components/packt/reservations-tab.test.tsx`
  - [ ] In `src/app/(app)/trips/[tripId]/trip-detail-tabs.ts`, add `case TripDetailTab.Reservations:` to `resolveTripDetailTab()`'s switch
  - [ ] In `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx`, add `reservations: Reservation[]` to `TripDetailTabBodyProps` and an `{activeTab === "res" && <ReservationsTab tripId={tripId} reservations={reservations} />}` branch
  - [ ] In `src/app/(app)/trips/[tripId]/page-client.tsx`, add `{ id: "res", label: "Reservations" }` to the `TABS` array and pass `reservations={detail.reservations}` through to `TripDetailTabBody`

- [ ] **Task 10: Reservation Object Mother** (AC: 10)
  - [ ] In `tests/e2e/e2e-seed-data.ts`: add `ReservationSeed` interface (`type`, `provider`, `startAt?`, `endAt?`, `confirmationCode?`, `notes?`), add `reservations: ReservationSeed[]` to `TripMother`/`TripMotherOverrides`, add `reservations: []` to `THREE_DAY_TRIP_MOTHER`/`DATELESS_TRIP_MOTHER`/`DELETE_TRIP_MOTHER`, add `reservations` merge line to `cloneTripMother()`, add an `E2E_RESERVATION` constant (Lodging type, for the Story 1.1 E2E scenario)
  - [ ] In `tests/e2e/scenario-fixture.ts`: import `reservations` from `../../src/db/schema`, add a reservations-insertion loop in `createTrip()` (alongside the `documents` loop) inserting `{ tripId: trip.id, type, provider, startAt, endAt, confirmationCode, notes }` for each `ReservationSeed`

- [ ] **Task 11: E2E scenario** (AC: 12)
  - [ ] Add a scenario to `tests/e2e/features/reservations.feature` (new file): create a trip via the Object Mother, add a Lodging Reservation via the UI (type picker → drawer → fill Provider/Check-in/Check-out → Save), assert it appears in the Lodging accordion section
  - [ ] Add `tests/e2e/steps/reservations.steps.ts` (new file) with step definitions for the above

## Dev Notes

### Scope boundary — read first

This story delivers the **foundational data model + minimal add flow only**. Explicitly OUT of scope (later stories own these):

- Full accordion UX (collapse/expand, previews, sorting, accessible names) — **Story 1.2**. Task 9's `ReservationsTab` just needs to group/list Reservations by type so the new row is visible after Save; it does not need UX-DR2's full styling.
- Edit mode for the drawer (click-to-edit fields) — **Story 1.3**.
- Delete flow — **Story 1.4**.
- Attaching/uploading Documents to a Reservation — **Story 1.5**. The Documents section in the Add drawer (UX-DR4) renders the `Empty` composition placeholder ("No documents yet" / disabled or absent "Add document" affordance) but does **not** need working upload. Do **not** add `documents.reservation_id` or `Document["scope"] === "reservation"` in this story — that's Story 1.5's responsibility.
- Linked Events on the Itinerary, Now Card, date-range extension, CTA — **Epic 2**. Do not touch `src/lib/linked-events.ts`, `src/lib/queries.ts`'s event-merging, or the Itinerary/Now Card components beyond what Task 4 requires (just loading `reservations` into `TripDetailPayload`).

### Data model — `reservations` table (Task 1)

Add to `src/db/schema.ts`, near `events` (same import block already has everything needed — `pgTable`, `uuid`, `text`, `timestamp`, `sql`):

```ts
export const reservations = pgTable("reservations", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tripId: uuid("trip_id")
    .notNull()
    .references(() => trips.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  provider: text("provider").notNull(),
  startAt: timestamp("start_at", { withTimezone: true }),
  endAt: timestamp("end_at", { withTimezone: true }),
  confirmationCode: text("confirmation_code"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
});
```

No `position` field (per Additional Requirements — sorted by `startAt`, not manually ordered) and no `index()` — `events` uses `index().on(table.dayId, table.position)` but reservations have neither.

After adding the table, run `npm run db:migrate:e2e` (per `AGENTS.md` — required whenever `src/db/schema.ts` changes).

### Types (Task 2) — `src/data/types.ts`

Follow the existing const-object + union convention (see `CoverType`/`DocKind` at lines ~42–54). Place the `ReservationType`/`Reservation` block as its own new section, e.g. right after the DOCUMENT section (~line 191):

```ts
export const ReservationType = {
  Flight: "flight",
  Train: "train",
  Bus: "bus",
  Ferry: "ferry",
  RentalCar: "rental-car",
  Lodging: "lodging",
  Cruise: "cruise",
  Other: "other",
} as const;
export type ReservationType = (typeof ReservationType)[keyof typeof ReservationType];

export interface Reservation {
  id: string;
  tripId: string;
  type: ReservationType;
  provider: string;
  startAt?: string;
  endAt?: string;
  confirmationCode?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}
```

These exact kebab-case string literals (`flight`, `train`, `bus`, `ferry`, `rental-car`, `lodging`, `cruise`, `other`) are used **everywhere** — DB `type` column values, grouping keys, icon map keys, test fixtures. Do not invent alternate casings (e.g. `rentalCar`, `RENTAL_CAR`).

`CreateReservationInput` goes in the "Server Action input/patch shapes" section near `AddDocumentInput` (~line 614):

```ts
export interface CreateReservationInput {
  type: ReservationType;
  provider: string;
  startAt?: string; // ISO datetime
  endAt?: string;
  confirmationCode?: string;
  notes?: string;
}
```

`TripDetailTab` (lines 56–63) gains one new value — append, don't reorder:

```ts
export const TripDetailTab = {
  Itinerary: "itin",
  Map: "map",
  Documents: "docs",
  Packing: "pack",
  Notes: "notes",
  Reservations: "res",
} as const;
```

`TripDetailPayload` (lines 480–488) gains `reservations: Reservation[]`.

### `dbReservationToType()` (Task 3) — `src/lib/db-mappers.ts`

Follow `dbEventToType()`'s shape (lines 89–107). Cast `row.type` the same way `dbDocToType()` casts `row.kind as Document["kind"]` (line 116) — no runtime validity check needed (the column is fully controlled by `createReservation`'s input type):

```ts
export function dbReservationToType(row: typeof reservations.$inferSelect): Reservation {
  return {
    id: row.id,
    tripId: row.tripId,
    type: row.type as ReservationType,
    provider: row.provider,
    startAt: row.startAt?.toISOString() ?? undefined,
    endAt: row.endAt?.toISOString() ?? undefined,
    confirmationCode: row.confirmationCode ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.createdAt?.toISOString() ?? undefined,
    updatedAt: row.updatedAt?.toISOString() ?? undefined,
  };
}
```

Add `reservations` to the `@/db/schema` import list and `Reservation`, `ReservationType` to the `@/data/types` import list at the top of the file.

### Query layer (Task 4) — `src/lib/queries.ts`

In `getTripDetail()` (starts at line 214), add a query alongside the existing `tripDocs`/`tripCollaborators` queries:

```ts
const tripReservations = await db.select().from(reservations).where(eq(reservations.tripId, tripId));
```

Map with `dbReservationToType()` and include `reservations: tripReservations.map(dbReservationToType)` in the returned object. Add `reservations` to the `@/db/schema` import and `dbReservationToType` to the `@/lib/db-mappers` import at the top of the file.

### `createReservation` action (Task 5) — new file `src/app/(app)/trips/[tripId]/reservations/actions.ts`

This is a **new, separate** server-actions file (per Additional Requirements — not appended to the existing `src/app/(app)/trips/[tripId]/actions.ts`). Closest existing pattern is `addDocument()` in `actions.ts` — a simple trip-scoped insert with no day/position logic:

```ts
"use server";

import { requireUser, assertTripAccess } from "@/lib/auth-helpers";
import { db } from "@/db";
import { reservations } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { ReservationType, type CreateReservationInput } from "@/data/types";

const REQUIRES_END_AT: ReservationType[] = [ReservationType.Lodging, ReservationType.RentalCar, ReservationType.Cruise];

export async function createReservation(tripId: string, input: CreateReservationInput): Promise<void> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");

  if (REQUIRES_END_AT.includes(input.type) && !input.endAt) {
    throw new Error("An end date and time is required for this reservation type.");
  }

  await db.insert(reservations).values({
    tripId,
    type: input.type,
    provider: input.provider,
    startAt: input.startAt ? new Date(input.startAt) : undefined,
    endAt: input.endAt ? new Date(input.endAt) : undefined,
    confirmationCode: input.confirmationCode,
    notes: input.notes,
  });

  revalidatePath(`/trips/${tripId}`);
}
```

Per Additional Requirements: return `Promise<void>`, throw `Error("<user-facing message>")` on failure — **no `{ success, error }` wrapper**. The drawer's primary `endAt` validation (AC4 — blocking Save client-side with `aria-invalid` + focus) should happen **before** calling this action; the server-side check above is defense-in-depth, not the primary UX (a thrown error here should surface as a generic save-failure toast, not the focus-management behavior).

For the action test (`actions.test.ts`), mirror the existing mocking pattern in `src/app/(app)/trips/[tripId]/actions.test.ts`: `vi.hoisted()` for `mockRequireUser`/`mockAssertTripAccess`/`mockDbInsert`/`mockRevalidatePath`, `vi.mock("@/db/schema", () => ({ reservations: {} }))`, `vi.mock("@/lib/auth-helpers", ...)`, `vi.mock("@/db", ...)`, `vi.mock("next/cache", ...)`. Assert `mockAssertTripAccess` is called with `(tripId, "user-1", "editor")`.

### Reservation Type → icon map (Task 6) — `src/components/packt/reservation-type-badge.tsx`

Per UX-DR1, this is the **single centralized source** for the icon mapping, imported by both the type picker (Task 7) and the drawer header (Task 8), and later by the accordion header (Story 1.2) and Linked Event rows (Epic 2). All icons from `lucide-react`, all `strokeWidth={1.5}`:

| `ReservationType` value | Display name | Icon |
| --- | --- | --- |
| `flight` | Flight | `Plane` |
| `train` | Train | `Train` |
| `bus` | Bus | `Bus` |
| `ferry` | Ferry | `Ship` |
| `rental-car` | Rental Car | `Car` |
| `lodging` | Lodging | `Hotel` |
| `cruise` | Cruise | `Anchor` |
| `other` | Other | `Package` |

Note: `Anchor` is used for Cruise specifically (not `Ship`, which is Ferry's icon) to disambiguate the two. `Package` is unique to Other.

Export something like:

```ts
export const RESERVATION_TYPE_META: Record<ReservationType, { label: string; icon: LucideIcon }> = {
  flight: { label: "Flight", icon: Plane },
  train: { label: "Train", icon: Train },
  bus: { label: "Bus", icon: Bus },
  ferry: { label: "Ferry", icon: Ship },
  "rental-car": { label: "Rental Car", icon: Car },
  lodging: { label: "Lodging", icon: Hotel },
  cruise: { label: "Cruise", icon: Anchor },
  other: { label: "Other", icon: Package },
};
```

(Naming/shape is a suggestion — keep it a single exported map so Story 1.2/Epic 2 can import it unchanged.)

### Reservation Type picker (Task 7) — `src/components/packt/reservation-type-picker.tsx`

Use `DropdownMenu`/`DropdownMenuTrigger`/`DropdownMenuContent`/`DropdownMenuItem` from `@/components/ui/dropdown-menu` — same primitives as `now-card.tsx`'s overflow menu (lines 69–107 of that file):

```tsx
"use client";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { ReservationType } from "@/data/types";
import { RESERVATION_TYPE_META } from "./reservation-type-badge";

export interface ReservationTypePickerProps {
  onSelectType: (type: ReservationType) => void;
}

export function ReservationTypePicker({ onSelectType }: ReservationTypePickerProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>
          <Plus strokeWidth={1.5} />
          Add Reservation
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="end">
        {Object.values(ReservationType).map((type) => {
          const { label, icon: Icon } = RESERVATION_TYPE_META[type];
          return (
            <DropdownMenuItem key={type} onClick={() => onSelectType(type)}>
              <Icon size={13} strokeWidth={1.5} aria-hidden="true" />
              {label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

Check `@/components/ui/button`'s `Button` for `asChild`/trigger-composition support before assuming the exact wiring — `now-card.tsx`'s trigger is a plain styled element (`DropdownMenuTrigger` rendered directly with `className`), not a `Button` wrapped via `asChild`. Match whichever pattern `dropdown-menu.tsx`'s `DropdownMenuTrigger` actually supports; the `h-10`/default-size `Button` styling is the AC11 requirement (UX-DR11 — "Add Reservation" button is `h-10`), not the specific composition mechanism.

### Add Reservation drawer (Task 8) — `src/components/packt/reservation-edit-drawer.tsx` + `reservation-anchor-fieldset.tsx`

Both files are `"use client"` (event handlers, `useState`, focus management). `reservation-edit-drawer.tsx` defines an explicit `ReservationEditDrawerProps` interface (e.g. `{ tripId: string; type: ReservationType; open: boolean; onOpenChange: (open: boolean) => void }`).

Follow `trip-edit-sheet.tsx`'s `Drawer`/`DrawerContent`/`DrawerHeader`/`DrawerFooter` structure (`direction="right"`, `className="flex flex-col p-0 rounded-none"` on `DrawerContent`, controlled `open`/`onOpenChange`). This story implements **Add mode only** — props should still be designed so Story 1.3 can add an `Edit` mode without a rewrite (e.g. accept `mode: "add"` for now, or just build for add and let 1.3 extend).

**Size — extract the anchor fieldset.** `trip-edit-sheet.tsx` (the closest template) is already 297 lines with a simpler field set; this drawer adds a Provider field, two date/time anchor fieldsets, confirmation code, notes, and a Documents placeholder, which would push it well past the ~250-line limit. Extract the repeated start/end anchor markup (fieldset + legend + `DatePicker` + `TimePicker`, with `aria-label`/`aria-invalid`/error wiring) into `reservation-anchor-fieldset.tsx` with an explicit `ReservationAnchorFieldsetProps` interface (e.g. `{ legend: string; required: boolean; date, time, onDateChange, onTimeChange, error? }`), and render it twice from the drawer (once for the start anchor, once for the end anchor).

**Focus management** (drawer open/close — Base UI's `Drawer` primitive handles the focus trap, but the plan must confirm the behavior): on open, focus moves to the first focusable field in the drawer (the Provider input); on close (Cancel, Escape, or successful Save), focus returns to the "Add Reservation" trigger button that opened it. This is in addition to the AC4 validation-focus behavior (focus moves to the invalid end-anchor field on a failed Save).

**Anchor label table** (UX-DR4 / PRD Glossary §3) — this is the field-label lookup the drawer must use per `ReservationType`:

| `ReservationType` | Start label | End label | `endAt` required? |
| --- | --- | --- | --- |
| `flight`, `train`, `bus`, `ferry` | Departure | Arrival | No (optional) |
| `rental-car` | Pickup | Return | **Yes** |
| `lodging` | Check-in | Check-out | **Yes** |
| `cruise` | Departure | Return | **Yes** |
| `other` | Start | End | No (optional) |

**Header**: `32px`×`32px` rounded icon swatch using the selected type's icon from `RESERVATION_TYPE_META` (Task 6) + `DrawerTitle` "Add {Label} Reservation" (e.g. "Add Lodging Reservation", "Add Other Reservation") + subtitle "Type: {Label} (cannot be changed after saving)".

**Body** (`16px 20px 24px` padding, `18px` field gap, scrollable, use `Section`/`Field` from `@/components/packt/form-section` for layout/label styling):

1. **Provider*** — `Input` (`h-9`), required, `*` in label text rendered in `var(--accent-brand)`, `aria-required="true"`.
2. **Start anchor** — a `ReservationAnchorFieldset` instance (`<fieldset>` with `<legend>`/`aria-labelledby` = the start label, e.g. "Departure"): a date input (`DatePicker` from `@/components/ui/date-picker`) + time input (`TimePicker` from `@/components/ui/time-picker`) side by side, each needing an `aria-label` (e.g. "Departure date", "Departure time"). **Known gap**: neither `DatePickerProps` nor `TimePickerProps` currently accepts `aria-label`/`aria-invalid` — extend both interfaces with optional `"aria-label"?: string` and `"aria-invalid"?: boolean` and forward to the underlying `PopoverTrigger` (`DatePicker`) / `Input` (`TimePicker`). This is a small additive change to two existing `src/components/ui/**` files (excluded from coverage).
3. **End anchor** — a second `ReservationAnchorFieldset` instance, using the end label. Required (`*` in `var(--accent-brand)`, `aria-required="true"`) for Lodging/Rental Car/Cruise; "Optional" suffix for the other 5 types. On Save with `endAt` empty for a required type: set `aria-invalid="true"` on the end-anchor fieldset's inputs, show an inline error via `Field`'s `error` prop (`form-section.tsx` already supports `error`/`htmlFor` → renders an `aria-live="polite"` error message), and call `.focus()` on the end-anchor's first input. Do **not** call `createReservation` in this case.
4. **Confirmation code** (Optional) — `Input`.
5. **Notes** (Optional) — `Textarea`, `72px` min-height.
6. **Documents section** — placeholder only (scope boundary above): render the `Empty`/`EmptyHeader`/`EmptyMedia(variant="icon")`/`EmptyTitle`("No documents yet")/`EmptyDescription` composition from `@/components/ui/empty` (same as `trip-docs-tab.tsx` lines 73–104), with **no** working "Add document" affordance (omit the upload button/input, or render it disabled — Story 1.5 wires it up).

**Footer**: `1px solid var(--line)` top border, `14px 20px` padding, right-aligned ghost "Cancel" + primary "Save" — identical structure to `trip-edit-sheet.tsx`'s `DrawerFooter` (lines 164–263 region).

**Save handler**: validate `endAt` per the table above → if invalid, set focus/aria-invalid as described and return early → otherwise call `createReservation(tripId, { type, provider, startAt, endAt, confirmationCode, notes })`, on success close the drawer (parent's `onClose`/state reset), on failure show a `sonner` `toast.error(...)`.

### `ReservationsTab` + wiring (Task 9)

`src/components/packt/reservations-tab.tsx` is a `"use client"` component, props `{ tripId: string; reservations: Reservation[] }`. For this story:

- Render the Task 7 `ReservationTypePicker` ("Add Reservation").
- Local `useState` for `selectedType: ReservationType | null` and drawer-open boolean — set both when a type is picked from the picker, render the Task 8 drawer controlled by these.
- Render `reservations` grouped by `type` in a minimal list (e.g. one heading per type that has ≥1 reservation, rows showing `provider` + formatted `startAt`/`endAt`) — just enough for AC6/AC9 ("new Reservation appears as a row in its type's accordion section"). Story 1.2 replaces this with the full UX-DR2 accordion.
- If `reservations.length === 0`, the FR-6 empty state (`Empty` composition, "No reservations yet") is **in scope for Story 1.2**, not this story — a simple "No reservations yet." text placeholder is acceptable here if needed, but don't over-invest in it.

Wiring (mirrors the `"docs"` tab pattern in `trip-detail-tab-body.tsx` lines 170–172 — closest analog, trip-scoped tab component taking `tripId`):

- `trip-detail-tabs.ts`: `resolveTripDetailTab()`'s switch (lines 17–29) gains `case TripDetailTab.Reservations:` alongside the other non-default cases.
- `trip-detail-tab-body.tsx`: `TripDetailTabBodyProps` gains `reservations: Reservation[]`; render block gains `{activeTab === "res" && <ReservationsTab tripId={tripId} reservations={reservations} />}`.
- `page-client.tsx`: `TABS` array (lines 23–29) gains `{ id: "res", label: "Reservations" }`; destructure `reservations` from `detail` (line 59) and pass through to `TripDetailTabBody`.

### Reservation Object Mother (Task 10)

In `tests/e2e/e2e-seed-data.ts`, add next to `DocumentSeed`/`EventSeed` (lines 35–50):

```ts
export interface ReservationSeed {
  type: string;
  provider: string;
  startAt?: string | null;
  endAt?: string | null;
  confirmationCode?: string | null;
  notes?: string | null;
}
```

Add `reservations: ReservationSeed[]` to `TripMother` (lines 89–97) and `reservations?: ReservationSeed[]` to `TripMotherOverrides` (lines 117–125). Add `reservations: []` to each of `THREE_DAY_TRIP_MOTHER`, `DATELESS_TRIP_MOTHER`, `DELETE_TRIP_MOTHER` (lines 161–211). In `cloneTripMother()` (lines 416–433), add the merge line:

```ts
reservations: overrides.reservations ? cloneValue(overrides.reservations) : base.reservations,
```

Add an `E2E_RESERVATION` constant near `E2E_DOCUMENT` (line 220) for the Story 1.1 E2E scenario:

```ts
export const E2E_RESERVATION = {
  type: "lodging",
  provider: "E2E Hotel Reservation",
  startAt: "2026-07-01T15:00:00Z",
  endAt: "2026-07-03T11:00:00Z",
  confirmationCode: "E2E-CONF-123",
} as const;
```

In `tests/e2e/scenario-fixture.ts`, add `reservations` to the schema import (line ~5–20), and add an insertion loop in `createTrip()` alongside the `documents` loop (lines 297–306):

```ts
for (const reservationSeed of seed.reservations) {
  await db.insert(reservations).values({
    tripId: trip.id,
    type: reservationSeed.type,
    provider: reservationSeed.provider,
    startAt: reservationSeed.startAt ? new Date(reservationSeed.startAt) : null,
    endAt: reservationSeed.endAt ? new Date(reservationSeed.endAt) : null,
    confirmationCode: reservationSeed.confirmationCode ?? null,
    notes: reservationSeed.notes ?? null,
  });
}
```

`registerCleanup({ entity: "trip", id: trip.id })` (line 363) already covers cascade cleanup since `reservations.tripId` references `trips.id` with `onDelete: "cascade"`.

### E2E scenario (Task 11)

New `tests/e2e/features/reservations.feature` — follow the existing `.feature`/step-definition conventions (see `tests/e2e/features/trips.feature` + corresponding steps for structure/tagging conventions). Scenario: create a trip (e.g. `cloneTripMother("threeDayTrip")` with no reservations override, or with `E2E_RESERVATION` pre-seeded if the scenario is "view an existing reservation" — but AC12 specifically wants an **add** flow, so seed a plain trip and add the Lodging reservation via the UI):

1. Navigate to the trip's Reservations tab.
2. Click "Add Reservation" → click "Lodging" in the type picker.
3. Fill Provider, Check-in (date + time), Check-out (date + time, required for Lodging), optionally Confirmation code.
4. Click Save.
5. Assert the new row appears under a Lodging section/group with the entered provider name.

New `tests/e2e/steps/reservations.steps.ts` with the corresponding step definitions, following the patterns in `tests/e2e/steps/documents.steps.ts`/`event-docs.steps.ts` for trip setup + page interaction conventions.

### Testing standards summary (NFR2/NFR3)

- Coverage ≥95% lines/functions, ≥90% branches on `src/lib/**` and `src/components/packt/**` — applies to every new file in Task 3, 5–9.
- `src/components/ui/**` (Task 8's `DatePicker`/`TimePicker` extensions) is excluded from coverage, but still add/extend their existing `.test.tsx` files if you touch their props/behavior.
- Action tests (`actions.test.ts`) run with `// @vitest-environment node` and mock `@/lib/auth-helpers`, `@/db`, `@/db/schema`, `next/cache` per the existing pattern in `src/app/(app)/trips/[tripId]/actions.test.ts`.
- Component tests use Vitest + `@testing-library/react` + `userEvent`; mock `@/components/ui/drawer` similarly to how `add-doc-dialog.test.tsx` mocks `@/components/ui/dialog` (render children directly, expose an `onOpenChange` escape hatch) if the real `Drawer` is awkward in jsdom.
- E2E (`tests/e2e/`) uses `playwright-bdd`; the E2E DB (`packt_e2e`) is wiped/reseeded by `global-setup.ts` before each run — the new scenario must create its own trip/reservation via the Object Mother, not rely on global seed data.

## Project Structure Notes

- New files: `src/app/(app)/trips/[tripId]/reservations/actions.ts` (+ `.test.ts`), `src/components/packt/reservation-type-badge.tsx` (+ `.test.tsx`), `src/components/packt/reservation-type-picker.tsx` (+ `.test.tsx`), `src/components/packt/reservation-anchor-fieldset.tsx` (+ `.test.tsx`), `src/components/packt/reservation-edit-drawer.tsx` (+ `.test.tsx`), `src/components/packt/reservations-tab.tsx` (+ `.test.tsx`), `tests/e2e/features/reservations.feature`, `tests/e2e/steps/reservations.steps.ts`.
- Modified files: `src/db/schema.ts`, `src/data/types.ts`, `src/lib/db-mappers.ts` (+ `.test.ts`), `src/lib/queries.ts`, `src/app/(app)/trips/[tripId]/trip-detail-tabs.ts`, `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx`, `src/app/(app)/trips/[tripId]/page-client.tsx`, `src/components/ui/date-picker.tsx`, `src/components/ui/time-picker.tsx`, `tests/e2e/e2e-seed-data.ts`, `tests/e2e/scenario-fixture.ts`.
- No conflicts with the project's unified structure — all new files follow the existing `src/components/packt/`, `src/app/(app)/trips/[tripId]/<feature>/actions.ts`, and `tests/e2e/` conventions documented in `AGENTS.md`.

### References

- [Source: _bmad-output/epics.md#Story 1.1: Add a Reservation] — full AC text, FR1/FR6/FR7 (partial)
- [Source: _bmad-output/epics.md#Additional Requirements] — `reservations` table shape, `ReservationType` union, `dbReservationToType()`, new actions file, `TripDetailTab` wiring
- [Source: _bmad-output/prds/prd-packt-2026-06-12/prd.md#3. Glossary] — anchor label pairs per Reservation Type
- [Source: _bmad-output/ux-designs/ux-packt-2026-06-13/DESIGN.md] — UX-DR1 (icon mapping), UX-DR4 (drawer layout/fields)
- [Source: src/db/schema.ts#events] — modeling template for `reservations` table
- [Source: src/app/(app)/trips/[tripId]/actions.ts#addDocument] — modeling template for `createReservation`
- [Source: src/lib/db-mappers.ts#dbEventToType, dbDocToType] — modeling template for `dbReservationToType()`
- [Source: src/components/packt/trip-edit-sheet.tsx] — Drawer structure template
- [Source: src/components/packt/now-card.tsx#DropdownMenu usage] — type picker template
- [Source: tests/e2e/e2e-seed-data.ts, tests/e2e/scenario-fixture.ts] — Object Mother pattern

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
