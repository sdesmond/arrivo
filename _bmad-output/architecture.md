---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad-output/prds/prd-packt-2026-06-12/prd.md
  - _bmad-output/ux-designs/ux-packt-2026-06-13/DESIGN.md
  - _bmad-output/ux-designs/ux-packt-2026-06-13/EXPERIENCE.md
  - _bmad-output/project-context.md
workflowType: "architecture"
project_name: "Packt"
user_name: "Spencer"
date: "2026-06-13"
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**

13 FRs across 3 features, all from `_bmad-output/prds/prd-packt-2026-06-12/prd.md` (status: final):

- **Reservations Tab (FR-1–FR-6)**: CRUD for a new `Reservation` entity (type, startTime, endTime?, provider, confirmationCode?, notes?), grouped-by-type accordion UI, document attachments via `Document.scope = "reservation"`, empty state.
- **Itinerary Integration (FR-7–FR-11)**: Reservations project 1–2 computed "Linked Events" onto the Itinerary (Check-in/Check-out, Pickup/Return, Departure/Arrival/Return per type); Reservations can extend the trip's date range and trigger Day re-numbering (FR-8); Now Card surfaces Linked Events (FR-10); tapping a Linked Event redirects to the Reservations tab (FR-11, no inline edit).
- **Cover Overflow Menu (FR-12–FR-13)**: new "⋯" menu on `trip-hero.tsx` (Edit Cover / Remove Cover / Info, conditional on `CoverType`), reusing `now-card.tsx`'s overflow pattern; cover controls removed from `trip-edit-sheet.tsx` / `trip-edit-cover.tsx`.

**Non-Functional Requirements:**

- WCAG AA accessibility floor (inherited Packt standard, extended with specific aria patterns in `EXPERIENCE.md`'s Accessibility Floor — accordion accessible names, click-to-edit keyboard support, paired date/time fieldsets, Linked Event row labeling).
- Existing coverage thresholds (≥95% lines/functions, ≥90% branches on `src/lib/**` and `src/components/packt/**`) and existing testing pyramid (Vitest unit + Playwright-BDD E2E) apply unchanged.
- No new performance, offline, or real-time requirements — Reservations/Linked Events are server-rendered/revalidated like existing trip data, no live sync needed.

**Scale & Complexity:**

- Primary domain: full-stack web (Next.js App Router, Postgres/Drizzle, Auth.js v5), responsive (mobile tab bar / desktop top tabs — no new shell).
- Complexity level: medium — additive to an established, convention-heavy codebase; the architectural novelty is concentrated in Linked Event derivation and date-range extension, not in stack selection.
- Estimated architectural components: 1 new DB table (`reservations`) + 1 schema extension (`documents.scope`), 1 derivation module (Linked Events), ~6–8 new/modified UI components (Reservations tab, accordion, Reservation row, Add/Edit drawer, Linked Event row, FR-9 CTA row, Cover Overflow Menu), and the corresponding server actions/mappers/tests for each.

### Technical Constraints & Dependencies

- All domain types added to `src/data/types.ts`; enums as const-object + union type per existing convention.
- New Drizzle table follows existing schema conventions (`uuid().primaryKey().default(sql\`gen_random_uuid()\`)`, FK to `trips`).
- `dbReservationToType()` mapper added to `src/lib/db-mappers.ts`; `documents` mapper updated for the new scope.
- Server actions live alongside their route (likely `src/app/(app)/trips/[tripId]/actions.ts` or a new reservations-scoped actions file), each calling `requireUser()` → `assertTripAccess()` → `revalidatePath()`.
- Vercel Blob `del()`-before-cascade rule applies to Reservation deletion cascading to its Documents (FR-5).
- UI built entirely from existing shadcn/Base UI primitives and Packt design tokens — DESIGN.md confirms zero new tokens/components needed.
- `getNow()`/`useNow()` conventions apply to any "next-upcoming" / "happening now" computations involving Linked Events.

### Cross-Cutting Concerns Identified

- **Document scope extension** — `"reservation"` scope touches schema, mappers, upload/delete actions, and cascade-delete across Reservation deletion.
- **Linked Event derivation** — a single shared computation (Reservation → 1–2 virtual Itinerary entries) must be consumed consistently by the Itinerary day rendering, the Now Card, and the Reservations-tab redirect target (FR-7, FR-10, FR-11) — needs one architectural home, not three reimplementations.
- **Itinerary date-range extension & Day renumbering (FR-8)** — must integrate with however Days/dates are currently derived from `trip.startDate`/`endDate`, without breaking `getTripStatus()`'s date-driven status computation.
- **New tab integration** — `TripDetailTab` gains a Reservations tab following the existing Itinerary/Map/Documents/Packing/Notes tab-shell pattern, no new navigation primitive.
- **Cover Overflow Menu** — net-new but low-risk; directly reuses `now-card.tsx`'s `MoreHorizontal`/`DropdownMenu` pattern and existing `CoverImagePicker`/attribution dialogs.

## Starter Template Evaluation

### Primary Technology Domain

Full-stack web (Next.js App Router) — not applicable for a fresh starter evaluation.

### Starter Options Considered

N/A. Packt is an existing, established codebase with its full stack, conventions, and tooling already in place (Next.js 16.2.4, React 19.2.4, TypeScript strict, Tailwind v4, @base-ui/react + shadcn, Drizzle ORM + PostgreSQL, Auth.js v5, Vitest, Playwright-BDD — see `_bmad-output/project-context.md`). The Reservations & Trip Logistics feature is additive: new schema, mappers, server actions, and components built within this existing architecture.

### Selected Starter: None — extending existing project

**Rationale for Selection:**

No starter template applies. All architectural decisions in this document build on Packt's current structure (`src/db/schema.ts`, `src/lib/db-mappers.ts`, `src/lib/queries.ts`, `src/app/(app)/trips/[tripId]/`, `src/components/packt/`, `src/components/ui/`) and conventions (enums as const objects, `requireUser()`/`assertTripAccess()`/`revalidatePath()` server-action pattern, colocated tests, etc.).

**Note:** No project initialization story is needed. The first implementation story is the schema/mapper work for the new `Reservation` entity and `Document.scope` extension.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**

- `reservations` table schema (Data Architecture #1)
- `documents.scope` extension to include `"reservation"` (Data Architecture #2)
- Linked Events computed at query time, not persisted (Data Architecture #3)
- FR-8 date-range extension via real `days` row inserts + `dayNumber` shift (Data Architecture #4)

**Important Decisions (Shape Architecture):**

- FR-9/FR-11 cross-tab orchestration via URL search params (Frontend Architecture)

**Deferred Decisions (Post-MVP):**

- None — all categories not listed below (Auth, API style, Infrastructure) are fully inherited from the existing architecture and require no new decisions.

### Data Architecture

**1. `reservations` table** — new table in `src/db/schema.ts`, modeled on `events`:

```ts
export const reservations = pgTable("reservations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tripId: uuid("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // ReservationType union
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }),
  provider: text("provider").notNull(),
  confirmationCode: text("confirmation_code"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
});
```

- `ReservationType` added to `src/data/types.ts` as a const-object + union (`Flight | Train | Bus | Ferry | RentalCar | Lodging | Cruise`), per the project's enum convention.
- `endAt` is nullable at the schema level; the FR-1 "required for Lodging/Rental Car/Cruise" rule is enforced in the drawer (client validation, `aria-required`) and re-validated in the server action — not a DB constraint, since requiredness is type-dependent.
- No `position` field — Reservations are sorted by `startAt` (FR-2), never manually reordered.
- `Reservation` domain type added to `src/data/types.ts`; `dbReservationToType()` added to `src/lib/db-mappers.ts`.

**2. `documents.scope` extension**

- `documents` table gains a nullable `reservationId` column: `uuid("reservation_id").references(() => reservations.id, { onDelete: "cascade" })`, alongside the existing nullable `tripId`/`eventId`.
- `Document["scope"]` union becomes `"trip" | "event" | "reservation"`.
- `dbDocToType()`'s orphan check extends to all three FKs: exactly one of `tripId`/`eventId`/`reservationId` must be set; the scope is derived from which one is non-null.
- Deleting a Reservation cascades to its Documents at the DB level (`onDelete: "cascade"`); the existing Vercel Blob `del()`-before-cascade rule applies — the delete action must `del()` each attached Document's blob URL before the Reservation row is removed.

**3. Linked Events — computed, not persisted**

- New pure module `src/lib/linked-events.ts`: exports a function (e.g. `deriveLinkedEvents(reservations: Reservation[]): TripEvent[]`) that, for each Reservation, produces 1–2 synthetic `TripEvent`-shaped objects per the Glossary's anchor labels (Check-in/Check-out, Pickup/Return, Departure/Arrival, Departure/Return).
- Each synthetic event carries two extra optional fields on `TripEvent`: `linkedReservationId?: string` and `reservationType?: ReservationType` — the single marker pair that `DayCard`/`NowCard`/Itinerary rows use to render the Reservation-Type icon + "Linked" badge (FR-7) instead of `MapPin`.
- The trip-detail query layer (`src/lib/queries.ts`, wherever `TripDetailPayload`/`DayItinerary[]` is assembled) merges these synthetic events into each `DayItinerary.events` array — interleaved with real events and sorted by `startAt` — and into the Now Card's `todayEvents`. No new `events` rows are written.
- Tapping a Linked Event (FR-11) reads `linkedReservationId` to navigate to the Reservations tab with that Reservation highlighted (see Frontend Architecture below) — no inline edit path exists for synthetic events.

**4. FR-8 date-range extension — real `days` row inserts**

- `days` remains the persisted, editable-content table it is today (label/subtitle/weather/travelSummary per day, `unique(tripId, dayNumber)`).
- The Reservation create/edit server action, after computing the Reservation's date span, checks it against `trip.startDate`/`endDate`. If the span extends beyond either boundary, the action — in the same transaction as the Reservation write —:
  1. Inserts a new `days` row for each newly-covered date, with a placeholder `label` (e.g. derived weekday/date, matching how Days are labeled elsewhere) and `dayNumber` values that fit before/after the existing range.
  2. Shifts `dayNumber` for all existing days that now fall after the inserted day(s) (e.g. +1 per day inserted at the front).
  3. Updates `trip.startDate`/`endDate` to the new extended range.
- This is the only feature area touching the `days` table; `events`/`itineraryNotes`/`itineraryChecklists` (keyed by `dayId`, not `dayNumber`) are unaffected by the renumbering.

### Authentication & Security

No new decisions — Reservation CRUD and Document-scope="reservation" operations follow the existing `requireUser()` → `assertTripAccess(tripId, "editor")` → mutate → `revalidatePath(\`/trips/\${tripId}\`)` pattern used by event/document actions.

### API & Communication Patterns

- New server actions colocated with the Reservations feature, e.g. `src/app/(app)/trips/[tripId]/reservations/actions.ts`: `createReservation`, `updateReservation`, `deleteReservation`, plus reuse of the existing document upload/delete actions with `scope: "reservation"`.
- No new API design pattern — Server Actions only, consistent with the rest of the app. No REST/GraphQL endpoints introduced.

### Frontend Architecture

- **Reservations tab**: new `page.tsx` (server, data fetch) / `page-client.tsx` (client, `"use client"`) pair under the trip detail route, following the existing Itinerary/Documents tab split. `TripDetailTab` gains a `Reservations: "res"` (or similar) value.
- **FR-9/FR-11 cross-tab orchestration**: navigation to the Reservations tab carries intent via URL search params — e.g. `?tab=res&action=add` (FR-9: auto-open the FR-1 type-picker on mount, focus first item) or `?tab=res&highlight={reservationId}` (FR-11: scroll to and expand the accordion section containing that Reservation, highlight its row). The Reservations tab's client component reads these params on mount, performs the sequenced behavior (navigate settles → then open/scroll, per the `aria-live` sequencing in `EXPERIENCE.md`), and clears the param from the URL afterward so back/refresh doesn't re-trigger it.
- **Add/Edit Reservation drawer**: client component state (`Drawer` open/closed, selected `ReservationType`, edit-vs-add mode) lives in the Reservations tab's client component, matching how `trip-edit-sheet.tsx` is invoked today.
- **Accordion state**: expand/collapse per Reservation Type section is local client state (not persisted), matching `DayCard`'s existing expand/collapse pattern.

### Infrastructure & Deployment

No new decisions — existing Vercel deployment, `drizzle-kit` migrations (`npm run db:migrate:e2e` re-run after schema changes per `CLAUDE.md`), and CI pipeline apply unchanged.

### Decision Impact Analysis

**Implementation Sequence:**

1. Schema: add `reservations` table, extend `documents` with `reservationId`, add `ReservationType`/`Reservation` types, extend `Document["scope"]`.
2. Mappers: `dbReservationToType()`, extend `dbDocToType()`'s orphan/scope logic.
3. `src/lib/linked-events.ts` derivation module (pure, unit-testable in isolation).
4. Server actions: Reservation CRUD + document attach/detach with `scope: "reservation"`, including the FR-8 transactional day-extension logic.
5. Query layer: merge synthetic Linked Events into `DayItinerary.events` / `todayEvents` in the trip-detail data fetch.
6. UI: Reservations tab (empty state → accordion → row → drawer), FR-9 CTA row, Linked Event row treatment on `DayCard`/`NowCard`, Cover Overflow Menu (independent, can be built in parallel).

**Cross-Component Dependencies:**

- The `linked-events.ts` marker fields (`linkedReservationId`, `reservationType`) are the single contract between the derivation module, the query-layer merge, and every UI component that renders a `TripEvent` (`DayCard`, `NowCard`, Itinerary row) — get this shape right first, since steps 5–6 both depend on it.
- FR-8's `days` mutation must complete before the query layer re-fetches `DayItinerary[]`, since newly-inserted/renumbered days affect which day each Linked Event merges into.
- The Cover Overflow Menu (FR-12/FR-13) has no dependency on the Reservations work and can proceed independently.
