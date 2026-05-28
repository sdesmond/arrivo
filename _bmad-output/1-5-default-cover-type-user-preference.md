# Story 1.5: Default Cover Type User Preference

Status: done

## Story

As a traveler,
I want to choose whether new trip covers default to a photo, a map, or a graphic,
so that my cover images always match my preferred visual style without extra steps after creation.

## Acceptance Criteria

1. **Given** the user settings page — **Then** a "Default trip cover type" control is present with three options: **Photo**, **Map**, and **Graphic**
2. **Given** I select **Photo** and save — **Then** `defaultCoverType` is updated to `"photo"` in the database
3. **Given** I select **Map** and save — **Then** `defaultCoverType` is updated to `"map"` in the database
4. **Given** I select **Graphic** and save — **Then** `defaultCoverType` is updated to `"graphic"` in the database
5. **Given** I create a new trip with a destination — **Then** the cover type used matches my saved preference
6. **Given** my preference is **Graphic** — **And** I create a new trip with or without a destination — **Then** the graphic is always generated (no coordinates needed)
7. **Given** my preference is **Photo** or **Map** — **And** I create a new trip without a destination — **Then** no cover is applied (coordinates required for both)
8. **Given** no preference is saved — **Then** `"photo"` is used as the default
9. **Given** this setting — **Then** it applies to newly created trips only — existing covers are never auto-updated

## Tasks / Subtasks

- [x] Add `defaultCoverType?: CoverType` to `UpdateUserProfilePatch` in `src/data/types.ts` (AC: 2, 3, 4)
  - [x] Add field to the interface alongside `distanceUnit`
- [x] Add `defaultCoverType` to `getUserById` SELECT in `src/lib/queries.ts` (AC: 1)
  - [x] Add `defaultCoverType: users.defaultCoverType` to the column list (line 34-45)
  - [x] This makes `user.defaultCoverType` available to the profile page client component
- [x] Add `defaultCoverType` validation to `updateProfile` in `src/app/(app)/profile/actions.ts` (AC: 2, 3, 4)
  - [x] Validate: only allow `"photo"`, `"map"`, `"graphic"` as valid values
  - [x] Return error for invalid values: `"Invalid cover type."`
  - [x] No guard needed — `defaultCoverType` is optional, undefined means "don't change"
- [x] Add "Default trip cover type" control to `src/app/(app)/profile/preferences-section.tsx` (AC: 1)
  - [x] Import `CoverType` from `@/data/types`
  - [x] Add `COVER_TYPE_OPTIONS` constant with three options (see Dev Notes)
  - [x] Add `coverType` state initialized from `user.defaultCoverType ?? "photo"`
  - [x] Add a `ToggleGroup` for cover type selection — same pattern as date format / distance units
  - [x] Include `handleCoverTypeChange` that calls `onDirtyChange`
  - [x] Include `coverType` in `computeDirty`, `handleSave` patch construction
  - [x] Place the new field between "Distance units" and the save button row
- [x] Update tests (AC: via test file colocation standard)
  - [x] `src/app/(app)/profile/preferences-section.test.tsx` — add cover type describe block
  - [x] `src/app/(app)/profile/actions.test.ts` — add updateProfile validation for defaultCoverType

### Review Findings

- [x] [Review][Patch] Graphic preference is still skipped when a new trip has no destination, so AC6 remains unmet [src/app/(app)/trips/actions.ts:185] — fixed: no-destination trips now force Graphic directly; center-only trips load preference and apply Graphic correctly
- [x] [Review][Patch] Renaming persisted cover-type values without a compatibility path breaks existing saved preferences [src/data/types.ts:49] — superseded: LEGACY_COVER_TYPE_MAP removed entirely; app uses only photo/map/graphic; legacy values treated as invalid by parseCoverType
- [x] [Review][Patch] Magic string `"photo"` hardcoded 3× in preferences-section.tsx instead of `CoverType.Photo` constant [src/app/(app)/profile/preferences-section.tsx:33,42,75] — fixed: all three replaced with `CoverType.Photo`
- [x] [Review][Patch] No E2E scenario for cover type preference save flow — new cross-boundary flow per AGENTS.md requirement [tests/e2e/features/] — fixed: added preferences-cover-type.feature + steps covering Map and Graphic save flows
- [x] [Review][Defer] Legacy "unsplash"/"mapbox" DB values — resolved: LEGACY_COVER_TYPE_MAP removed; parseCoverType rejects old values as undefined (no migration needed per story scope)
- [x] [Review][Defer] LEGACY_COVER_TYPE_MAP duplicated in trips/actions.ts and queries.ts — resolved: both removed
- [x] [Review][Defer] ToggleGroup deselect sends empty array, visually clears but state unchanged — pre-existing pattern for all toggles in component — deferred, pre-existing
- [x] [Review][Defer] Cover preference DB query runs outside the trip transaction — pre-existing from Story 1.3 — deferred, pre-existing

## Dev Notes

### Files to Modify

| File | Change type | Notes |
|------|-------------|-------|
| `src/data/types.ts` | UPDATE | Add `defaultCoverType` to `UpdateUserProfilePatch` |
| `src/lib/queries.ts` | UPDATE | Add column to `getUserById` SELECT |
| `src/app/(app)/profile/actions.ts` | UPDATE | Add validation for cover type in `updateProfile` |
| `src/app/(app)/profile/preferences-section.tsx` | UPDATE | Add cover type toggle control |
| `src/app/(app)/profile/preferences-section.test.tsx` | UPDATE | Add cover type tests |
| `src/app/(app)/profile/actions.test.ts` | UPDATE | Add cover type patch validation tests |
| `src/data/types.ts` | UPDATE | Rename `CoverType` const properties + values (ripple) |
| `src/app/(app)/trips/actions.ts` | UPDATE | Update `"unsplash"`→`"photo"`, `"mapbox"`→`"map"` in `createTrip` (ripple) |
| `src/lib/db-mappers.test.ts` | UPDATE | Update test values `"unsplash"`→`"photo"`, `"mapbox"`→`"map"` (ripple) |
| `src/app/(app)/trips/actions.test.ts` | UPDATE | Update any `"unsplash"`/`"mapbox"` references (ripple) |
| `src/components/packt/new-trip-dialog.test.tsx` | UPDATE | Update any `"unsplash"` references (ripple) |

No new files are created in this story.

### Ripple Effects — CoverType Values Change Existing Code

This story renames the `CoverType` const values from implementation-specific names to UI-matching names. This is a cross-cutting change — you MUST update every file that references the old values:

**`src/data/types.ts` — CoverType const (line 49-54):**
```ts
// OLD:
export const CoverType = { Unsplash: "unsplash", Mapbox: "mapbox", Graphic: "graphic" } as const;
// NEW:
export const CoverType = { Photo: "photo", Map: "map", Graphic: "graphic" } as const;
```

**All files referencing old values that MUST be updated:**

| File | Old reference | New reference |
|------|---------------|---------------|
| `src/data/types.ts` | `CoverType.Unsplash`, `CoverType.Mapbox` | `CoverType.Photo`, `CoverType.Map` |
| `src/lib/db-mappers.ts` | validation against old values (auto-adapts via `Object.values(CoverType)`) | No change needed — `Object.values()` auto-picks up new values |
| `src/lib/utils.ts` | `GRAPHIC_COVER_ICONS`, `deriveGraphicCover` | No change — `"graphic"` is unaffected |
| `src/app/(app)/trips/actions.ts` | `const coverType = userRow?.defaultCoverType ?? "unsplash"` | `?? "photo"` |
| `src/app/(app)/trips/actions.ts` | `if (coverType === "mapbox" && ...)` | `if (coverType === "map" && ...)` |
| `src/app/(app)/trips/actions.ts` | `else { ... searchCoverImages ... }` (Unplash fallback) | Change to `else if (coverType === "photo")` for explicit matching |
| `src/lib/db-mappers.test.ts` | tests pass `"unsplash"`, `"mapbox"` | Change to `"photo"`, `"map"` |
| `src/app/(app)/trips/actions.test.ts` | `searchLocations`/`searchCoverImages` tests | Update any `"unsplash"`/`"mapbox"` references |
| `src/components/packt/new-trip-dialog.test.tsx` | test assertions referencing `"unsplash"` | Update to `"photo"` |

**Important:** The `else` branch in `createTrip` (currently catches anything non-mapbox/non-graphic) should become an explicit `else if (coverType === "photo")` so unknown or null values result in no cover instead of silently falling through to Unsplash. This is a minor behavioral improvement.

ACs 5, 6, 7, 8, and 9 are otherwise already covered by Story 1.3's `createTrip` implementation. The `updateTripMetadata` never auto-modifies `coverImageUrl`.

### `src/data/types.ts` — UpdateUserProfilePatch

Current interface (lines 99-108):
```ts
export interface UpdateUserProfilePatch {
  name?: string;
  dateFormat?: string;
  currency?: string;
  distanceUnit?: string;
  passportNumber?: string | null;
  passportExpiry?: string;
  passportNationality?: string | null;
  knownTravelerNumber?: string | null;
}
```

Add after `distanceUnit`:
```ts
defaultCoverType?: CoverType;
```

The `CoverType` const object + union type already exists at lines 49-54:
```ts
export const CoverType = { Photo: "photo", Map: "map", Graphic: "graphic" } as const;
export type CoverType = (typeof CoverType)[keyof typeof CoverType];
```

No new imports needed — `CoverType` is already accessible within the same file.

### `src/lib/queries.ts` — getUserById SELECT

Current column list (lines 34-45):
```ts
.select({
  id: users.id,
  name: users.name,
  email: users.email,
  dateFormat: users.dateFormat,
  currency: users.currency,
  distanceUnit: users.distanceUnit,
  passportNumber: users.passportNumber,
  passportExpiry: users.passportExpiry,
  passportNationality: users.passportNationality,
  knownTravelerNumber: users.knownTravelerNumber,
})
```

Add after `knownTravelerNumber`:
```ts
defaultCoverType: users.defaultCoverType,
```

The column exists in the schema (`src/db/schema.ts` line 35: `defaultCoverType: text("default_cover_type")`). Drizzle will infer it as `string | null`. The `dbUserToType` mapper (already wired in `db-mappers.ts`) handles the null→undefined conversion and validates the value against `CoverType`.

**Important:** The spread `...user` in the return (line ~69) already passes through to `UserProfile.defaultCoverType` — no change needed to the return block. Just adding the column to the SELECT is sufficient.

### `src/app/(app)/profile/actions.ts` — updateProfile Validation

Add a validation block after the existing `distanceUnit` validation (line 47) and before `passportExpiry`:

```ts
if (patch.defaultCoverType !== undefined) {
  const validCoverTypes = Object.values(CoverType) as string[];
  if (!validCoverTypes.includes(patch.defaultCoverType)) {
    return { error: "Invalid cover type." };
  }
}
```

**Important:** Import `CoverType` from `@/data/types`. Add it to the existing type-only import on line 10-16:
```ts
import type {
  UpdateUserProfilePatch,
  AddLoyaltyNumberInput,
  AddWishlistDestinationInput,
  AddCompanionInput,
  UpdateCompanionPatch,
  CoverType,       // or import via the main import — check current imports
} from "@/data/types";
```

Wait — `CoverType` is a value (const object), not a type-only. Import it alongside the type imports:
```ts
import { CoverType } from "@/data/types";
```
Move `CoverType` out of the `import type` block and into a regular import, OR import it separately:
```ts
import { CoverType } from "@/data/types";
import type { UpdateUserProfilePatch, ... } from "@/data/types";
```

The `dbPatch` spread (`const dbPatch: ... = { ...patch }`) on line 52 already passes all keys through to the DB update — adding `defaultCoverType` to the patch type means it auto-persists. No change to the `db.update(users).set(dbPatch)` call is needed.

### `src/app/(app)/profile/preferences-section.tsx` — Cover Type Control

**Import addition:**
```ts
import { CoverType } from "@/data/types";
```

**Options constant (add after `DATE_FORMAT_OPTIONS`):**
```ts
const COVER_TYPE_OPTIONS = [
  { value: CoverType.Photo, label: "Photo" },
  { value: CoverType.Map, label: "Map" },
  { value: CoverType.Graphic, label: "Graphic" },
] as const;
```

**State addition (alongside existing state declarations):**
```ts
const [coverType, setCoverType] = useState(user.defaultCoverType ?? "photo");
```

**Update `computeDirty` signature and body** (currently takes 3 params, add 4th):
```ts
function computeDirty(dateFormat: string, currency: string, distanceUnit: string, coverType: string) {
  return (
    dateFormat !== (user.dateFormat ?? "MM/DD/YYYY") ||
    currency !== (user.currency ?? "") ||
    distanceUnit !== (user.distanceUnit ?? "imperial") ||
    coverType !== (user.defaultCoverType ?? "photo")
  );
}
```

Update all calls to `computeDirty` to pass the 4th argument:
```ts
onDirtyChange?.(computeDirty(next, currency, distanceUnit, coverType));
```

**Add handler:**
```ts
function handleCoverTypeChange(next: string) {
  setCoverType(next);
  onDirtyChange?.(computeDirty(dateFormat, currency, distanceUnit, next));
}
```

**Update `handleSave`** — add the cover type to the patch:
```ts
// After distanceUnit check:
if (coverType !== (user.defaultCoverType ?? "photo")) patch.defaultCoverType = coverType as CoverType;
```

**Update `isDirty` computation:**
```ts
const isDirty = computeDirty(dateFormat, currency, distanceUnit, coverType);
```

**JSX addition** — add a new `Field` + `ToggleGroup` after the distance units field and before the save button row:

```tsx
<Field label="Default trip cover type">
  <ToggleGroup
    aria-label="Default trip cover type"
    value={[coverType]}
    onValueChange={(arr) => arr[0] && handleCoverTypeChange(arr[0])}
  >
    {COVER_TYPE_OPTIONS.map((opt) => (
      <ToggleGroupItem key={opt.value} value={opt.value}>
        {opt.label}
      </ToggleGroupItem>
    ))}
  </ToggleGroup>
</Field>
```

**Cover type options mapping (value → label, both matching):**
- `"photo"` → label: "Photo"
- `"map"` → label: "Map"
- `"graphic"` → label: "Graphic"

Use the `CoverType` const object values for the `value` prop — don't hardcode strings.

### `mockUser` in Tests — Needs `defaultCoverType`

The existing `mockUser` in `preferences-section.test.tsx` (line 15-29) does NOT include `defaultCoverType`. Add it:

```ts
const mockUser: UserProfile = {
  // ... existing fields ...
  defaultCoverType: undefined,
};
```

### Testing — `preferences-section.test.tsx`

New tests to add inside the existing `describe("ProfilePreferencesSection", ...)` block after the existing tests:

```ts
it("renders cover type toggle with three options", () => {
  render(<ProfilePreferencesSection user={mockUser} />);
  expect(screen.getByText("Default trip cover type")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Photo" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Map" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Graphic" })).toBeInTheDocument();
});

it("Photo is selected by default when no preference saved", () => {
  render(<ProfilePreferencesSection user={mockUser} />);
  expect(screen.getByRole("button", { name: "Photo" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Map" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("button", { name: "Graphic" })).toHaveAttribute("aria-pressed", "false");
});

it("changing cover type enables Save, and toggle reflects new value", async () => {
  render(<ProfilePreferencesSection user={mockUser} />);
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Map" }));
  expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
  expect(screen.getByRole("button", { name: "Photo" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("button", { name: "Map" })).toHaveAttribute("aria-pressed", "true");
});

it("saves cover type patch when changed", async () => {
  render(<ProfilePreferencesSection user={mockUser} />);
  await userEvent.click(screen.getByRole("button", { name: "Map" }));
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(vi.mocked(actions.updateProfile)).toHaveBeenCalledWith({ defaultCoverType: "map" });
});

it("saves graphic cover type patch", async () => {
  render(<ProfilePreferencesSection user={mockUser} />);
  await userEvent.click(screen.getByRole("button", { name: "Graphic" }));
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(vi.mocked(actions.updateProfile)).toHaveBeenCalledWith({ defaultCoverType: "graphic" });
});

it("renders with saved Graphic preference selected", () => {
  const userWithGraphic: UserProfile = { ...mockUser, defaultCoverType: "graphic" };
  render(<ProfilePreferencesSection user={userWithGraphic} />);
  expect(screen.getByRole("button", { name: "Graphic" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Photo" })).toHaveAttribute("aria-pressed", "false");
});
```

**Important:** The existing "sends only currency when only currency changes" test at line 87 expects `updateProfile` to have been called with `{ currency: "EUR" }`. Since coverType state is `"photo"` and `mockUser.defaultCoverType` is `undefined`, the cover type IS different from the default. The user only changed currency, so the test will fail because `defaultCoverType` will also be in the patch.

**Fix:** Update `mockUser` to include `defaultCoverType: "photo"` — this makes the cover type match the default, so it won't be included in the patch when only currency changes.

### Testing — `actions.test.ts`

Open `src/app/(app)/profile/actions.test.ts` and add cover type validation tests to the existing `updateProfile` describe block:

```ts
it("rejects invalid defaultCoverType", async () => {
  const result = await updateProfile({ defaultCoverType: "invalid" as CoverType });
  expect(result).toEqual({ error: "Invalid cover type." });
});

it('accepts valid defaultCoverType "photo"', async () => {
  const result = await updateProfile({ defaultCoverType: "photo" });
  expect(result).toEqual({});
});

it('accepts valid defaultCoverType "map"', async () => {
  const result = await updateProfile({ defaultCoverType: "map" });
  expect(result).toEqual({});
});

it('accepts valid defaultCoverType "graphic"', async () => {
  const result = await updateProfile({ defaultCoverType: "graphic" });
  expect(result).toEqual({});
});
```

**Import `CoverType` in the test file** so it can be used in the invalid-CoverType test:
```ts
import { CoverType } from "@/data/types";
```

### Coverage Impact

- `src/app/(app)/profile/actions.ts` — excluded from coverage (`src/app/**`). Tests still required.
- `src/app/(app)/profile/preferences-section.tsx` — also excluded (`src/app/**`). Tests still required.
- `src/lib/queries.ts` — excluded from coverage. No test change needed for the SELECT addition.
- `src/data/types.ts` — no runtime code, no coverage.

### Regression Risks

1. **Existing `preferences-section.test.tsx` tests** — The "sends only currency when only currency changes" test will break if `mockUser.defaultCoverType` is not explicitly set to `"photo"` (matching the initial state default). Fix by adding `defaultCoverType: "photo"` to `mockUser`.

2. **Existing `actions.test.ts` tests** — The `updateProfile` validation already handles optional fields with `!== undefined` guards. Adding a new validation block for `defaultCoverType` won't affect existing tests. `db.update(users).set(dbPatch)` spreads all patch keys — `defaultCoverType` will be included when set.

3. **`getUserById` callers** — The profile page server component `page.tsx` calls `getUserById` and passes the result to `ProfilePageClient` → `ProfilePreferencesSection`. Adding a column to the SELECT is backward-compatible — existing callers just get extra data. No behavioral changes.

4. **`createTrip` defaultCoverType query** — Already queries the DB directly (not via `getUserById`). This story doesn't change that path — it only exposes the preference in the UI. ACs 5-9 are pre-verified from Story 1.3.

### Project Structure Notes

- **Profile sections**: Profile subcomponents are colocated under `src/app/(app)/profile/` (not in `src/components/packt/`), following the existing pattern for `preferences-section.tsx`, `identity-section.tsx`, etc.
- **Server actions**: Profile actions live in `src/app/(app)/profile/actions.ts` — separate from trip actions at `src/app/(app)/trips/actions.ts`.
- **`UpdateUserProfilePatch`** is the canonical patch type for user profile updates, defined in `src/data/types.ts`. It maps directly to the `updateProfile` server action.
- **`ToggleGroup`** + **`ToggleGroupItem`** from `@/components/ui/toggle-group` — already used for date format and distance unit preferences. Use the same pattern for cover type.

### References

- Epics file: `_bmad-output/epics-cover-image.md` — Story 1.5 ACs
- Types: `src/data/types.ts` — `UpdateUserProfilePatch` (line 99), `CoverType` (line 49), `UserProfile.defaultCoverType` (line 93)
- Query: `src/lib/queries.ts` — `getUserById` SELECT (lines 34-45)
- Profile action: `src/app/(app)/profile/actions.ts` — `updateProfile` (line 21)
- Profile component: `src/app/(app)/profile/preferences-section.tsx` — current toggle pattern (lines 74-127)
- Profile test: `src/app/(app)/profile/preferences-section.test.tsx` — test assertions (as-is, then augmented)
- Action test: `src/app/(app)/profile/actions.test.ts` — validation tests
- Existing cover type consumption: `src/app/(app)/trips/actions.ts` — `createTrip` lines 186-190
- Story 1.3 (previous): `_bmad-output/1-3-destination-autocomplete-and-auto-cover-on-create.md` — established `defaultCoverType` consumption in `createTrip`
- Project conventions: `_bmad-output/project-context.md`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- `npx vitest run 'src/app/(app)/profile/preferences-section.test.tsx' 'src/app/(app)/profile/actions.test.ts' 'src/lib/db-mappers.test.ts' 'src/app/(app)/trips/actions.test.ts'` — 149 passed
- `npm run lint && npx tsc --noEmit` — clean
- `npm run test:coverage` — 1089 passed, all thresholds met (95.18% stmts, 90.25% branches)

### Completion Notes List

- Renamed `CoverType` const values from implementation-specific (`unsplash`/`mapbox`) to UI-facing (`photo`/`map`). All ripple sites updated.
- Added `defaultCoverType` to `UpdateUserProfilePatch` and `getUserById` SELECT. Added `parseCoverType()` helper in queries.ts to safely coerce `string | null` → `CoverType | undefined`.
- Added `CoverType` validation block to `updateProfile` server action.
- Added `COVER_TYPE_OPTIONS`, `coverType` state, `handleCoverTypeChange`, updated `computeDirty` (4 params), `handleSave`, and a new `ToggleGroup` Field to `preferences-section.tsx`.
- Updated `mockUser.defaultCoverType = "photo"` in preferences test to prevent false dirty-patch in existing "sends only currency" test.
- 6 new cover type tests in `preferences-section.test.tsx`; 4 new validation tests in `actions.test.ts`.

### File List

- src/data/types.ts
- src/lib/queries.ts
- src/app/(app)/profile/actions.ts
- src/app/(app)/profile/preferences-section.tsx
- src/app/(app)/profile/preferences-section.test.tsx
- src/app/(app)/profile/actions.test.ts
- src/lib/db-mappers.test.ts
- src/app/(app)/trips/actions.ts
- src/app/(app)/trips/actions.test.ts

- src/data/types.ts
- src/lib/queries.ts
- src/app/(app)/profile/actions.ts
- src/app/(app)/profile/preferences-section.tsx
- src/app/(app)/profile/preferences-section.test.tsx
- src/app/(app)/profile/actions.test.ts
