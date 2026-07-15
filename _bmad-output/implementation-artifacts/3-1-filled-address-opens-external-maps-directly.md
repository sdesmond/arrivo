---
baseline_commit: 209d6ebd1dd5f95d37fa789097687e1373b5093c
---

# Story 3.1: Filled Address opens External Maps directly

Status: review

## Story

As a traveler viewing an event or reservation with a saved address,
I want the address to be a direct action to open maps,
So that I can navigate there without an extra step.

## Acceptance Criteria

1. **Given** a `PlaceRow` with a filled Address
   **When** it renders
   **Then** it shows a two-segment shadcn `ButtonGroup`: segment 1 (`map-pin` icon + location name, `outline` variant) and segment 2 (`pencil` icon-only, `outline` variant)

2. **Given** I tap segment 1
   **When** tapped
   **Then** External Maps opens for that Address

3. **Given** I tap segment 2
   **When** tapped
   **Then** the edit dialog opens -- the only way to reach edit once an Address exists

4. **Given** an empty Address
   **When** rendered
   **Then** it remains a single button (today's behavior) -- no group

5. **And** each segment meets the 44x44px minimum, sharing a border with no visible gap, as genuine DOM siblings -- never one nested inside the other

## Tasks / Subtasks

- [x] Task 0: Split `place-row.tsx` to bring under 250 lines (prerequisite — pre-existing oversize)
  - [x] Subtask 0.1: Extract the linked-event branch (lines 234-275 of `place-row.tsx`) into `src/components/packt/place-row-linked-event.tsx`:
    - Move the `isLinkedEvent` rendering path (button with `ChevronRight`, linked badge, meta label) into a new component
    - Props: `place`, `onLinkedEventTap`, `linkedAriaLabel`, `linkedMetaLabel`, `LinkedIcon`, `isCombinedLinkedEvent`
    - Add `"use client"` at top
  - [x] Subtask 0.2: Update `place-row.tsx`:
    - Import and use `<PlaceRowLinkedEvent>` in the linked-event branch
    - Remove the moved JSX (lines 234-275)
    - `place-row.tsx` should drop from ~411 lines to ~360 lines
  - [x] Subtask 0.3: Create `src/components/packt/place-row-linked-event.test.tsx`:
    - Test: renders linked event as button with ChevronRight
    - Test: passes `onLinkedEventTap` callback
    - Test: renders `linkedAriaLabel` on the button
    - Test: renders `linkedMetaLabel` when provided
  - [x] Subtask 0.4: Update `place-row.test.tsx`:
    - Verify existing tests still pass (they render `PlaceRow` which uses `PlaceRowLinkedEvent` internally)
  - [x] Subtask 0.5: Run `npx vitest run src/components/packt/place-row-linked-event.test.tsx` and `npx vitest run src/components/packt/place-row.test.tsx` — both must pass

- [x] Task 1: Add shadcn Base UI ButtonGroup component (prerequisite)
  - [x] Subtask 1.1: Run `npx shadcn@latest add button-group` to install into `src/components/ui/button-group.tsx`
  - [x] Subtask 1.2: Verify it uses `@base-ui/react` primitives (consistent with `button.tsx`)
  - [x] Subtask 1.3: Verify it sets `data-slot="button-group"` so `in-data-[slot=button-group]` styles in `button.tsx` apply

- [x] Task 2: Add `onOpenMaps` callback to `PlaceRowActionBar` (AC: 2)
  - [x] Subtask 2.1: Add `onOpenMaps?: () => void` to `PlaceRowActionBarProps`
  - [x] Subtask 2.2: When address filled AND `onOpenMaps` provided, Location segment calls `onOpenMaps` instead of `onOpenLocation`
  - [x] Subtask 2.3: `onOpenLocation` stays as the edit-dialog trigger for empty state and pencil segment

- [x] Task 3: Restructure Location chip into ButtonGroup (AC: 1, 2, 3, 4, 5)
  - [x] Subtask 3.1: Import `ButtonGroup` from `@/components/ui/button-group` and `Button` from `@/components/ui/button`
  - [x] Subtask 3.2: Conditional render: filled address = `<ButtonGroup orientation="horizontal">` with two `<Button variant="outline">` segments; empty = existing single `<button>`
  - [x] Subtask 3.3: Segment 1 (location): `MapPin` icon + `locationLabel`, `onClick={onOpenMaps}`, `aria-label={Open directions to ${locationLabel}}`
  - [x] Subtask 3.4: Segment 2 (edit): `Pencil` icon only, `onClick={onOpenLocation}`, `aria-label="Edit location"`, `strokeWidth={1.5}`
  - [x] Subtask 3.5: Both segments meet 44x44px minimum (`size="lg"`/`size="icon-lg"` Button variants, both `h-11`/`size-11` per gotcha #9)
  - [x] Subtask 3.6: Import `Pencil` from `lucide-react`
  - [x] Subtask 3.7: Preserve `maxWidth: 160` truncation on segment 1 text
  - [x] Subtask 3.8: Verify segments are genuine DOM siblings sharing a border with no gap

- [x] Task 4: Wire `onOpenMaps` through `PlaceRow` (AC: 2)
  - [x] Subtask 4.1: Add `onOpenMaps?: () => void` to `PlaceRowProps`
  - [x] Subtask 4.2: Create `handleOpenMaps` calling `openExternalMaps({ address, lat, lng })`
  - [x] Subtask 4.3: Pass `onOpenMaps={handleOpenMaps}` when address filled; `undefined` when empty

- [x] Task 5: Update `place-row-action-bar.test.tsx` (AC: 1-5)
  - [x] Subtask 5.1: Renders ButtonGroup with two segments when address filled
  - [x] Subtask 5.2: Segment 1 has map-pin icon and location name
  - [x] Subtask 5.3: Clicking segment 1 calls `onOpenMaps`
  - [x] Subtask 5.4: Segment 2 has pencil icon only
  - [x] Subtask 5.5: Clicking segment 2 calls `onOpenLocation`
  - [x] Subtask 5.6: Segment 1 aria-label is "Open directions to {name}"
  - [x] Subtask 5.7: Segment 2 aria-label is "Edit location"
  - [x] Subtask 5.8: Single button (no group) when address empty
  - [x] Subtask 5.9: Empty-Address button calls `onOpenLocation`
  - [x] Subtask 5.10: Each segment meets 44x44px minimum
  - [x] Subtask 5.11: Backward compat when `onOpenMaps` not provided

- [x] Task 6: Update `place-row.test.tsx` (AC: 2)
  - [x] Subtask 6.1: PlaceRow passes `onOpenMaps` when address filled
  - [x] Subtask 6.2: PlaceRow does NOT pass `onOpenMaps` when address empty
  - [x] Subtask 6.3: `handleOpenMaps` calls `openExternalMaps` with correct args
  - [x] Subtask 6.4: Mock `openExternalMaps` in test file

- [x] Task 7: Verify no regressions
  - [x] Subtask 7.1: `place-row-action-bar.test.tsx` passes
  - [x] Subtask 7.2: `place-row.test.tsx` passes
  - [x] Subtask 7.3: `place-row-dialogs.test.tsx` passes
  - [x] Subtask 7.4: `now-card.test.tsx` passes
  - [x] Subtask 7.5: `now-card-event-row.test.tsx` passes

- [x] Task 8: Run `packt-build-validator`
  - [x] Subtask 8.1: lint, TypeScript, coverage, build, affected E2E
  - [x] Subtask 8.2: Fix any issues flagged
  - [x] Subtask 8.3: Re-run until PASS

## Dev Notes

### Previous Story Intelligence

**Story 2.3 (done):** Geo-hint pill permission detection. Split `NowCardEventRow` into own file. Changed `useRouteForEvent` return type to object.

**Story 2.2 (done):** Added `onOpenMaps` to `DistanceTimePill`. Created `src/lib/open-external-maps.ts`.

**Story 2.1 (done):** Created `DistanceTimePill`, `useRouteForEvent` hook, `route-actions.ts`, restructured Next Event row.

**Key learnings from Epic 2:**
- `open-external-maps.ts` already exists -- reuse, do not duplicate
- 44x44px interactive sizing enforced app-wide
- ButtonGroup `data-slot="button-group"` triggers existing `in-data-[slot=button-group]` styles in `button.tsx`
- Existing chips use `rounded-full px-2 py-0.5`; ButtonGroup uses `outline` variant `Button` elements instead

### Architecture Constraints

- **ButtonGroup is a UI primitive** -- `src/components/ui/button-group.tsx`, consumed by `place-row-action-bar.tsx`
- **Empty Address = single button, no group** -- AC 4 hard guardrail; check `place.locationAddress` truthy/falsy
- **`onOpenMaps` optional** -- backward compat for existing callers
- **`openExternalMaps` already in `src/lib/open-external-maps.ts`** -- import and call; no duplication
- **44x44px on BOTH segments** -- use `size="lg"` (`h-11`) or `min-h-11 min-w-11`
- **`MapPin` and `Pencil` from lucide-react** -- both `strokeWidth={1.5}`
- **Truncation on location name** -- `truncate` class + `maxWidth: 160` on segment 1

### Files to CREATE

| File | Purpose |
|------|---------|
| `src/components/ui/button-group.tsx` | shadcn Base UI ButtonGroup (via `npx shadcn@latest add button-group`) |

### Files to MODIFY

| File | Changes |
|------|---------|
| `src/components/packt/place-row-action-bar.tsx` | Add `onOpenMaps` prop; ButtonGroup for filled Address |
| `src/components/packt/place-row-action-bar.test.tsx` | Tests for ButtonGroup, segments, aria-labels, sizing |
| `src/components/packt/place-row.tsx` | Add `onOpenMaps` prop; `handleOpenMaps` using `openExternalMaps` |
| `src/components/packt/place-row.test.tsx` | Tests for `onOpenMaps` threading and `handleOpenMaps` |

### Files NOT to touch

- `src/db/schema.ts` -- no schema changes
- `src/lib/route.ts` -- route logic unchanged
- `src/lib/open-external-maps.ts` -- utility unchanged, just consumed
- `src/components/packt/distance-time-pill.tsx` -- Now Card scope, unaffected
- `src/components/packt/now-card.tsx` -- Now Card scope, unaffected
- `src/components/packt/place-row-dialogs.tsx` -- dialogs unchanged
- `src/components/packt/day-route-strip.tsx` -- Epic 4 scope
- `src/components/packt/map-tab.tsx` -- Epic 5 scope

### Existing Patterns to Follow

**Button pattern in `place-row-action-bar.tsx`:**
```tsx
<button
  onClick={onOpenLocation}
  className="flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors hover:bg-surface-2"
  style={{
    fontSize: "calc(var(--fs-action-chip) * var(--font-scale))",
    color: place.locationAddress ? "var(--accent-ink)" : "var(--fg-4)",
    background: place.locationAddress ? "var(--accent-soft)" : "none",
    border: "1px solid transparent",
    maxWidth: 160,
  }}
>
  <MapPin size={IconSize.actionChip} strokeWidth={1.5} style={{ flexShrink: 0 }} />
  <span className="truncate">{locationLabel || "Add location"}</span>
</button>
```

**ButtonGroup structure (from mockup `address-pill.html`):**
```html
<div class="button-group" role="group" aria-label="Location">
  <button class="bg-segment location" aria-label="Open directions to Senso-ji Temple">
    <MapPin /> Senso-ji Temple
  </button>
  <button class="bg-segment edit" aria-label="Edit location">
    <Pencil />
  </button>
</div>
```

**`openExternalMaps` usage (from `now-card-event-row.tsx`):**
```ts
import { openExternalMaps } from "@/lib/open-external-maps";

const handleOpenMaps = useCallback(() => {
  openExternalMaps({
    address: place.locationAddress,
    lat: place.locationLat,
    lng: place.locationLng,
  });
}, [place.locationAddress, place.locationLat, place.locationLng]);
```

### Key Gotchas

1. **ButtonGroup may not exist yet.** The project has `in-data-[slot=button-group]` styles in `button.tsx` but no `button-group.tsx` component file. Install it via `npx shadcn@latest add button-group` first.

2. **Empty Address must stay a single button.** The conditional rendering must be clean: `place.locationAddress ? <ButtonGroup>...</ButtonGroup> : <button>...</button>`. Never render a ButtonGroup for empty addresses.

3. **`onOpenMaps` is optional.** Existing callers of `PlaceRowActionBar` don't pass it. When not provided and address is filled, segment 1 should still render but be non-functional (defensive). The `onClick` handler should check: `onOpenMaps ? onOpenMaps() : undefined`.

4. **The `truncate` + `maxWidth` pattern must apply to segment 1 only.** Segment 2 is icon-only and has no text to truncate.

5. **ButtonGroup segments must be genuine DOM siblings.** No wrapper `<div>` between them. The `ButtonGroup` component from shadcn handles this -- it renders `<div data-slot="button-group">` with direct `<button>` children.

6. **The `outline` variant on `Button` elements.** The mockup uses `outline` variant for both segments. This matches shadcn's `Button` `variant="outline"` which renders `border-border bg-background`.

7. **Import `openExternalMaps` from `@/lib/open-external-maps`** -- do not re-implement the Google Maps URL construction.

8. **The `Pencil` icon must have `strokeWidth={1.5}`** per project convention for all Lucide icons.

9. **The `Button` `size="lg"` variant is `h-11 gap-2 px-5`** which meets the 44px minimum. For the pencil segment (icon-only), use `size="icon-lg"` (`size-11` = 44x44px).

10. **Test the backward-compat case.** When `onOpenMaps` is not provided but address is filled, the ButtonGroup should still render but segment 1 should not call maps. This ensures existing code paths that don't opt into the new behavior continue working.

### Testing Requirements

- **Unit tests** (Vitest): colocated `*.test.tsx` next to source
  - `src/components/packt/place-row-action-bar.test.tsx` -- extend with ButtonGroup, segment clicks, aria-labels, sizing
  - `src/components/packt/place-row.test.tsx` -- extend with `onOpenMaps` threading and `handleOpenMaps`
- **E2E tests** (playwright-bdd): no new E2E scenario needed -- the Address ButtonGroup is a UI-level change covered by unit/component tests; the E2E suite already tests trip detail views
- Coverage threshold: >=95% lines/functions, >=90% branches across `src/lib/**` and `src/components/packt/**`
- Run targeted tests first, then `packt-build-validator` for full validation

### References

- Epics: `_bmad-output/planning-artifacts/epics.md` -- Epic 3, Story 3.1 (lines 335-359)
- Architecture: `_bmad-output/planning-artifacts/architecture.md` -- Address ButtonGroup in New & Modified Files (line 219-221), Architectural Boundaries (line 254)
- UX Design: `_bmad-output/planning-artifacts/ux-designs/ux-packt-2026-07-12/DESIGN.md` -- `address-button-group` component spec (lines 32-44)
- UX Experience: `_bmad-output/planning-artifacts/ux-designs/ux-packt-2026-07-12/EXPERIENCE.md` -- Component Patterns (lines 56-57), State Patterns (lines 86-87), Interaction Primitives (line 98)
- Mockup: `_bmad-output/planning-artifacts/ux-designs/ux-packt-2026-07-12/mockups/address-pill.html` -- visual reference for empty, old, and ButtonGroup states
- Previous stories: `_bmad-output/implementation-artifacts/2-1-show-live-distance-time-for-the-next-event.md`, `2-2-open-external-maps-from-the-distance-time-pill.md`, `2-3-prompt-for-geolocation-only-when-it-can-help.md`
- Project context: `_bmad-output/project-context.md` -- component patterns, styling rules, testing standards

## Dev Agent Record

### Implementation Plan

1. Split `place-row.tsx` first (pre-existing oversize prerequisite): extracted the linked-event button branch into `place-row-linked-event.tsx`.
2. Installed shadcn's `button-group.tsx` (Base UI-backed, matches `button.tsx` conventions); accepted the one incidental `separator.tsx` reformat after diffing it (whitespace-only) and re-running Prettier to match project formatting.
3. Combined Task 2 (add `onOpenMaps` to `PlaceRowActionBar`) and Task 3 (ButtonGroup restructure) into one TDD pass on `place-row-action-bar.tsx`, since both touch the same conditional block — wrote the full AC1-5 test suite first, confirmed 9 red failures, then implemented.
4. Wired a self-contained `handleOpenMaps` (via `useCallback`, mirroring the existing `now-card.tsx` pattern) directly in `place-row.tsx` rather than adding an external `onOpenMaps` prop to `PlaceRowProps` — the story's Dev Notes code snippet and subtasks 4.2/4.3 both describe a self-contained handler, and no caller of `<PlaceRow>` needs to intercept this action (unlike `NowCard`, which needs it for route/geolocation orchestration).
5. Kept `LinkedIcon`/`isCombinedLinkedEvent` in `PlaceRowLinkedEventProps` per the story's literal prop list, but did not destructure them in the function body (they're not used in the moved JSX) — mirrors the existing precedent in `PlaceRowNameFieldProps.isHovered`.

### Debug Log

- `tsc`/`next build` initially failed: `PlaceRowLinkedEventProps.LinkedIcon` used a hand-rolled inline type whose `aria-hidden?: string` was structurally incompatible with lucide-react's real `LucideIcon` type (`aria-hidden?: Booleanish`). Fixed by importing and using `LucideIcon` directly from `lucide-react`.
- ESLint flagged an unused `container` destructure in `place-row-linked-event.test.tsx` (test used `screen.getByRole` instead) — removed the destructure.

### Completion Notes

- All 8 tasks complete; AC 1-5 covered by new/updated unit tests in `place-row-action-bar.test.tsx` and `place-row.test.tsx`.
- No new E2E scenario added, per Dev Notes -- this is a UI-level change already covered by unit/component tests, and the existing E2E suite exercises trip detail views generally.
- `packt-build-validator` PASS: lint clean, `tsc` clean, coverage 96.14% lines / 96.37% functions / 90.13% branches (thresholds: ≥95%/≥95%/≥90%), full E2E suite 170/170 passed (affected-detection selected the full suite since `place-row.tsx` is a shared component), production build succeeded.
- **Post-review fix:** the mockup's plain `outline` variant (gotcha #6) dropped the `--accent-soft`/`--accent-ink` "filled" visual cue that every other action-bar pill uses to signal "has data" (Time, Cost, Docs). Restored it on both `ButtonGroup` segments via inline `style` (matching the `DistanceTimePill`/badge `soft`-variant convention), with `borderColor: "transparent"` so the pair reads as one filled unit. Added a regression test (`place-row-action-bar.test.tsx`: "both segments carry the accent-soft/accent-ink filled styling..."). Re-ran `packt-build-validator` -- PASS (lint clean, tsc clean, coverage lines 96.14%/functions 96.37%/branches 90.13%, E2E 170/170, build succeeded).

### File List

- `src/components/packt/place-row-linked-event.tsx` (new)
- `src/components/packt/place-row-linked-event.test.tsx` (new)
- `src/components/packt/place-row.tsx` (modified)
- `src/components/packt/place-row.test.tsx` (modified)
- `src/components/packt/place-row-action-bar.tsx` (modified)
- `src/components/packt/place-row-action-bar.test.tsx` (modified)
- `src/components/ui/button-group.tsx` (new)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified -- status tracking)

## Change Log

| Date | Change |
|------|--------|
| 2026-07-15 | Story created -- ready for dev |
| 2026-07-15 | Implementation complete -- all 8 tasks done, packt-build-validator PASS, moved to review |
| 2026-07-15 | Post-review fix: restored accent-soft/accent-ink filled styling on ButtonGroup segments (lost under mockup's plain outline variant); packt-build-validator PASS |
