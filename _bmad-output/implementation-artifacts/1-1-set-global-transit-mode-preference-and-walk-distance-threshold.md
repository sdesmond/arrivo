---
baseline_commit: 275fd32f00fef7399af5359e95fc0e196803b8a8
---

# Story 1.1: Set global Transit Mode preference and walk-distance threshold

Status: review

## Story

As a traveler,
I want to set a personal default transit mode and a "walk if it's close" distance threshold,
so that new trips start with my usual preference and short hops are always walked regardless of trip mode.

## Acceptance Criteria

1. **Given** the database migration for this feature is applied
   **When** it completes
   **Then** `users.transitMode` (nullable text: walk/drive/transit) and `users.walkThresholdMeters` (nullable integer) columns exist, the `route_cache` table exists (`origin_lat`, `origin_lng`, `destination_lat`, `destination_lng`, `transit_mode`, `distance_meters`, `duration_seconds`, `fetched_at`, snake_case columns), and `src/lib/route.ts` exports a pure `resolveEffectiveMode(hopDistanceMeters, tripTransitMode, walkThresholdMeters)` function — this AC scopes only the `route_cache` table and this pure per-hop resolver; Directions API calls, `route_cache` reads/writes, and the `RouteResult` union are Story 2.1's responsibility, added to the same file without touching this function

2. **Given** the profile preferences page
   **When** I view it
   **Then** `transitMode` and `walkThresholdMeters` inputs appear alongside the existing currency/distanceUnit preferences

3. **Given** I have set `walkThresholdMeters`
   **When** any hop's distance is calculated as less than that threshold
   **Then** `route.ts`'s `resolveEffectiveMode` resolves `effectiveMode` to `"walk"` for that hop specifically, overriding whichever trip mode is otherwise in effect

4. **And** `walkThresholdMeters` is stored in meters internally regardless of my `distanceUnit` display preference, converting only for display

## Tasks / Subtasks

- [x] Task 1: Database migration — add transit mode columns and route_cache table (AC: 1)
  - [x] Subtask 1.1: Add `transitMode` (nullable text) and `walkThresholdMeters` (nullable integer) columns to the `users` table in `src/db/schema.ts`
  - [x] Subtask 1.2: Add `transitMode` (nullable text) column to the `trips` table in `src/db/schema.ts` (needed by Story 1.2 but must ship here per architecture sequencing)
  - [x] Subtask 1.3: Create the `route_cache` table in `src/db/schema.ts` with columns: `originLat` (doublePrecision), `originLng` (doublePrecision), `destLat` (doublePrecision), `destLng` (doublePrecision), `transitMode` (text), `distanceMeters` (integer), `durationSeconds` (integer), `fetchedAt` (timestamp with timezone). Composite primary key on (originLat, originLng, destLat, destLng, transitMode)
  - [x] Subtask 1.4: Generate and apply the Drizzle migration via `npx drizzle-kit generate` then `npx drizzle-kit push` (or `npm run db:migrate` equivalent)

- [x] Task 2: Add TransitMode type and update existing types (AC: 1, 3)
  - [x] Subtask 2.1: Add `TransitMode` const object + union type to `src/data/types.ts`: `{ Walk: "walk", Drive: "drive", Transit: "transit" } as const` — no "smart" value
  - [x] Subtask 2.2: Add `transitMode?: TransitMode | null` to `UserProfile` interface
  - [x] Subtask 2.3: Add `transitMode?: TransitMode | null` to `UpdateUserProfilePatch` interface
  - [x] Subtask 2.4: Add `transitMode?: TransitMode | null` to `Trip` interface
  - [x] Subtask 2.5: Add `transitMode?: TransitMode | null` to `CreateTripInput` interface
  - [x] Subtask 2.6: Add `transitMode?: TransitMode | null` to `UpdateTripPatch` interface

- [x] Task 3: Create shared route calculation module (AC: 1, 3)
  - [x] Subtask 3.1: Create `src/lib/route.ts` with the pure `resolveEffectiveMode(hopDistanceMeters: number, tripTransitMode: TransitMode, walkThresholdMeters: number | null | undefined): TransitMode` function
  - [x] Subtask 3.2: Logic: if `walkThresholdMeters` is not null/undefined AND `hopDistanceMeters < walkThresholdMeters`, return `"walk"`; otherwise return `tripTransitMode`
  - [x] Subtask 3.3: Create `src/lib/route.test.ts` with unit tests covering: threshold set and hop below → walk; threshold set and hop above → trip mode; threshold null/undefined → trip mode; threshold 0 → always walk; edge case hopDistance equals threshold → trip mode (not walk, since condition is `<` not `<=`)

- [x] Task 4: Update DB mappers for new fields (AC: 1)
  - [x] Subtask 4.1: Update `dbUserToType` in `src/lib/db-mappers.ts` to map `transitMode` and `walkThresholdMeters` from the DB row to the `UserProfile` type
  - [x] Subtask 4.2: Update `dbTripToType` in `src/lib/db-mappers.ts` to map `transitMode` from the DB row to the `Trip` type
  - [x] Subtask 4.3: Update `src/lib/db-mappers.test.ts` to cover the new field mappings in `dbUserToType` and `dbTripToType` — test both null and non-null values for the new fields

- [x] Task 5: Add profile server actions for transit preferences (AC: 2)
  - [x] Subtask 5.1: Extend `UpdateUserProfilePatch` usage in `src/app/(app)/profile/actions.ts` `updateProfile` function — add validation for `transitMode` (must be one of "walk", "drive", "transit" or null) and `walkThresholdMeters` (must be a positive integer or null)
  - [x] Subtask 5.2: The existing `updateProfile` action already handles arbitrary patches via `db.update(users).set(dbPatch)` — no new action file needed; just ensure the new fields pass through validation and reach the DB

- [x] Task 6: Add transit preference UI to profile page (AC: 2)
  - [x] Subtask 6.1: In `src/app/(app)/profile/preferences-section.tsx`, add a new `Section` titled "Getting Around" (or "Transit") after the existing Budget section
  - [x] Subtask 6.2: Add a "Default transit mode" field using the same `ToggleGroup` pattern as distance units — 3 segments: Walk, Drive, Transit (use `TransitMode` values as keys). Each segment label should show the mode name with a corresponding lucide icon (e.g., `lucide:footprints` for walk, `lucide:car` for drive, `lucide:train-front` for transit)
  - [x] Subtask 6.3: Add a "Walk if closer than" field using `Select` matching the Budget Warning %/Danger % pattern — options: "Off" (null value) plus preset distances in the user's `distanceUnit`: for imperial use `[200, 400, 800, 1600]` feet (displayed as "200 ft", "400 ft", etc.); for metric use `[100, 200, 500, 1000]` meters (displayed as "100 m", "200 m", etc.). The presets should be converted to meters internally for storage
  - [x] Subtask 6.4: Wire local state (`useState`) for `transitMode` and `walkThresholdMeters`, add to the `computeDirty` function, and include in the `handleSave` patch object
  - [x] Subtask 6.5: `walkThresholdMeters` null = "Off" in the Select; non-null = the selected preset distance in meters. When the user's `distanceUnit` changes, the display should update but the stored value stays in meters
  - [x] Subtask 6.6: Write component tests in `src/app/(app)/profile/preferences-section.test.tsx` for: rendering the new fields, saving transitMode changes, saving walkThresholdMeters changes, dirty state tracking for the new fields

- [x] Task 7: Run `packt-build-validator` to confirm everything passes

## Dev Notes

### Architecture Constraints

- **Schema-first sequencing**: these schema changes MUST land before Now Card work (Story 2.1), because Now Card reads `trip.transitMode` through the per-hop resolver.
- **TransitMode type**: `const TransitMode = { Walk: "walk", Drive: "drive", Transit: "transit" } as const` — no "smart" value. Follow the project's const-object + union pattern exactly.
- **route.ts is built incrementally**: Story 1.1 creates the file with `route_cache` table definition and the pure `resolveEffectiveMode` resolver ONLY. Story 2.1 adds the Directions API call, cache read/write, and `RouteResult` union. Neither story touches the other's half.
- **Per-hop resolution formula**: `effectiveMode = (walkThresholdMeters is set AND hopDistance < walkThresholdMeters) ? "walk" : tripTransitMode`. The threshold check reads the user's global setting live per hop; it is NOT seeded onto the trip.
- **Distance/duration storage**: plain integer columns (`distance_meters`, `duration_seconds`) — NOT the numeric-string currency convention.
- **Walk-threshold input surface**: lives on the profile page alongside `distanceUnit`/`currency`, since it's a global preference, not a trip one.

### Files to CREATE

| File | Purpose |
|------|---------|
| `src/lib/route.ts` | Shared route calculation module — pure `resolveEffectiveMode` function + `route_cache` table export |
| `src/lib/route.test.ts` | Unit tests for `resolveEffectiveMode` |

### Files to MODIFY

| File | Changes |
|------|---------|
| `src/db/schema.ts` | Add `transitMode`, `walkThresholdMeters` to `users`; add `transitMode` to `trips`; add `route_cache` table |
| `src/data/types.ts` | Add `TransitMode` const object + union; add fields to `UserProfile`, `UpdateUserProfilePatch`, `Trip`, `CreateTripInput`, `UpdateTripPatch` |
| `src/lib/db-mappers.ts` | Map new `transitMode`/`walkThresholdMeters` in `dbUserToType` and `dbTripToType` |
| `src/app/(app)/profile/actions.ts` | Add validation for `transitMode` and `walkThresholdMeters` in `updateProfile` |
| `src/app/(app)/profile/preferences-section.tsx` | Add "Getting Around" section with transit mode toggle and walk threshold select |
| `src/app/(app)/profile/preferences-section.test.tsx` | Add tests for new transit preference fields |

### Files NOT to touch (explicit scope boundaries)

- `src/app/(app)/trips/actions.ts` — trip creation seeding happens in Story 1.2, not here
- `src/app/(app)/trips/[tripId]/transit-actions.ts` — trip-level Getting Around section happens in Story 1.3
- `src/app/(app)/trips/[tripId]/actions.ts` — no changes in this story
- `src/components/packt/now-card.tsx` — Now Card work is Epic 2
- `src/components/packt/getting-around-section.tsx` — trip edit Getting Around section is Story 1.3

### Existing Patterns to Follow

**Profile preferences pattern** (from `preferences-section.tsx`):
- `Section` component with title wraps grouped fields
- `Field` component wraps each control with a label
- `ToggleGroup` + `ToggleGroupItem` for radio-like choices (date format, distance units, cover type)
- `Select` + `SelectTrigger` + `SelectContent` + `SelectItem` for dropdown choices (budget thresholds)
- Local `useState` per field, `computeDirty` checks all against user defaults, `handleSave` builds a partial patch
- `useTransition` for async save, `toast.error()` on failure, "Saved" status text on success

**DB schema pattern** (from `schema.ts`):
- All tables use `uuid().primaryKey().default(sql\`gen_random_uuid()\`)`
- Text columns for enums: `text("column_name")` — no PostgreSQL enum types
- Nullable fields: simply omit `.notNull()` (e.g., `transitMode: text("transit_mode")`)
- Integer fields: `integer("column_name")`
- Timestamp fields: `timestamp("column_name", { withTimezone: true }).default(sql\`now()\`)`

**Types pattern** (from `types.ts`):
```ts
export const TransitMode = {
  Walk: "walk",
  Drive: "drive",
  Transit: "transit",
} as const;
export type TransitMode = (typeof TransitMode)[keyof typeof TransitMode];
```

**Server action validation pattern** (from `profile/actions.ts`):
```ts
if (patch.transitMode !== undefined && patch.transitMode !== null) {
  const validModes = Object.values(TransitMode) as string[];
  if (!validModes.includes(patch.transitMode)) {
    return { error: "Invalid transit mode." };
  }
}
```

### Testing Requirements

- **Unit tests** (Vitest): colocated `*.test.ts`/`*.test.tsx` next to source
- `src/lib/route.test.ts` — test `resolveEffectiveMode` with all edge cases
- `src/app/(app)/profile/preferences-section.test.tsx` — extend existing test file with new transit field tests
- Coverage threshold: ≥95% lines/functions, ≥90% branches across `src/lib/**` and `src/components/packt/**`
- `src/components/ui/**` excluded from coverage
- Run `npm test` to verify unit tests pass, then `npm run test:coverage` to confirm thresholds

### Key Gotchas

1. **`walkThresholdMeters` is stored in meters internally** — the UI must convert from the user's display unit (feet for imperial, meters for metric) to meters before saving, and convert back for display only.
2. **`walkThresholdMeters` null means "Off"** — the Select's "Off" option maps to null, not 0.
3. **The threshold condition is strict less-than** (`<`), not less-than-or-equal — a hop exactly at the threshold uses the trip mode, not walk.
4. **Don't add `route_cache` reads/writes or Directions API calls** — that's Story 2.1. This story only creates the table schema and the pure resolver function.
5. **Don't add trip creation seeding** — that's Story 1.2. This story only adds the `trips.transitMode` column to the schema.
6. **Don't create `transit-actions.ts`** — that's Story 1.3. This story only extends the existing `profile/actions.ts`.
7. **The `route_cache` table has a composite primary key** — not a single `id` column. Use `primaryKey({ columns: [table.originLat, table.originLng, table.destLat, table.destLng, table.transitMode] })`.
8. **Existing tests must still pass** — run `npm test` before and after to catch regressions.

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Implementation Plan

- Add schema, domain type, mapper, validation, and preference UI support for global transit settings.
- Keep per-hop resolution pure and defer Directions API/cache behavior to Story 2.1.
- Store walk thresholds as meters while converting imperial preset selections before save.

### Debug Log References

- `npx vitest run src/lib/route.test.ts src/lib/db-mappers.test.ts src/app/(app)/profile/actions.test.ts src/app/(app)/profile/preferences-section.test.tsx`
- `npx vitest run`, `npm run lint`, `npx tsc --noEmit`, `npm run test:coverage`, `npm run test:e2e`, `NEXT_DISTDIR=.next-validate npm run build`

### Completion Notes List

- Added nullable transit settings to users and trips plus the composite-key route cache schema; generated migration and applied schema push.
- Added transit-mode types, mapper support, server validation, pure per-hop walk override, and profile controls with accessible 44px targets.
- Added resolver, mapper, action, and preference tests; full validation passed.

### File List

- src/db/schema.ts
- src/data/types.ts
- src/lib/route.ts
- src/lib/route.test.ts
- src/lib/db-mappers.ts
- src/lib/db-mappers.test.ts
- src/app/(app)/profile/actions.ts
- src/app/(app)/profile/actions.test.ts
- src/app/(app)/profile/preferences-section.tsx
- src/app/(app)/profile/preferences-section.test.tsx
- drizzle/0000_bright_robbie_robertson.sql (generated locally; ignored by repository configuration)

## Change Log

- 2026-07-13: Added global transit preference and walk-threshold support; status set to review.
