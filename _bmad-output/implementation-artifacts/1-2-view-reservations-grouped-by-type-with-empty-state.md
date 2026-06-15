---
baseline_commit: ac3675d50ee5451154e7260efc4f38c6a945edcf
---

# Story 1.2: View Reservations Grouped by Type, with Empty State

Status: review

## Story

As a trip planner,
I want to see all my Reservations organized by type, with quick previews, and a helpful empty state when I haven't added any yet,
so that I can quickly scan "what hotels do I have" or "what's my rental car situation" without hunting through a flat list.

## Acceptance Criteria

1. **Empty state (FR-6/UX-DR8)** — When the trip has zero Reservations, the Reservations tab renders the `Empty`/`EmptyHeader`/`EmptyMedia(variant="icon")`/`EmptyTitle`/`EmptyDescription`/`EmptyContent` composition (`EmptyTitle` = "No reservations yet", `EmptyDescription` inviting Flight/Lodging/Rental Car/etc., `EmptyContent` holding the existing FR-1 "Add Reservation" type-picker `DropdownMenu` — no separate empty-state-specific add flow), and **no** per-type accordion sections render. The standalone "Reservations" title + "Add Reservation" header row from Story 1.1 is hidden in this state (the picker lives inside `EmptyContent` instead, so there is only one "Add Reservation" entry point on screen).
2. **Per-type accordion sections (UX-DR2)** — For each `ReservationType` with ≥1 Reservation, render one accordion section: `rounded-[14px]` container, `1px solid var(--line)` border, `var(--bg)` background, `12px` bottom margin, `overflow: hidden`. Types with zero Reservations render no section at all (not a collapsed/empty one).
3. **Collapsed header content (UX-DR2)** — The header (`12px 16px` padding, `var(--surface)` background, clickable, `border-bottom: none` while collapsed) shows the type's icon + label (`card-title`) on the left, and on the right an `aria-hidden` count-badge pill (`22px` height, `11px`/weight 600 text) plus a `ChevronDown` (`aria-hidden`, rotates 180° when open). Below the header, while collapsed, a single-line preview reads "Next: **{provider}** · {weekday}, {month} {day} · {time}" in `var(--fg-2)`, derived from that type's *next-upcoming* Reservation (see Dev Notes for the exact definition and edge cases).
4. **Expand behavior + row ordering (UX-DR2/UX-DR3 subset)** — Tapping a header toggles `open`: the chevron rotates 180°, a `1px solid var(--line)` border appears between header and body, and the preview line is replaced by every Reservation of that type rendered as a static row (`14px 16px` padding, `1px solid var(--line)` bottom border omitted on the last row), ordered by `startAt` ascending (Reservations without `startAt` sort after all dated ones, in their existing order). Each row shows: provider name (`card-title`, 15px/weight 600), one or two anchor lines (label `var(--fg-3)` fixed `68px` min-width + value `var(--fg-2)`, both 13px, format "Tue, Jun 16 · 3:00 PM", using the type's `ANCHOR_LABELS` start/end labels), and — if `confirmationCode` is set — a confirmation-code chip (`var(--surface-2)` background, mono font, `aria-hidden` `Wallet` icon). Click-to-edit (Story 1.3), document rows (Story 1.5), and inline confirmation-document affordances are **out of scope** — rows are static/read-only in this story.
5. **Cross-section ordering (UX-DR2)** — When Reservations exist across multiple types, populated accordion sections are ordered by each type's next-upcoming Reservation's `startAt` (soonest first, see Dev Notes for the full ordering algorithm including the "all reservations of this type are in the past" and "no reservation of this type has a startAt" cases), and re-sort live (on every render, driven by `reservations` prop + `useNow()`) as Reservations are added, edited, or deleted.
6. **Accessible name (UX-DR12)** — Every accordion header's accessible name is `"{Type label}, {count} reservation{s}, {expanded|collapsed}"` (e.g. "Lodging, 1 reservation, collapsed" / "Flight, 3 reservations, expanded"), with the count badge and `ChevronDown` marked `aria-hidden="true"` so they are not announced separately.
7. **Object Mother reuse** — Tests use the Story 1.1 Reservation Object Mother (`ReservationSeed`/`E2E_RESERVATION`/`cloneTripMother(..., { reservations: [...] })`) with overrides (varying `type`/`startAt`) to materialize multiple Reservations across types for empty/populated/sorting scenarios — no ad hoc fixtures.
8. **Unit/component tests** — `reservations-tab.test.tsx` covers the empty state and the populated multi-section accordion list (including cross-section ordering); `reservation-type-section.test.tsx` covers collapse/expand, preview text, within-section chronological ordering, and the accessible-name format (including pluralization and expanded/collapsed states).
9. **E2E** — `tests/e2e/features/reservations.feature` gains two scenarios: (1) a trip with zero Reservations shows the FR-6 empty state and no accordion sections, and (2) a trip with Reservations across multiple types (seeded via Object Mother overrides) renders one accordion per populated type, ordered soonest-first by next-upcoming `startAt`, with the existing "appears in the {type} section" step rewritten to assert against the new accordion header (not a plain heading).

## Tasks / Subtasks

- [x] **Task 1: Extract `ANCHOR_LABELS` into the shared type-badge module** (AC: 4)
  - [x] Move the `ANCHOR_LABELS: Record<ReservationType, { start: string; end: string }>` map (and, if desired, the `REQUIRES_END_AT` list — see Dev Notes) out of `reservation-edit-drawer.tsx` into `reservation-type-badge.tsx`, exported alongside `RESERVATION_TYPE_META`
  - [x] Update `reservation-edit-drawer.tsx` to import `ANCHOR_LABELS` from `reservation-type-badge.tsx` instead of defining it locally; no behavior change
  - [x] Update `reservation-type-badge.test.tsx` to assert all 8 `ReservationType` values have an `ANCHOR_LABELS` entry with non-empty `start`/`end` strings
  - [x] Run `reservation-edit-drawer.test.tsx` unchanged to confirm no regression (Story 1.1's drawer tests still pass against the re-exported map)

- [x] **Task 2: `ReservationTypeSection` accordion component** (AC: 2, 3, 4, 6, 8)
  - [x] Create `src/components/packt/reservation-type-section.tsx` — `"use client"`, explicit `ReservationTypeSectionProps` interface (`{ type: ReservationType; reservations: Reservation[]; open: boolean; onToggle: () => void; now: Date }`)
  - [x] Implement the container styling, header (icon/label, count badge, chevron, accessible-name `aria-label`), collapsed preview line, and expanded row list per the Dev Notes spec (exact styles, formatting helpers, sort helpers)
  - [x] Export the row-ordering helper (`sortReservationsByStartAt`) and the date/time formatting helper (`formatAnchorDateTime`) and the "next-upcoming" helper (`getNextUpcoming`) so `reservations-tab.tsx` can reuse them for cross-section ordering — see Dev Notes for exact signatures
  - [x] Create `src/components/packt/reservation-type-section.test.tsx` covering: collapsed render (header content, count badge text is `aria-hidden`, preview text, accessible name with singular/plural count and "collapsed"), expand toggle (chevron rotation class/style, border appears, rows render, accessible name switches to "expanded"), within-section ordering (rows ordered by `startAt` ascending, undated rows last), confirmation-code chip rendering, and the "type has reservations but none have `startAt`" preview fallback (Dev Notes)

- [x] **Task 3: Rewrite `ReservationsTab`** (AC: 1, 5, 7, 8)
  - [x] In `src/components/packt/reservations-tab.tsx`, replace the Story 1.1 minimal grouping with: (a) the FR-6 empty state (`Empty`/`EmptyHeader`/`EmptyMedia`/`EmptyTitle`/`EmptyDescription`/`EmptyContent` containing the existing `ReservationTypePicker`) when `reservations.length === 0`, hiding the title+picker header row in that case; (b) otherwise, the title+picker header row plus one `ReservationTypeSection` per populated type, ordered via the cross-section sort algorithm (Dev Notes) using `useNow()`
  - [x] Add local `useState<Record<ReservationType, boolean>>` (or `Set<ReservationType>`) for per-section open/closed state, all collapsed by default
  - [x] Update `src/components/packt/reservations-tab.test.tsx`: replace/extend the existing tests to cover the empty state (Empty composition renders, no accordion sections, single "Add Reservation" entry point) and the populated multi-type case (correct number of sections, cross-section ordering for a soonest-first scenario, an "all past" type sorts after types with upcoming Reservations, a type with no dated Reservations sorts last)

- [x] **Task 4: E2E scenarios** (AC: 9)
  - [x] Add a scenario to `tests/e2e/features/reservations.feature`: a freshly-created trip (Object Mother, zero `reservations`) shows "No reservations yet" and no accordion section, then "Add Reservation" still works from `EmptyContent`
  - [x] Add a scenario seeding ≥2 Reservations across ≥2 types via `cloneTripMother(..., { reservations: [...] })` overrides (one upcoming Flight, one upcoming Lodging with a later `startAt`) and assert both accordion headers render in soonest-first order
  - [x] Rewrite the existing `Then("the reservation {string} appears in the {string} section", ...)` step in `tests/e2e/steps/reservations.steps.ts`: it currently asserts `getByRole("heading", { name: sectionLabel })`, but the accordion header is now a `<button aria-expanded>` with the AC6 constructed accessible name — assert `getByRole("button", { name: new RegExp(`^${sectionLabel}, `) })` is visible (and expand it if collapsed) before asserting the provider text is visible

## Dev Notes

### Scope boundary — read first

This story delivers the **full read-only accordion view + empty state**. Explicitly OUT of scope (later stories own these):

- Click-to-edit on any row field (provider, anchor times, confirmation code, notes) — **Story 1.3**. Rows render the values described in AC4 as plain text/elements, with no `<button>`/inline-input behavior.
- Delete affordance on a row — **Story 1.4**.
- Document rows / inline "Add confirmation document" affordance within a Reservation row — **Story 1.5**. UX-DR3 describes these, but this story renders only the provider line, anchor line(s), and confirmation-code chip.
- The FR-9 CTA row, Linked Events on the Itinerary/Now Card, `?tab=res&action=...`/`?highlight=...` query-param orchestration — **Epic 2**. Do not touch `src/lib/linked-events.ts` or the Itinerary/Now Card components.
- `src/components/ui/accordion.tsx` does not exist and this story does **not** create one — follow `day-card.tsx`/`day-card-header.tsx`'s local-`useState` accordion pattern (see below), which is the established Packt convention for this kind of collapsible section.

### Task 1 — extracting `ANCHOR_LABELS` (and `REQUIRES_END_AT`)

`reservation-edit-drawer.tsx` currently defines, as module-level constants:

```ts
const REQUIRES_END_AT: ReservationType[] = [ReservationType.Lodging, ReservationType.RentalCar, ReservationType.Cruise];

const ANCHOR_LABELS: Record<ReservationType, { start: string; end: string }> = {
  flight: { start: "Departure", end: "Arrival" },
  train: { start: "Departure", end: "Arrival" },
  bus: { start: "Departure", end: "Arrival" },
  ferry: { start: "Departure", end: "Arrival" },
  "rental-car": { start: "Pickup", end: "Return" },
  lodging: { start: "Check-in", end: "Check-out" },
  cruise: { start: "Departure", end: "Return" },
  other: { start: "Start", end: "End" },
};
```

`ANCHOR_LABELS` is needed by `reservation-type-section.tsx` (Task 2) to render each row's anchor-line labels (AC4) and the collapsed preview's anchor formatting. Move it to `reservation-type-badge.tsx` and export it as a named export, next to `RESERVATION_TYPE_META`:

```ts
export const ANCHOR_LABELS: Record<ReservationType, { start: string; end: string }> = {
  flight: { start: "Departure", end: "Arrival" },
  train: { start: "Departure", end: "Arrival" },
  bus: { start: "Departure", end: "Arrival" },
  ferry: { start: "Departure", end: "Arrival" },
  "rental-car": { start: "Pickup", end: "Return" },
  lodging: { start: "Check-in", end: "Check-out" },
  cruise: { start: "Departure", end: "Return" },
  other: { start: "Start", end: "End" },
};
```

Update `reservation-edit-drawer.tsx`'s import line (`import { RESERVATION_TYPE_META } from "@/components/packt/reservation-type-badge";`) to also import `ANCHOR_LABELS`, and delete the local definition. `REQUIRES_END_AT` is **not** needed by this story's new components — leave it as-is in `reservation-edit-drawer.tsx` (it was already flagged as a deferred DRY item in Story 1.1's review and is not this story's concern).

**Note on `reservation-edit-drawer.tsx`'s size**: this file is already ~275 lines (over the ~250-line guideline), pre-existing from Story 1.1. Task 1's change to it is purely subtractive — deleting the ~12-line local `ANCHOR_LABELS` map and adjusting one import line, with no new responsibilities added — bringing it to ~263 lines. Splitting this file is unrelated to Story 1.2's scope and is not required here; if it still needs splitting, that's a candidate for Story 1.3 (which will add more fields/logic to this same file).

### `reservation-type-section.tsx` (Task 2)

```ts
"use client";

import { ChevronDown, Wallet } from "lucide-react";
import { ANCHOR_LABELS, RESERVATION_TYPE_META } from "@/components/packt/reservation-type-badge";
import type { Reservation, ReservationType } from "@/data/types";

export interface ReservationTypeSectionProps {
  type: ReservationType;
  reservations: Reservation[];
  open: boolean;
  onToggle: () => void;
  now: Date;
}
```

`now` is passed down from `reservations-tab.tsx`'s `useNow()` call rather than calling `useNow()` again here — keeps the component pure/easy to test with a fixed `now`.

**Container** (mirrors `day-card.tsx`'s outer `<div>`, lines ~86-93, but without the `isToday` accent border variant — Reservation sections never use the accent border):

```tsx
<div className="mb-3" style={{ borderRadius: 14, border: "1px solid var(--line)", background: "var(--bg)", overflow: "hidden" }}>
```

(`12px` bottom margin ≈ Tailwind `mb-3`.)

**Header** — a single `<button>` (mirrors `day-card-header.tsx`'s header `<button>`, lines ~57-93, dropping the `MapPin`/stops-count/Active-badge bits which don't apply here):

```tsx
const { label, icon: Icon } = RESERVATION_TYPE_META[type];
const count = reservations.length;
const accessibleName = `${label}, ${count} reservation${count === 1 ? "" : "s"}, ${open ? "expanded" : "collapsed"}`;

<button
  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
  style={{
    background: "var(--surface)",
    borderBottom: open ? "1px solid var(--line)" : "none",
    cursor: "pointer",
    border: "none",
  }}
  onClick={onToggle}
  aria-expanded={open}
  aria-label={accessibleName}
>
  <span className="flex items-center gap-2" style={{ fontSize: "calc(var(--fs-card-title) * var(--font-scale))", fontWeight: 600, color: "var(--fg)" }}>
    <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
    {label}
  </span>
  <span className="flex items-center gap-2">
    <span
      aria-hidden="true"
      className="inline-flex items-center justify-center rounded-full"
      style={{ height: 22, minWidth: 22, padding: "0 8px", fontSize: 11, fontWeight: 600, background: "var(--surface-2)", color: "var(--fg-2)" }}
    >
      {count}
    </span>
    <ChevronDown
      size={14}
      strokeWidth={1.5}
      aria-hidden="true"
      style={{ color: "var(--fg-4)", transform: open ? "rotate(180deg)" : undefined, transition: "transform 0.15s", flexShrink: 0 }}
    />
  </span>
</button>
```

`12px 16px` padding ≈ Tailwind `px-4 py-3`. `--fs-card-title` is the existing CSS custom property already used by `day-card-header.tsx` for its date label — reuse it for the type label so the two accordion families look consistent.

Because the header element itself carries the full constructed `aria-label` (AC6), its visible text content (the type label) would otherwise be read *twice* by assistive tech (once as the element's accessible name, once as its text content) — this is the same pattern UX-DR12 specifies for the Linked Event row, and is intentional/required, not a bug to "fix" by removing `aria-label`.

**Collapsed preview** (only rendered when `!open && count > 0`):

```tsx
{!open && (
  <div className="px-4 py-2" style={{ fontSize: "calc(var(--fs-card-sub) * var(--font-scale))", color: "var(--fg-2)" }}>
    {renderPreview(reservations, now)}
  </div>
)}
```

Where `renderPreview` produces "Next: **{provider}** · {weekday}, {month} {day} · {time}" using `getNextUpcoming()` (below). If the next-upcoming Reservation has no `startAt` at all, render just "Next: **{provider}**" (no trailing `· ...`).

**Expanded rows** (only rendered when `open`):

```tsx
{open && sortReservationsByStartAt(reservations).map((reservation, index, all) => (
  <div
    key={reservation.id}
    className="px-4 py-3.5"
    style={{ borderBottom: index < all.length - 1 ? "1px solid var(--line)" : "none" }}
  >
    <div style={{ fontSize: "calc(var(--fs-card-title) * var(--font-scale))", fontWeight: 600 }}>{reservation.provider}</div>
    {renderAnchorLine(ANCHOR_LABELS[type].start, reservation.startAt)}
    {renderAnchorLine(ANCHOR_LABELS[type].end, reservation.endAt)}
    {reservation.confirmationCode && (
      <span
        className="inline-flex items-center gap-1 mt-1.5 rounded"
        style={{ background: "var(--surface-2)", padding: "2px 8px", fontFamily: "var(--font-mono-family, ui-monospace)", fontSize: 12 }}
      >
        <Wallet size={12} strokeWidth={1.5} aria-hidden="true" />
        {reservation.confirmationCode}
      </span>
    )}
  </div>
))}
```

`14px 16px` padding ≈ `px-4 py-3.5`. `renderAnchorLine(label, value)` returns `null` if `value` is undefined, otherwise a row with `label` (`var(--fg-3)`, `min-width: 68px`, 13px) and `formatAnchorDateTime(value)` (`var(--fg-2)`, 13px) side by side (`flex gap-2`).

### Formatting and sorting helpers (exported from `reservation-type-section.tsx`)

```ts
export function formatAnchorDateTime(iso: string): string {
  const date = new Date(iso);
  const datePart = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const timePart = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${datePart} · ${timePart}`;
}
```

This produces e.g. `"Tue, Jun 16 · 3:00 PM"` — matching UX-DR2's preview format and UX-DR3's row anchor-line format exactly. (This replaces, for this story's new components, the old `formatReservationDateTime()` in `reservations-tab.tsx`, which used `toLocaleString({ dateStyle: "medium", timeStyle: "short" })` and produced a different, non-spec format — that function can be deleted as part of Task 3's rewrite since nothing else uses it.)

```ts
export function sortReservationsByStartAt(reservations: Reservation[]): Reservation[] {
  const dated = reservations.filter((reservation) => reservation.startAt);
  const undated = reservations.filter((reservation) => !reservation.startAt);
  dated.sort((a, b) => new Date(a.startAt!).getTime() - new Date(b.startAt!).getTime());
  return [...dated, ...undated];
}
```

```ts
export function getNextUpcoming(reservations: Reservation[], now: Date): Reservation | undefined {
  if (reservations.length === 0) return undefined;
  const dated = reservations.filter((reservation) => reservation.startAt);
  if (dated.length === 0) return reservations[0];

  const upcoming = dated.filter((reservation) => new Date(reservation.startAt!).getTime() >= now.getTime());
  if (upcoming.length > 0) {
    return upcoming.reduce((soonest, candidate) =>
      new Date(candidate.startAt!).getTime() < new Date(soonest.startAt!).getTime() ? candidate : soonest
    );
  }

  // All of this type's dated Reservations are in the past — preview/sort by the most recent one.
  return dated.reduce((latest, candidate) =>
    new Date(candidate.startAt!).getTime() > new Date(latest.startAt!).getTime() ? candidate : latest
  );
}
```

"Next-upcoming", precisely: the Reservation of this type with the earliest `startAt >= now`. If none of the type's Reservations are upcoming (all `startAt < now`, or none have `startAt`), it falls back to the most-recently-past dated Reservation, or — only if **no** Reservation of this type has any `startAt` at all — the first Reservation in array order. This single function backs both the collapsed preview (AC3) and the cross-section sort key (AC5/below), so the two are always consistent (the section whose preview says "Next: ..." for the soonest date is always the first section shown).

### Cross-section ordering (AC5) — in `reservations-tab.tsx`

```ts
function sectionSortKey(type: ReservationType, reservations: Reservation[], now: Date): [number, number] {
  const nextUpcoming = getNextUpcoming(reservations, now);
  if (!nextUpcoming?.startAt) {
    // No dated Reservations of this type at all — sort last, stable by enum order.
    return [2, Object.values(ReservationType).indexOf(type)];
  }
  const startAtMs = new Date(nextUpcoming.startAt).getTime();
  if (startAtMs >= now.getTime()) {
    // Has an upcoming Reservation — sort by soonest first.
    return [0, startAtMs];
  }
  // All dated Reservations of this type are in the past — sort after upcoming types,
  // most-recently-past first.
  return [1, -startAtMs];
}
```

Build the populated-types list, then:

```ts
const sections = Object.values(ReservationType)
  .map((type) => ({ type, items: reservations.filter((reservation) => reservation.type === type) }))
  .filter((section) => section.items.length > 0)
  .sort((a, b) => {
    const keyA = sectionSortKey(a.type, a.items, now);
    const keyB = sectionSortKey(b.type, b.items, now);
    return keyA[0] - keyB[0] || keyA[1] - keyB[1];
  });
```

This naturally "re-sorts live" (AC5) because it's recomputed on every render from `reservations` (a prop, updated via `revalidatePath` → server re-render after any create/update/delete) and `now` (from `useNow()`).

**Worked examples** (for the test-writer):
- Type A has one Reservation with `startAt` 2 days from now; Type B has one Reservation with `startAt` 5 days from now → both bucket `0`, A (`startAt` smaller) sorts before B. ✅ "soonest first".
- Type C has one Reservation with `startAt` 3 days *ago* (no upcoming ones) → bucket `1`, sorts after A and B regardless of how far in the past. ✅ "all past" types sort after types with an upcoming Reservation.
- Type D has one Reservation with no `startAt` at all → bucket `2`, sorts last of all, after C. ✅ "no `startAt`" types sort last.
- If two types are both bucket `1` (all-past), the one whose most-recent-past Reservation is more recent (closer to `now`) sorts first (`-startAtMs` ascending = more-recent-past first).

### `reservations-tab.tsx` rewrite (Task 3)

```tsx
"use client";

import { useState } from "react";
import { Luggage } from "lucide-react";
import { useNow } from "@/components/providers/mock-date-provider";
import { ReservationTypePicker } from "@/components/packt/reservation-type-picker";
import { ReservationEditDrawer } from "@/components/packt/reservation-edit-drawer";
import { ReservationTypeSection, getNextUpcoming } from "@/components/packt/reservation-type-section";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ReservationType, type Reservation } from "@/data/types";

export interface ReservationsTabProps {
  tripId: string;
  reservations: Reservation[];
}

export function ReservationsTab({ tripId, reservations }: ReservationsTabProps) {
  const now = useNow();
  const [selectedType, setSelectedType] = useState<ReservationType | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openSections, setOpenSections] = useState<Set<ReservationType>>(new Set());

  function handleSelectType(type: ReservationType): void {
    setSelectedType(type);
    setDrawerOpen(true);
  }

  function toggleSection(type: ReservationType): void {
    setOpenSections((current) => {
      const next = new Set(current);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }

  const sections = /* AC5 algorithm above */;

  return (
    <div className="flex flex-col gap-4">
      {sections.length > 0 && (
        <div className="flex items-center justify-between">
          <h2 style={{ fontSize: "calc(16px * var(--font-scale))", fontWeight: 600 }}>Reservations</h2>
          <ReservationTypePicker onSelectType={handleSelectType} />
        </div>
      )}

      {sections.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Luggage strokeWidth={1.5} />
            </EmptyMedia>
            <EmptyTitle>No reservations yet</EmptyTitle>
            <EmptyDescription>
              Add a Flight, Lodging, Rental Car, and more to keep your bookings in one place.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <ReservationTypePicker onSelectType={handleSelectType} />
          </EmptyContent>
        </Empty>
      ) : (
        sections.map((section) => (
          <ReservationTypeSection
            key={section.type}
            type={section.type}
            reservations={section.items}
            open={openSections.has(section.type)}
            onToggle={() => toggleSection(section.type)}
            now={now}
          />
        ))
      )}

      {selectedType && (
        <ReservationEditDrawer tripId={tripId} type={selectedType} open={drawerOpen} onOpenChange={setDrawerOpen} />
      )}
    </div>
  );
}
```

(`useNow`/`@/components/providers/mock-date-provider` is the existing hook used by `day-card.tsx`/`now-card.tsx`/`place-row.tsx` — same import path.) `getNextUpcoming` is imported here only if `sectionSortKey` is implemented inline in this file (as shown above); `sortReservationsByStartAt` is used internally by `reservation-type-section.tsx` and does not need to be imported here.

Rendering **two** `<ReservationTypePicker>` instances (header row + `EmptyContent`) is intentional and matches existing precedent (`trip-docs-tab.tsx` renders its upload affordance both in a persistent toolbar and inside `EmptyContent` when empty) — they are mutually exclusive based on `sections.length`, so only one is ever mounted at a time, satisfying AC1's "no separate empty-state-specific add flow" / "only one Add Reservation entry point" requirement.

### Testing standards summary (NFR2/NFR3)

- Coverage ≥95% lines/functions, ≥90% branches on `src/components/packt/**` — applies to `reservation-type-section.tsx`, `reservations-tab.tsx`, and the `reservation-type-badge.tsx` edit from Task 1.
- Component tests use Vitest + `@testing-library/react` + `userEvent`. For `reservation-type-section.test.tsx`, pass a fixed `now: Date` prop so preview-text and sort-order assertions are deterministic (no reliance on `useNow()`/system clock).
- For `reservations-tab.test.tsx`, the existing `vitest.setup.mts` global mocks (`next/navigation`, `next/headers`) already apply; `useNow()` resolves via the existing `mock-date-provider` — check how other tab tests (`day-card.test.tsx` or similar) handle/mock it and follow the same pattern rather than inventing a new one.
- E2E (`tests/e2e/`) — both new scenarios must create their own trip via `cloneTripMother(...)` (Object Mother), per AC7; do not add new rows to `global-setup.ts`.

## Project Structure Notes

- New files: `src/components/packt/reservation-type-section.tsx` (+ `.test.tsx`).
- Modified files: `src/components/packt/reservations-tab.tsx` (+ `.test.tsx`), `src/components/packt/reservation-type-badge.tsx` (+ `.test.tsx`), `src/components/packt/reservation-edit-drawer.tsx` (import-only change, `.test.tsx` should still pass unchanged), `tests/e2e/features/reservations.feature`, `tests/e2e/steps/reservations.steps.ts`.
- No conflicts with the project's unified structure — `reservation-type-section.tsx` follows the existing `src/components/packt/` convention, mirroring `day-card.tsx`/`day-card-header.tsx`'s accordion pattern (no new `src/components/ui/accordion.tsx` primitive is introduced).

### References

- [Source: _bmad-output/epics.md#Story 1.2: View Reservations Grouped by Type, with Empty State] — full AC text (Given/When/Then), FR2/FR6
- [Source: _bmad-output/epics.md#UX Design Requirements] — UX-DR2 (accordion section spec), UX-DR3 (row spec, static subset only), UX-DR8 (empty state), UX-DR12 (accessible-name format, `strokeWidth`/`aria-hidden` conventions)
- [Source: src/components/packt/day-card.tsx, day-card-header.tsx] — local-`useState` accordion pattern template (no `accordion.tsx` primitive exists)
- [Source: src/components/packt/trip-docs-tab.tsx#Empty composition] — FR-6/UX-DR8 empty-state template
- [Source: src/components/packt/reservation-type-badge.tsx] — `RESERVATION_TYPE_META`, extended with `ANCHOR_LABELS` (Task 1)
- [Source: src/components/packt/reservation-edit-drawer.tsx] — current `ANCHOR_LABELS`/`REQUIRES_END_AT` location (pre-Task-1)
- [Source: src/components/packt/reservations-tab.tsx] — Story 1.1's minimal grouping, replaced by this story
- [Source: tests/e2e/e2e-seed-data.ts, tests/e2e/scenario-fixture.ts] — `ReservationSeed`/`E2E_RESERVATION`/`cloneTripMother()` Object Mother (Story 1.1)
- [Source: tests/e2e/features/reservations.feature, tests/e2e/steps/reservations.steps.ts] — existing scenario/step definitions to extend and rewrite (Task 4)
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — item 6 (weak E2E section-assertion), resolved by Task 4

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- `npx eslint` — clean across all touched files (fixed two pre-existing-formatting regressions introduced by the auto-format hook: restored `eslint-disable`/`eslint-enable react-hooks/set-state-in-effect` comments in `reservation-edit-drawer.tsx`, and renamed `a`/`b` sort-comparator params to satisfy `id-length`)
- `npx tsc --noEmit` — clean
- `npm run test:coverage` — 135 files / 1884 tests passed; global thresholds met (lines 96.49% ≥ 95, functions 95.36% ≥ 95, branches 90.67% ≥ 90)
- `npm run build` — production build succeeded
- `npm run test:e2e` — 128/128 Playwright BDD scenarios passed, including the 2 new `reservations.feature` scenarios

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created
- Task 1: `ANCHOR_LABELS` moved from `reservation-edit-drawer.tsx` into `reservation-type-badge.tsx` and exported alongside `RESERVATION_TYPE_META`; drawer now imports it. `REQUIRES_END_AT` left in place per Dev Notes.
- Task 2: Created `reservation-type-section.tsx` — accordion section component with `formatAnchorDateTime`, `sortReservationsByStartAt`, and `getNextUpcoming` exported helpers, plus full `reservation-type-section.test.tsx` coverage (collapsed/expanded states, accessible name pluralization, ordering, preview fallback, confirmation-code chip).
- Task 3: Rewrote `reservations-tab.tsx` with the FR-6 empty state (`Empty`/`EmptyHeader`/`EmptyMedia`/`EmptyTitle`/`EmptyDescription`/`EmptyContent`), cross-section sorting via `sectionSortKey`, and per-section open/closed `Set<ReservationType>` state. Rewrote `reservations-tab.test.tsx` to cover empty state, multi-section rendering, cross-section ordering (soonest-first / all-past / undated), and section toggle.
- Task 4: Added an empty-state E2E scenario and a multi-type soonest-first ordering scenario to `reservations.feature`, with new step definitions in `reservations.steps.ts` (including a direct-DB scenario-owned fixture for the multi-type case, following the established `documents.steps.ts` pattern). Rewrote the "appears in the {type} section" step to assert against the new `<button aria-expanded>` accordion header.
- Fixed a React dev-console warning (mixing `border` shorthand with `borderBottom` on the accordion header) discovered during E2E verification by replacing the shorthand with individual `borderTop`/`borderLeft`/`borderRight`/`borderBottom` properties.

### File List

- `src/components/packt/reservation-type-badge.tsx` (modified — added `ANCHOR_LABELS` export)
- `src/components/packt/reservation-type-badge.test.tsx` (modified — added `ANCHOR_LABELS` coverage)
- `src/components/packt/reservation-edit-drawer.tsx` (modified — import `ANCHOR_LABELS` instead of local definition)
- `src/components/packt/reservation-type-section.tsx` (new)
- `src/components/packt/reservation-type-section.test.tsx` (new)
- `src/components/packt/reservations-tab.tsx` (rewritten)
- `src/components/packt/reservations-tab.test.tsx` (rewritten)
- `tests/e2e/features/reservations.feature` (modified — 2 new scenarios)
- `tests/e2e/steps/reservations.steps.ts` (modified — new/rewritten step definitions)

## Change Log

| Date | Change |
| --- | --- |
| 2026-06-14 | Story 1.2 created via `bmad-create-story` (ultimate context engine analysis). Status set to `ready-for-dev`. |
| 2026-06-15 | Story 1.2 implemented via `bmad-dev-story`: Tasks 1-4 complete, all ACs satisfied, full validation suite passing. Status set to `review`. |
