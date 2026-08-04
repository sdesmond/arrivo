---
baseline_commit: d2db7c924c2fd2f227cf2e8adc5148184f3bf416
---

# Story 1.3: Set Trip Transit Default via Getting Around section

Status: done

## Story

As a trip owner or editor,
I want to set my trip's transit mode in a "Getting Around" section,
so that travel estimates match how I actually get around on this trip.

## Acceptance Criteria

1. **Given** the trip edit sheet
   **When** I open it
   **Then** a distinct "Getting Around" section is visible containing a 3-segment control: walk, drive, transit — pre-selected to the trip's seeded default from Story 1.2

2. **Given** I select a mode and save
   **When** the mutation runs
   **Then** it calls `requireUser()` then `assertTripAccess("editor")` before persisting to `trips.transitMode`, independently of the global preference value going forward

3. **Given** I'm using a keyboard only
   **When** I press arrow keys within the segmented control
   **Then** focus roves between segments, and Home/End jump to the first/last segment

4. **And** each segment meets the 44×44px minimum interactive target on both axes

## Tasks / Subtasks

- [x] Task 1: Create server action for trip-level transit mode mutation (AC: 2)
  - [x] Subtask 1.1: Create `src/app/(app)/trips/[tripId]/transit-actions.ts` with `"use server"` at top
  - [x] Subtask 1.2: Export `updateTripTransitMode(tripId: string, transitMode: TransitMode)` — calls `requireUser()`, then `assertTripAccess(tripId, "editor")`, validates `transitMode` against `TransitMode` enum via `isTransitMode()`, updates `trips.transitMode`, calls `revalidatePath(`/trips/${tripId}`)`; returns `{ success: true }` or `{ error: string }`
  - [x] Subtask 1.3: Create `src/app/(app)/trips/[tripId]/transit-actions.test.ts` — test: valid mode persists; invalid mode returns error; unauthenticated user is rejected; non-editor user is rejected

- [x] Task 2: Create Getting Around section component (AC: 1, 3, 4)
  - [x] Subtask 2.1: Create `src/components/packt/getting-around-section.tsx` with `"use client"` at top
  - [x] Subtask 2.2: Define `GettingAroundSectionProps`: `{ transitMode: TransitMode; onTransitModeChange: (mode: TransitMode) => void; disabled?: boolean }`
  - [x] Subtask 2.3: Render a section title "Getting Around" using the existing `Section` / `Field` pattern from `preferences-section.tsx`
  - [x] Subtask 2.4: Render a 3-segment control using `ToggleGroup` + `ToggleGroupItem` from `@/components/ui/toggle-group` (or the existing `ToggleGroup` pattern in `preferences-section.tsx`) — segments: Walk (`lucide:footprints`), Drive (`lucide:car`), Transit (`lucide:train-front`)
  - [x] Subtask 2.5: Each segment must meet 44×44px on both width AND height — use `h-11 min-w-11` or equivalent (see sizing table in AGENTS.md)
  - [x] Subtask 2.6: Implement arrow-key roving tabindex with Home/End — follow the trip-detail tab bar's existing keyboard convention
  - [x] Subtask 2.7: Selected segment uses `accent-soft` fill / `accent-ink` text; unselected uses `fg-3` text
  - [x] Subtask 2.8: Create `src/components/packt/getting-around-section.test.tsx` — test: renders 3 segments; default selection matches prop; clicking a segment calls `onTransitModeChange`; each segment is focusable via arrow keys; component is accessible (role, aria attributes)

- [x] Task 3: Extend `updateTripMetadata` to handle `transitMode` (AC: 2)
  - [x] Subtask 3.1: In `src/app/(app)/trips/actions.ts`, function `updateTripMetadata` (line 336), extend `buildTripUpdatePayload()` (line 381) to include `transitMode` when present in the patch — validate with `isTransitMode()` before persisting
  - [x] Subtask 3.2: Add tests in `src/app/(app)/trips/actions.test.ts` for `updateTripMetadata` handling `transitMode`: valid mode persists; invalid mode is rejected; null clears the mode

- [x] Task 4: Wire Getting Around into trip edit sheet (AC: 1)
  - [x] Subtask 4.1: In `src/components/packt/trip-edit-sheet.tsx`, add `GettingAroundSection` after the Budget section (currently the last section before People)
  - [x] Subtask 4.2: In `getPatch()`, add `transitMode: draft.transitMode` to the returned patch object — the type already supports it on `UpdateTripPatch`
  - [x] Subtask 4.3: Wire the component: `transitMode={draft.transitMode ?? TransitMode.Drive}`, `onTransitModeChange={(mode) => set("transitMode", mode)}`
  - [x] Subtask 4.4: The existing `handleSave` in trip-edit-sheet calls `updateTripMetadata` with the patch — since `transitMode` is now in the patch (Subtask 4.2) and `updateTripMetadata` handles it (Task 3), no separate action call is needed. The save flow remains a single server action call.
  - [x] Subtask 4.5: Update `src/components/packt/trip-edit-sheet.test.tsx` — add `transitMode: TransitMode.Drive` to `baseTrip` fixture; add tests for: Getting Around section renders; selecting a mode updates draft; saving persists the mode

- [x] Task 5: Extend E2E coverage for the Getting Around flow
  - [x] Subtask 5.1: Add a scenario to `tests/e2e/features/trips.feature`: "Given I open the trip edit sheet, When I select a different transit mode and save, Then the trip's transit mode is updated"
  - [x] Subtask 5.2: Add matching step definitions in `tests/e2e/steps/`

- [x] Task 6: Run targeted tests then full validation
  - [x] Subtask 6.1: Run `npx vitest run src/app/(app)/trips/[tripId]/transit-actions.test.ts` — must pass
  - [x] Subtask 6.2: Run `npx vitest run src/components/packt/getting-around-section.test.tsx` — must pass
  - [x] Subtask 6.3: Run `npx vitest run src/components/packt/trip-edit-sheet.test.tsx` — must pass
  - [x] Subtask 6.4: Run `npx vitest run src/app/(app)/trips/actions.test.ts` — must pass
  - [x] Subtask 6.5: Run affected E2E tests — must pass
  - [x] Subtask 6.6: Run `packt-build-validator` — lint, TypeScript, coverage, build, affected E2E must pass

## Dev Notes

### Previous Story Intelligence

**Story 1.1 (done):** Created the `TransitMode` type, `route_cache` table, `resolveEffectiveMode` in `src/lib/route.ts`, DB columns on `users` and `trips`, profile preferences UI with the exact `ToggleGroup` + `Select` pattern this story reuses. Key file: `src/app/(app)/profile/preferences-section.tsx` lines 351–365 — the reference implementation for the segmented control.

**Story 1.2 (done):** Wired `createTrip` to seed `trips.transitMode` via `input.transitMode ?? user.transitMode ?? TransitMode.Drive`. Validates with `isTransitMode()`. The `"drive"` hard default is the canonical fallback when both user preference and input are null.

**Key learnings from 1.1 and 1.2:**
- The `ToggleGroup` / `ToggleGroupItem` pattern for transit mode segments already exists in `preferences-section.tsx` — copy this pattern exactly
- `isTransitMode()` from `@/lib/db-mappers` is the validation guard — always use it before persisting
- `dbTripToType()` already maps null `transitMode` to null; consumers must default null to `"drive"` at the point of use
- The `actions.ts` user query at line 216 already selects `transitMode`; no further schema changes needed

### Architecture Constraints

- **New server actions file**: `src/app/(app)/trips/[tripId]/transit-actions.ts` — colocated with the trip route, separate from the already-large `actions.ts` (architecture §Structure Patterns)
- **Every mutation calls `requireUser()` then `assertTripAccess()`** before any read or write — defense-in-depth even if the query layer also checks
- **`transitMode` is the only field in this new action** — keep it minimal and focused; `updateTripMetadata` in `actions.ts` handles all other trip fields
- **`trip.transitMode` is edited independently after seeding** — once set, it has no ongoing reference back to the user's global preference (architecture §Data Model)
- **44×44px minimum on both axes** for every interactive target — this is the explicit reason the segmented control must be `h-11 min-w-11` not just `h-11`
- **Keyboard model**: arrow-key roving tabindex within the group, Home/End jump to first/last — matches the trip-detail tab bar convention (UX-DR8)
- **No "smart" mode** — 3 segments only: walk, drive, transit

### Files to CREATE

| File | Purpose |
|------|---------|
| `src/app/(app)/trips/[tripId]/transit-actions.ts` | Server action: `updateTripTransitMode` with auth + validation |
| `src/app/(app)/trips/[tripId]/transit-actions.test.ts` | Unit tests for the new action |
| `src/components/packt/getting-around-section.tsx` | Client component: 3-segment transit mode control |
| `src/components/packt/getting-around-section.test.tsx` | Unit tests for the component |

### Files to MODIFY

| File | Changes |
|------|---------|
| `src/components/packt/trip-edit-sheet.tsx` | Add `GettingAroundSection` after Budget section; include `transitMode` in `getPatch()`; wire state and save |
| `src/components/packt/trip-edit-sheet.test.tsx` | Add transit mode to `baseTrip` fixture; add tests for Getting Around rendering, selection, save |
| `src/app/(app)/trips/actions.ts` | Extend `buildTripUpdatePayload()` in `updateTripMetadata` to include `transitMode` when present |
| `src/app/(app)/trips/actions.test.ts` | Add `updateTripMetadata` tests for transit mode handling |
| `tests/e2e/features/trips.feature` | Add scenario for changing transit mode via Getting Around section |
| `tests/e2e/steps/trip-edit.steps.ts` | Add step definitions for the new scenario |

### Files NOT to touch (explicit scope boundaries)

- `src/db/schema.ts` — `trips.transitMode` already exists from Story 1.1
- `src/data/types.ts` — `TransitMode`, `Trip.transitMode`, `UpdateTripPatch.transitMode` already exist from Story 1.1
- `src/lib/db-mappers.ts` — `dbTripToType` already maps `transitMode`; `isTransitMode()` already exported
- `src/lib/route.ts` — `resolveEffectiveMode` is complete; Story 2.1 adds Directions API
- `src/app/(app)/profile/*` — profile preferences are Story 1.1 (done)
- `src/components/packt/distance-time-pill.tsx` — Epic 2 scope
- `src/components/packt/now-card.tsx` — Epic 2 scope
- `src/components/packt/mini-map-rail.tsx` — dead code removal is Epic 4 scope

### Existing Patterns to Follow

**Profile preferences segmented control** (`src/app/(app)/profile/preferences-section.tsx` lines 351–365):
```tsx
// Reference pattern — this is the exact control to replicate
<ToggleGroup
  type="single"
  value={localTransitMode}
  onValueChange={(value) => { if (value) setLocalTransitMode(value as TransitMode); }}
>
  {TRANSIT_MODE_OPTIONS.map((option) => (
    <ToggleGroupItem key={option.value} value={option.value} title={option.label}>
      <option.icon className="size-4" strokeWidth={1.5} />
      <span>{option.label}</span>
    </ToggleGroupItem>
  ))}
</ToggleGroup>
```

**Server action pattern** (`src/app/(app)/profile/actions.ts`):
```ts
"use server";
// ... requireUser() + validation + db.update + revalidatePath
```

**Auth guard pattern** (`src/app/(app)/trips/actions.ts`):
```ts
const sessionUser = await requireUser();
await assertTripAccess(tripId, sessionUser.id!, "editor");
```

**Trip edit sheet patch pattern** (`src/components/packt/trip-edit-sheet.tsx` lines 147–174):
```ts
function getPatch(): UpdateTripPatch {
  return {
    name: draft.name,
    startDate: draft.startDate,
    endDate: draft.endDate,
    // ... existing fields ...
    transitMode: draft.transitMode,  // ADD THIS LINE
  };
}
```

### Testing Requirements

- **Unit tests** (Vitest): colocated `*.test.ts` / `*.test.tsx` next to source
- `src/app/(app)/trips/[tripId]/transit-actions.test.ts` — test auth, validation, persistence
- `src/components/packt/getting-around-section.test.tsx` — test rendering, selection, keyboard, accessibility
- `src/components/packt/trip-edit-sheet.test.tsx` — extend with transit mode fixture and tests
- `src/app/(app)/trips/actions.test.ts` — extend `updateTripMetadata` tests
- **E2E tests** (playwright-bdd): extend `tests/e2e/features/trips.feature` with a scenario for changing transit mode via the Getting Around section; add matching step definitions in `tests/e2e/steps/`
- Coverage threshold: ≥95% lines/functions, ≥90% branches across `src/lib/**` and `src/components/packt/**`
- Run targeted tests first, then `packt-build-validator` for full validation

### Key Gotchas

1. **Null `transitMode` must default to `"drive"` at the point of use** — `dbTripToType` maps null to null, and existing trips created before Epic 1 will have null. The Getting Around section must show `"drive"` as selected when `trip.transitMode` is null.
2. **The trip edit sheet save goes through `updateTripMetadata`** — `transitMode` is included in the patch from `getPatch()`, and `updateTripMetadata`'s `buildTripUpdatePayload` handles it. No separate server action call is needed for the edit sheet flow. The `transit-actions.ts` file is still created (Task 1) for direct transit mode mutations outside the edit sheet (e.g., future quick-toggle).
3. **Do NOT create `distance-time-pill.tsx` or touch `now-card.tsx`** — that's Epic 2. This story is purely the trip edit Getting Around section.
4. **The `ToggleGroup` from `@/components/ui/toggle-group`** is the correct primitive — do not invent a custom segmented control. Check what `preferences-section.tsx` imports and use the same.
5. **Each segment must be 44×44px on BOTH width AND height** — the profile page's toggle may only enforce height; verify width meets the minimum too. Use `h-11 min-w-11` or equivalent.
6. **Arrow-key keyboard model** is roving tabindex within the group, not Tab-through — match the trip-detail tab bar convention. Check if `ToggleGroup` from the UI library handles this natively or if custom `onKeyDown` is needed.
7. **`revalidatePath` must be called after mutation** — `revalidatePath(`/trips/${tripId}`)` to refresh trip data.
8. **Existing `updateTripMetadata` tests must still pass** — the `buildTripUpdatePayload` function is shared; adding `transitMode` must not break existing patch shapes. Use `expect.objectContaining()` where possible.
9. **The `TRANSIT_MODE_OPTIONS` constant** — check if it's already exported from `preferences-section.tsx` or needs to be defined. If it's local, either export it or define a shared constant. Prefer reusing the existing one.
10. **`trip-edit-sheet.tsx` is already 329 lines** — pre-existing size concern (over the 250-line guideline). This story adds ~15 lines (import + component render + getPatch field). A refactor to split the sheet is outside this story's scope but should be tracked.
11. **E2E coverage** — the Getting Around section is a new user-facing flow within the existing trip edit sheet. Extend `tests/e2e/features/trips.feature` (where existing trip-edit scenarios live) rather than creating a new feature file.
12. **Feature map** — add `src/components/packt/getting-around-section.tsx` to the `trips` entry in `tests/e2e/feature-map.mjs` so changes to it trigger the `@feat:trips` E2E scenarios. Currently `trip-edit-sheet.tsx` is already covered by the `trip-edit-*.tsx` glob in that entry.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

None — no blocking failures encountered. All tests passed on first or second implementation pass; no debugging sessions required.

### Completion Notes List

- Implemented all 6 tasks/subtasks via red-green TDD: failing test written first, then minimal implementation, confirmed green, then moved on.
- `assertTripAccess` is a 3-arg call (`tripId, userId, minRole`), not the 2-arg `assertTripAccess(tripId, "editor")` shown in Subtask 1.2's prose — implemented against the real signature, matching the code sample already given in Dev Notes ("Auth guard pattern").
- AC3 (arrow-key roving tabindex + Home/End) is provided natively by Base UI's `ToggleGroup`, which wraps `CompositeRoot` with `enableHomeAndEndKeys: true` — the same primitive `preferences-section.tsx` already uses. No custom `onKeyDown` was needed; verified behaviorally in `getting-around-section.test.tsx` (tab lands on the first segment, not the selected one — roving tabindex defaults to first, matching observed Base UI behavior).
- No literal "trip-detail tab bar" component with custom roving-tabindex code exists in the codebase to copy from (searched for `ArrowRight`/`ArrowLeft`/`tabIndex` usage); the convention referenced in Dev Notes is satisfied by Base UI's built-in composite keyboard model.
- Subtask 2.7 (accent-soft/accent-ink/fg-3 styling) is not present in the "copy exactly" reference (`preferences-section.tsx`'s segmented control has no color overrides). Implemented the styling explicitly via `aria-pressed:bg-accent-soft aria-pressed:text-accent-ink text-fg-3` classes (Base UI's `Toggle` sets `aria-pressed`, not a `data-state` attribute, so the `aria-pressed:` variant is the one that actually applies).
- Dev Notes named the target step-definition file as `tests/e2e/steps/trip-edit.steps.ts`; the actual codebase convention (and the file the existing `trips.feature` steps already live in) is `tests/e2e/steps/trips.steps.ts`. Added the new steps there instead of creating a parallel file.
- Registered `src/components/packt/getting-around-section.tsx` in the `trips` entry of `tests/e2e/feature-map.mjs` per Gotcha #12; `scripts/feature-map.test.mjs` contract test passes.
- Full validation: lint, TypeScript, coverage (2863 tests, lines 96.08%/functions 96.27%/branches 90.05%, all above threshold), full E2E suite (170 scenarios, including the new transit-mode scenario), and production build all pass.

### File List

**Created:**
- `src/app/(app)/trips/[tripId]/transit-actions.ts`
- `src/app/(app)/trips/[tripId]/transit-actions.test.ts`
- `src/components/packt/getting-around-section.tsx`
- `src/components/packt/getting-around-section.test.tsx`

**Modified:**
- `src/components/packt/trip-edit-sheet.tsx`
- `src/components/packt/trip-edit-sheet.test.tsx`
- `src/app/(app)/trips/actions.ts`
- `src/app/(app)/trips/actions.test.ts`
- `tests/e2e/features/trips.feature`
- `tests/e2e/steps/trips.steps.ts`
- `tests/e2e/feature-map.mjs`

## Review Findings

### Second Review — 2026-07-13

**Patch (3):**
- [x] [Review][Patch] Auth check before input validation [transit-actions.ts:13-14] — `assertTripAccess` (DB query) runs before `isTransitMode` (in-memory check). Move validation before DB call to avoid wasted query on invalid input.
- [x] [Review][Patch] No reactivity test for disabled — test only checks initial `disabled={true}` render; does not verify component re-applies disabled state when prop toggles.
- [x] [Review][Patch] E2E step selector too broad [trips.steps.ts:142] — `getByRole("button")` inside dialog lacks `within()` scoping to Getting Around section; could hit wrong element if other controls share the same accessible name.

**Deferred (8):**
- [x] [Review][Defer] `user.id!` non-null assertion [transit-actions.ts:14] — pre-existing pattern throughout codebase (actions.ts:345)
- [x] [Review][Defer] Redundant `aria-label` on ToggleGroup [getting-around-section.tsx:29] — follows existing pattern from preferences-section.tsx:354
- [x] [Review][Defer] Inconsistent error contract [actions.ts:71 vs transit-actions.ts:20] — two different action surfaces; both correctly prevent invalid data
- [x] [Review][Defer] Mock `trips` is `{}` [transit-actions.test.ts:12] — pre-existing test pattern
- [x] [Review][Defer] Brittle class-name assertions [getting-around-section.test.tsx:56-67] — className-based assertions verify correct Tailwind classes
- [x] [Review][Defer] db.update throws (connection error) [transit-actions.ts:21-23] — no try/catch, consistent with all server actions
- [x] [Review][Defer] TOCTOU — trip deleted between assertTripAccess and db.update [transit-actions.ts:21-24] — pre-existing pattern across all mutations
- [x] [Review][Defer] ToggleGroup fires onValueChange with empty/multiple values [getting-around-section.tsx:28-33] — guard already handles empty/falsy; Base UI fires only valid values

**Dismissed (3):**
- ToggleGroup value is `[transitMode]` (array) — follows established Base UI pattern (preferences-section.tsx:355)
- `toggle-group` component not included in diff — pre-existing from prior stories
- `isTransitMode` not included in diff — pre-existing export from db-mappers.ts (Story 1.1)

## Change Log

- Added `updateTripTransitMode` server action (`transit-actions.ts`) for direct trip-level transit mode mutations, auth-gated via `requireUser()` + `assertTripAccess(tripId, userId, "editor")`.
- Added `GettingAroundSection` component: a 3-segment (walk/drive/transit) `ToggleGroup` control meeting 44×44px sizing, with native roving-tabindex keyboard support from Base UI.
- Extended `updateTripMetadata`'s `buildTripUpdatePayload` to persist `transitMode` (validated via `isTransitMode()`), so the trip edit sheet's single-call save flow now covers transit mode.
- Wired `GettingAroundSection` into `TripEditSheet` after the Budget section, defaulting to Drive when the trip has no transit mode set.
- Added E2E scenario "Changing the trip's transit mode via the Getting Around section" to `trips.feature` with matching step definitions.
