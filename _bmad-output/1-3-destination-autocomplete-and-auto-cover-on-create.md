# Story 1.3: Destination Autocomplete & Auto-Cover on Create

Status: done

## Story

As a traveler,
I want to type a destination when creating a trip and have a cover automatically applied based on my preference,
so that my new trip immediately has a relevant visual identity without any extra steps.

## Acceptance Criteria

1. **Given** the NewTripDialog is open — **Then** a "Destination" autocomplete field appears below the title field

2. **Given** I type at least 2 characters in the destination field — **When** 300ms have elapsed since the last keystroke — **Then** `searchLocations` is called and a dropdown of up to 5 location suggestions appears below the field

3. **Given** the dropdown is open and I click a suggestion — **Then** the field shows the selected `placeName`, the dropdown closes, and destination data (name, country, countryCode, center coordinates) is held in component state

4. **Given** I type in the destination field but do not select from the dropdown — **Then** the destination is treated as unset — no image will be fetched on create

5. **Given** the Mapbox API returns an error during autocomplete — **Then** a `toast.error("Could not search locations")` is shown and the field remains usable

6. **Given** I click Create with a destination selected — **Then** the Create button shows a loading spinner and is not clickable a second time

7. **Given** `createTrip` runs server-side with a destination and `defaultCoverType` is `"unsplash"` or null — **Then** `searchCoverImages(destinationName)` is called; the first result URL is stored as `coverImageUrl`

8. **Given** `createTrip` runs server-side with a destination and `defaultCoverType` is `"mapbox"` — **Then** a Mapbox static map tile URL is constructed from the destination coordinates and stored as `coverImageUrl`

9. **Given** `createTrip` runs server-side with a destination and `defaultCoverType` is `"graphic"` — **Then** a color and icon are derived by hashing the trip title against the palette and icon arrays; the result is encoded as `graphic:{color}/{icon}` and stored as `coverImageUrl`; no external API call is made

10. **Given** `createTrip` runs server-side with a destination — **When** any API call fails (Unsplash or Mapbox) — **Then** the trip is created without a cover image; no error is surfaced and creation succeeds

11. **Given** `createTrip` runs with no destination selected — **Then** no image fetch is attempted; `coverImageUrl` remains null

12. **Given** `updateTripMetadata` receives destination fields in the patch — **Then** the three destination columns are updated in the DB — **And** `coverImageUrl` is never auto-modified by `updateTripMetadata`

13. **Given** `src/components/packt/new-trip-dialog.test.tsx` — **Then** tests verify: destination field renders, debounced search fires after 300ms, selecting a suggestion populates the field, typing without selecting does not set destination, loading state shows on submit, Mapbox API error shows toast

## Tasks / Subtasks

- [x] Add `destinationCenter` to `NewTripDraft` and `CreateTripInput` in `src/data/types.ts` (AC: 3, 8)
  - [x] Add `destinationCenter?: [number, number]` to `NewTripDraft`
  - [x] Add `destinationCenter?: [number, number]` to `CreateTripInput`

- [x] Add graphic cover helpers to `src/lib/utils.ts` (AC: 9)
  - [x] Export `GRAPHIC_COVER_COLORS: readonly string[]` — 10 color swatches (see Dev Notes)
  - [x] Export `GRAPHIC_COVER_ICONS: readonly string[]` — 19 Lucide travel icon names (see Dev Notes)
  - [x] Export `deriveGraphicCover(title: string): string` — hash title → `graphic:{color}/{icon}`
  - [x] Add unit tests for `deriveGraphicCover` in `src/lib/utils.test.ts`

- [x] Export `LocationSuggestion` interface from `src/app/(app)/trips/actions.ts` (AC: 3)
  - [x] Change `interface LocationSuggestion` to `export interface LocationSuggestion`

- [x] Add destination autocomplete to `src/components/packt/new-trip-dialog.tsx` (AC: 1–6)
  - [x] Import `searchLocations` from `@/app/(app)/trips/actions` and `toast` from `sonner`
  - [x] Import `type LocationSuggestion` from `@/app/(app)/trips/actions`
  - [x] Add `destinationInput: string`, `destinationData: LocationSuggestion | null`, `highlightedIndex: number` state variables
  - [x] Add `suggestions: LocationSuggestion[]` and `suggestionsLoading: boolean` state variables
  - [x] Add `useEffect` debounce (300ms) on `destinationInput` → call `searchLocations` when ≥2 chars
  - [x] On suggestion click / Enter-on-highlight: set `destinationData`, set `destinationInput = placeName`, clear suggestions, reset `highlightedIndex`
  - [x] On text input change: clear `destinationData` to invalidate any prior selection
  - [x] Add `ArrowDown` / `ArrowUp` keyboard handlers on the input to move `highlightedIndex` through suggestions
  - [x] Add `Escape` handler on the input: clear `suggestions` + reset `highlightedIndex`, return focus to input
  - [x] Add `Enter` handler: if `highlightedIndex ≥ 0` call `handleSuggestionSelect(suggestions[highlightedIndex])`
  - [x] Add "Destination" `Field` in the Basics `Section`, directly below the Title field (see ARIA spec in Dev Notes)
  - [x] On form submit: pass destination fields (name, country, countryCode, center) from `destinationData` into the `NewTripDraft` passed to `onCreate`
  - [x] On dialog close/reset: clear all destination state alongside `draft` and `titleError`

- [x] Thread destination fields through `src/app/(app)/trips/use-trips-page-handlers.ts` (AC: 7–11)
  - [x] In `submitCreateTrip`: add `destinationName`, `destinationCountry`, `destinationCountryCode`, `destinationCenter` from draft to `createTrip` input

- [x] Modify `createTrip` in `src/app/(app)/trips/actions.ts` (AC: 7–11)
  - [x] Add destination fields to the DB `.insert(trips).values(...)` call
  - [x] After the transaction completes (before `revalidatePath`/`redirect`): if `input.destinationName` is set, fetch cover image
    - [x] Query `users.defaultCoverType` for the authenticated user
    - [x] Branch on cover type: unsplash/null → call `searchCoverImages`, mapbox → construct tile URL, graphic → call `deriveGraphicCover`
    - [x] Wrap entire cover fetch in try/catch — silently swallow ALL errors (never block creation)
    - [x] If `coverUrl` obtained: `db.update(trips).set({ coverImageUrl: coverUrl }).where(eq(trips.id, tripId))`

- [x] Fix `updateTripMetadata` in `src/app/(app)/trips/actions.ts` (AC: 12)
  - [x] Add `destinationName: patch.destinationName`, `destinationCountry: patch.destinationCountry`, `destinationCountryCode: patch.destinationCountryCode` to the `.set({...})` call in the transaction
  - [x] Confirm `coverImageUrl` is only updated when explicitly in patch (Drizzle drops `undefined` fields — verify this is already working correctly)

- [x] Update tests in `src/components/packt/new-trip-dialog.test.tsx` (AC: 13)
  - [x] Add `vi.mock("@/app/(app)/trips/actions", ...)` for `searchLocations`
  - [x] Add `vi.mock("sonner", ...)` for `toast.error`
  - [x] Use `vi.useFakeTimers()` / `vi.runAllTimers()` for debounce tests
  - [x] Add test: destination field renders
  - [x] Add test: debounced search fires after 300ms (not before)
  - [x] Add test: selecting a suggestion populates the field and sets destination
  - [x] Add test: typing after a selection clears destination data (draft submitted without destination)
  - [x] Add test: API error shows `toast.error("Could not search locations")`
  - [x] Add test: ArrowDown moves highlight, Enter selects highlighted suggestion
  - [x] Add test: Escape closes dropdown without selecting

- [x] Add E2E scenario for destination autocomplete (AC: 1–4)
  - [x] Add scenario to `tests/e2e/features/create-trip.feature`: "Create a trip with a destination populates the destination field and creates the trip"
  - [x] Add `page.route()` intercept for Mapbox Geocoding API in the step setup to return a fixed suggestion (avoid real network call in CI)
  - [x] Add step definitions in `tests/e2e/steps/create-trip.ts` for: typing a destination, waiting for dropdown, selecting a suggestion, verifying field value, and verifying the trip is created

---

## Dev Notes

### File Overview — Every File That Changes

| File | Operation | Notes |
|------|-----------|-------|
| `src/data/types.ts` | UPDATE | Add `destinationCenter` to `NewTripDraft` + `CreateTripInput` |
| `src/lib/utils.ts` | UPDATE | Add `GRAPHIC_COVER_COLORS`, `GRAPHIC_COVER_ICONS`, `deriveGraphicCover` |
| `src/lib/utils.test.ts` | UPDATE | Add `deriveGraphicCover` tests |
| `src/app/(app)/trips/actions.ts` | UPDATE | Export `LocationSuggestion`; modify `createTrip`; fix `updateTripMetadata` |
| `src/app/(app)/trips/use-trips-page-handlers.ts` | UPDATE | Pass destination fields in `submitCreateTrip` |
| `src/components/packt/new-trip-dialog.tsx` | UPDATE | Add destination autocomplete field + state |
| `src/components/packt/new-trip-dialog.test.tsx` | UPDATE | Add autocomplete unit tests |
| `tests/e2e/features/create-trip.feature` | UPDATE | Add destination autocomplete scenario |
| `tests/e2e/steps/create-trip.ts` | UPDATE | Add step definitions for destination steps |

No new files. All work is additive to existing files.

---

### `src/data/types.ts` Changes

`NewTripDraft` currently:
```ts
export interface NewTripDraft {
  title: string;
  startDate?: string;
  endDate?: string;
  budgetAmount?: string;
  destinationName?: string;
  destinationCountry?: string;
  destinationCountryCode?: string;
}
```

Add `destinationCenter?: [number, number]` — this carries the lat/lng from `searchLocations` through to `createTrip` for Mapbox tile URL construction. It is NOT stored in the DB.

Same addition to `CreateTripInput` (already has the three destination text fields; add center).

---

### `src/lib/utils.ts` — Graphic Cover Constants and Derivation

Current file is 130 lines. Adding ~40 lines keeps it under the 250-line limit.

**Define these constants and function at the bottom of the file, after `parseGraphicCover`:**

```ts
// ── Graphic cover generation ──────────────────────────────────────────────────

/**
 * Ordered list of background color values for graphic trip covers.
 * Used both for auto-generation (deriveGraphicCover) and the Custom tab picker.
 * Stored as-is in the DB inside `graphic:{color}/{icon}` URLs.
 * TripCover (Story 1.4) uses these values directly in SVG fill attributes.
 */
export const GRAPHIC_COVER_COLORS = [
  "var(--accent-brand)",
  "var(--color-indigo-500)",
  "var(--color-pink-500)",
  "var(--color-teal-500)",
  "var(--color-amber-500)",
  "var(--color-red-500)",
  "var(--color-emerald-500)",
  "var(--color-slate-500)",
  "var(--color-violet-500)",
  "var(--color-orange-500)",
] as const;

/**
 * Ordered list of Lucide icon names for graphic trip covers.
 * Used both for auto-generation and the Custom tab picker.
 * TripCover (Story 1.4) resolves these to the corresponding Lucide component.
 */
export const GRAPHIC_COVER_ICONS = [
  "plane",
  "map",
  "compass",
  "camera",
  "tent-tree",
  "ship",
  "backpack",
  "luggage",
  "bus",
  "car",
  "mountain",
  "tree-palm",
  "hotel",
  "road",
  "van",
  "caravan",
  "map-pin",
  "map-pinned",
  "trees",
] as const;

/**
 * Deterministically derives a graphic cover string for a trip title.
 * Uses a simple djb2 hash to pick a color and icon from the palettes.
 * Returns a string in the format `graphic:{color}/{icon}`.
 */
export function deriveGraphicCover(title: string): string {
  let hash = 5381;
  for (let index = 0; index < title.length; index++) {
    hash = ((hash << 5) + hash) ^ title.charCodeAt(index);
    hash = hash >>> 0; // keep as unsigned 32-bit
  }
  const color = GRAPHIC_COVER_COLORS[hash % GRAPHIC_COVER_COLORS.length];
  // use a different slice of the hash for icon to avoid same-index results
  const iconHash = (hash * 2654435761) >>> 0;
  const icon = GRAPHIC_COVER_ICONS[iconHash % GRAPHIC_COVER_ICONS.length];
  return `graphic:${color}/${icon}`;
}
```

**Note on color values:** Using bare CSS variable references. Tailwind v4 exposes `--color-*` tokens globally via `@theme inline` — they resolve to actual color values without fallbacks. `var(--accent-brand)` is a Packt design token. No hex fallbacks — the project rule "no hardcoded hex/rgb" applies. If a variable is unavailable (e.g., in a test context without CSS), the SVG fill will simply be empty; that is acceptable.

**Unit tests to add in `src/lib/utils.test.ts`:**
```ts
describe("deriveGraphicCover", () => {
  it("returns a string in graphic:{color}/{icon} format", () => {
    const result = deriveGraphicCover("Tokyo");
    expect(result).toMatch(/^graphic:.+\/.+$/);
  });

  it("is deterministic — same title produces same result", () => {
    expect(deriveGraphicCover("Paris")).toBe(deriveGraphicCover("Paris"));
  });

  it("produces different results for different titles", () => {
    // Not guaranteed by hash collision probability but holds for these inputs
    expect(deriveGraphicCover("Tokyo")).not.toBe(deriveGraphicCover("Paris"));
  });

  it("returns a valid color from GRAPHIC_COVER_COLORS", () => {
    const { color } = parseGraphicCover(deriveGraphicCover("London"))!;
    expect(GRAPHIC_COVER_COLORS).toContain(color);
  });

  it("returns a valid icon from GRAPHIC_COVER_ICONS", () => {
    const { icon } = parseGraphicCover(deriveGraphicCover("New York"))!;
    expect(GRAPHIC_COVER_ICONS).toContain(icon);
  });

  it("handles empty string without throwing", () => {
    expect(() => deriveGraphicCover("")).not.toThrow();
  });
});
```

---

### `src/app/(app)/trips/actions.ts` — Two Changes

#### 1. Export `LocationSuggestion`

Line 431 currently reads `interface LocationSuggestion`. Change to:
```ts
export interface LocationSuggestion {
```
No other changes to the interface. The component imports it with `import type { LocationSuggestion }`.

#### 2. Modify `createTrip`

**Current signature:** `export async function createTrip(input: CreateTripInput)`

**Current DB insert** (lines 148–162) does NOT include destination fields. Add them:
```ts
const [trip] = await tx
  .insert(trips)
  .values({
    ownerId: user.id!,
    name: input.name,
    startDate: input.startDate,
    endDate: input.endDate,
    coverImageUrl: input.coverImageUrl,
    destinationName: input.destinationName,           // ADD
    destinationCountry: input.destinationCountry,     // ADD
    destinationCountryCode: input.destinationCountryCode, // ADD
    notes: input.notes,
    budgetCurrency: input.budgetCurrency,
    budgetTotal: input.budgetTotal?.toString(),
    budgetPerPerson: input.budgetPerPerson?.toString(),
    tags: input.tags ?? [],
  })
  .returning();
```

**After the `db.transaction(...)` call** (currently `tripId` is set), add the auto-cover block BEFORE `revalidatePath`:

```ts
// Auto-cover image fetch after trip is created
if (input.destinationName) {
  const [userRow] = await db
    .select({ defaultCoverType: users.defaultCoverType })
    .from(users)
    .where(eq(users.id, user.id!));
  const coverType = userRow?.defaultCoverType ?? "unsplash";

  let coverUrl: string | null = null;
  try {
    if (coverType === "mapbox" && input.destinationCenter) {
      const [lng, lat] = input.destinationCenter;
      const token = process.env.MAPBOX_ACCESS_TOKEN ?? "";
      coverUrl = `https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/static/${lng},${lat},10/600x400@2x?access_token=${token}`;
    } else if (coverType === "graphic") {
      coverUrl = deriveGraphicCover(input.name);
    } else {
      // "unsplash" (default) or any unknown value
      const images = await searchCoverImages(input.destinationName);
      coverUrl = images[0]?.url ?? null;
    }
  } catch {
    // Silent failure — trip is created without a cover; creation is never blocked
  }

  if (coverUrl) {
    await db.update(trips).set({ coverImageUrl: coverUrl }).where(eq(trips.id, tripId));
  }
}

revalidatePath("/trips");
redirect(`/trips/${tripId}?new=1`);
```

**Important:** The try/catch around cover fetch must NOT catch the `redirect()` call (which throws a special "NEXT_REDIRECT" error). Since `redirect` is called AFTER the try/catch block completes, this is safe. The `coverUrl` try/catch only wraps the cover fetch.

**New imports needed at the top of `actions.ts`:**
- Add `users` to the existing Drizzle schema import: `import { trips, collaborators, ..., users } from "@/db/schema"`
- Add `deriveGraphicCover` import: `import { deriveGraphicCover } from "@/lib/utils"`

**`searchCoverImages` is already defined in the same file** — no import needed; it can be called directly. Note that it internally calls `requireUser()` — this is redundant but harmless since we're already authenticated. The double `requireUser()` reads from session cache and is fast.

#### 3. Fix `updateTripMetadata`

In the `.set({...})` call inside `db.transaction` (around line 303), add three fields:
```ts
await transaction.update(trips).set({
  name: patch.name,
  startDate: desiredDayRows[0]?.date ?? null,
  endDate: desiredDayRows.at(-1)?.date ?? null,
  coverImageUrl: patch.coverImageUrl,
  destinationName: patch.destinationName,           // ADD
  destinationCountry: patch.destinationCountry,     // ADD
  destinationCountryCode: patch.destinationCountryCode, // ADD
  notes: patch.notes,
  budgetCurrency: patch.budgetCurrency,
  budgetTotal: patch.budgetTotal?.toString(),
  budgetPerPerson: patch.budgetPerPerson?.toString(),
  tags: patch.tags,
  updatedAt: new Date(),
}).where(eq(trips.id, tripId));
```

`coverImageUrl` is only updated when `patch.coverImageUrl` is explicitly set; Drizzle silently drops `undefined` values from UPDATE statements, so this already satisfies the "never auto-modify coverImageUrl" requirement.

---

### `src/app/(app)/trips/use-trips-page-handlers.ts` — Thread Destination Fields

Current `submitCreateTrip` (line 82–96):
```ts
async function submitCreateTrip(draft: NewTripDraft) {
  startCreation(async () => {
    try {
      await createTrip({
        name: draft.title,
        startDate: draft.startDate,
        endDate: draft.endDate,
        budgetTotal: draft.budgetAmount ? parseFloat(draft.budgetAmount) : undefined,
      });
    } catch (e) {
      if (e && typeof e === "object" && "digest" in e) throw e;
      toast.error("Failed to create trip. Please try again.");
    }
  });
}
```

Add the four destination fields:
```ts
await createTrip({
  name: draft.title,
  startDate: draft.startDate,
  endDate: draft.endDate,
  budgetTotal: draft.budgetAmount ? parseFloat(draft.budgetAmount) : undefined,
  destinationName: draft.destinationName,
  destinationCountry: draft.destinationCountry,
  destinationCountryCode: draft.destinationCountryCode,
  destinationCenter: draft.destinationCenter,
});
```

No other changes to this file.

---

### `src/components/packt/new-trip-dialog.tsx` — Destination Autocomplete

**Current file is 138 lines.** Adding autocomplete will push it to ~215 lines — still within the 250-line limit.

**Imports to add:**
```ts
import { searchLocations } from "@/app/(app)/trips/actions";
import type { LocationSuggestion } from "@/app/(app)/trips/actions";
import { toast } from "sonner";
```

**State to add (alongside existing `draft`, `titleError`):**
```ts
const [destinationInput, setDestinationInput] = useState("");
const [destinationData, setDestinationData] = useState<LocationSuggestion | null>(null);
const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
const [suggestionsLoading, setSuggestionsLoading] = useState(false);
const [highlightedIndex, setHighlightedIndex] = useState(-1);
```

**Debounce effect (add alongside the existing title focus `useEffect`):**
```ts
useEffect(() => {
  if (destinationInput.trim().length < 2) {
    setSuggestions([]);
    return;
  }
  const timer = window.setTimeout(async () => {
    setSuggestionsLoading(true);
    try {
      const results = await searchLocations(destinationInput);
      setSuggestions(results);
    } catch {
      toast.error("Could not search locations");
      setSuggestions([]);
    } finally {
      setSuggestionsLoading(false);
    }
  }, 300);
  return () => window.clearTimeout(timer);
}, [destinationInput]);
```

**Handler to add:**
```ts
function handleSuggestionSelect(suggestion: LocationSuggestion) {
  setDestinationInput(suggestion.placeName);
  setDestinationData(suggestion);
  setSuggestions([]);
  setHighlightedIndex(-1);
}
```

**Keyboard handler to add on the destination `<Input>`:**
```ts
function handleDestinationKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
  if (suggestions.length === 0) return;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    setHighlightedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    setHighlightedIndex((prev) => Math.max(prev - 1, 0));
  } else if (event.key === "Enter" && highlightedIndex >= 0) {
    event.preventDefault(); // prevent form submit
    handleSuggestionSelect(suggestions[highlightedIndex]);
  } else if (event.key === "Escape") {
    setSuggestions([]);
    setHighlightedIndex(-1);
  }
}
```

**Update `closeDialog` to also reset destination state:**
```ts
function closeDialog() {
  setDraft(EMPTY_DRAFT);
  setTitleError("");
  setDestinationInput("");
  setDestinationData(null);
  setSuggestions([]);
  onOpenChange(false);
}
```

**Update `handleSubmit` to include destination in draft passed to `onCreate`:**
```ts
if (onCreate) {
  onCreate({
    title,
    startDate: draft.startDate,
    endDate: draft.endDate,
    budgetAmount: draft.budgetAmount?.replace(/\.$/, "") || undefined,
    destinationName: destinationData?.placeName,
    destinationCountry: destinationData?.country,
    destinationCountryCode: destinationData?.countryCode,
    destinationCenter: destinationData?.center,
  });
  return;
}
```

**JSX — add "Destination" field below "Title" in the Basics Section (ARIA combobox pattern):**

```tsx
<Section title="Basics">
  <Field label="Title" htmlFor="new-trip-title" error={titleError}>
    <Input
      id="new-trip-title"
      ref={titleRef}
      value={draft.title}
      aria-invalid={titleError ? true : undefined}
      aria-describedby={titleError ? "new-trip-title-error" : undefined}
      onChange={(event) => {
        setDraft((prev) => ({ ...prev, title: event.target.value }));
        if (titleError) setTitleError("");
      }}
    />
  </Field>

  <Field label="Destination" htmlFor="new-trip-destination">
    <div style={{ position: "relative" }}>
      <Input
        id="new-trip-destination"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={suggestions.length > 0}
        aria-controls="destination-suggestions"
        aria-haspopup="listbox"
        aria-activedescendant={
          highlightedIndex >= 0
            ? `destination-suggestion-${highlightedIndex}`
            : undefined
        }
        value={destinationInput}
        placeholder="Optional destination"
        autoComplete="off"
        onChange={(event) => {
          setDestinationInput(event.target.value);
          setDestinationData(null); // invalidate prior selection on any edit
          setHighlightedIndex(-1);
        }}
        onKeyDown={handleDestinationKeyDown}
      />
      {suggestions.length > 0 && (
        <ul
          id="destination-suggestions"
          role="listbox"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 10,
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: 6,
            marginTop: 2,
            padding: 4,
            listStyle: "none",
          }}
        >
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion.placeName}
              id={`destination-suggestion-${index}`}
              role="option"
              aria-selected={highlightedIndex === index}
              style={{
                padding: "6px 8px",
                borderRadius: 4,
                fontSize: "calc(13px * var(--font-scale))",
                color: "var(--fg)",
                background: highlightedIndex === index ? "var(--accent-soft)" : "transparent",
                cursor: "pointer",
              }}
              onMouseDown={(event) => {
                event.preventDefault(); // prevent input blur before click registers
                handleSuggestionSelect(suggestion);
              }}
            >
              {suggestion.placeName}
            </li>
          ))}
        </ul>
      )}
    </div>
  </Field>
</Section>
```

**Key UX rules:**
- `role="combobox"` on the input with `aria-expanded`, `aria-controls`, `aria-activedescendant` — correct ARIA combobox pattern
- `role="option"` on each `<li>` with `aria-selected` — required children of `role="listbox"`
- `onMouseDown` with `event.preventDefault()` on each option — prevents the input from losing focus before the click fires, which would cause the dropdown to close before selection registers
- `autoComplete="off"` prevents the browser from interfering with the custom dropdown
- No `<button>` inside the listbox — options are directly `<li role="option">` with mouse and keyboard handling on the input
- Typing in the destination field clears `destinationData` immediately (free-text does not count as a selection)

---

### `src/components/packt/new-trip-dialog.test.tsx` — New Tests

**Add to the existing mocks at the top (before the component import):**
```ts
const mockSearchLocations = vi.fn();
vi.mock("@/app/(app)/trips/actions", () => ({
  searchLocations: mockSearchLocations,
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
```

**Import mock toast reference:**
```ts
import { toast } from "sonner";
```

**Test cases to add (inside or alongside the existing `describe("NewTripDialog", ...)`)**:

```ts
describe("NewTripDialog — destination autocomplete", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockSearchLocations.mockResolvedValue([
      { placeName: "Paris, Île-de-France, France", country: "France", countryCode: "FR", center: [2.35, 48.85] },
      { placeName: "Paris, Texas, United States", country: "United States", countryCode: "US", center: [-95.55, 33.66] },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("renders the destination field", () => {
    render(<NewTripDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByLabelText(/destination/i)).toBeInTheDocument();
  });

  it("does NOT call searchLocations before 300ms debounce", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<NewTripDialog open onOpenChange={vi.fn()} />);
    await user.type(screen.getByLabelText(/destination/i), "Par");
    expect(mockSearchLocations).not.toHaveBeenCalled();
  });

  it("calls searchLocations after 300ms debounce", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<NewTripDialog open onOpenChange={vi.fn()} />);
    await user.type(screen.getByLabelText(/destination/i), "Par");
    vi.advanceTimersByTime(300);
    await vi.runAllTimersAsync();
    await waitFor(() => expect(mockSearchLocations).toHaveBeenCalledWith("Par"));
  });

  it("shows suggestion dropdown after search resolves", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<NewTripDialog open onOpenChange={vi.fn()} />);
    await user.type(screen.getByLabelText(/destination/i), "Par");
    vi.advanceTimersByTime(300);
    await vi.runAllTimersAsync();
    await waitFor(() =>
      expect(screen.getByText("Paris, Île-de-France, France")).toBeInTheDocument()
    );
  });

  it("selecting a suggestion populates the input and sets destination data", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onCreate = vi.fn();
    render(<NewTripDialog open onOpenChange={vi.fn()} onCreate={onCreate} />);
    await user.type(screen.getByLabelText(/title/i), "Europe Trip");
    await user.type(screen.getByLabelText(/destination/i), "Par");
    vi.advanceTimersByTime(300);
    await vi.runAllTimersAsync();
    await waitFor(() => screen.getByText("Paris, Île-de-France, France"));
    await user.click(screen.getByText("Paris, Île-de-France, France"));
    expect(screen.getByLabelText(/destination/i)).toHaveValue("Paris, Île-de-France, France");
    // Submit and verify destination fields are passed
    await user.click(screen.getByRole("button", { name: /create/i }));
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationName: "Paris, Île-de-France, France",
        destinationCountry: "France",
        destinationCountryCode: "FR",
        destinationCenter: [2.35, 48.85],
      })
    );
  });

  it("typing without selecting does not set destination (submitted without destination)", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onCreate = vi.fn();
    render(<NewTripDialog open onOpenChange={vi.fn()} onCreate={onCreate} />);
    await user.type(screen.getByLabelText(/title/i), "Somewhere");
    await user.type(screen.getByLabelText(/destination/i), "Par");
    vi.advanceTimersByTime(300);
    await vi.runAllTimersAsync();
    // Do NOT click a suggestion — just submit
    await user.click(screen.getByRole("button", { name: /create/i }));
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationName: undefined,
        destinationCountry: undefined,
        destinationCountryCode: undefined,
        destinationCenter: undefined,
      })
    );
  });

  it("shows toast error when searchLocations throws", async () => {
    mockSearchLocations.mockRejectedValue(new Error("Mapbox down"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<NewTripDialog open onOpenChange={vi.fn()} />);
    await user.type(screen.getByLabelText(/destination/i), "Par");
    vi.advanceTimersByTime(300);
    await vi.runAllTimersAsync();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Could not search locations")
    );
  });

  it("ArrowDown highlights the first suggestion, Enter selects it", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onCreate = vi.fn();
    render(<NewTripDialog open onOpenChange={vi.fn()} onCreate={onCreate} />);
    await user.type(screen.getByLabelText(/title/i), "Trip");
    await user.type(screen.getByLabelText(/destination/i), "Par");
    vi.advanceTimersByTime(300);
    await vi.runAllTimersAsync();
    await waitFor(() => screen.getByRole("option", { name: /Paris, Île-de-France/i }));
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");
    expect(screen.getByLabelText(/destination/i)).toHaveValue("Paris, Île-de-France, France");
    await user.click(screen.getByRole("button", { name: /create/i }));
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ destinationName: "Paris, Île-de-France, France" })
    );
  });

  it("Escape closes the dropdown without selecting", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<NewTripDialog open onOpenChange={vi.fn()} />);
    await user.type(screen.getByLabelText(/destination/i), "Par");
    vi.advanceTimersByTime(300);
    await vi.runAllTimersAsync();
    await waitFor(() => screen.getByRole("listbox"));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    // Field retains typed text but destination data is not set
    expect(screen.getByLabelText(/destination/i)).toHaveValue("Par");
  });
});
```

**Note on `userEvent.setup({ advanceTimers })`:** Using `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })` allows `@testing-library/user-event` to work with `vi.useFakeTimers()`. Without this, typing events won't advance fake timers.

**Existing tests must NOT be broken.** The existing `describe("NewTripDialog", ...)` block tests the `onCreate` call shape:
```ts
expect(onCreate).toHaveBeenCalledWith({
  title: "Paris",
  startDate: "2026-06-01",
  endDate: "2026-06-10",
  budgetAmount: "1500",
});
```
This test does NOT type in the destination field, so `destinationData` stays null. `onCreate` would now be called with extra `undefined` fields. If `expect.objectContaining` is not used, the strict equality will fail because the object now has `destinationName: undefined` etc.

**Fix the existing full-object-match test** (line 141):
```ts
// Change from:
expect(onCreate).toHaveBeenCalledWith({
  title: "Paris",
  startDate: "2026-06-01",
  endDate: "2026-06-10",
  budgetAmount: "1500",
});
// To:
expect(onCreate).toHaveBeenCalledWith(
  expect.objectContaining({
    title: "Paris",
    startDate: "2026-06-01",
    endDate: "2026-06-10",
    budgetAmount: "1500",
    destinationName: undefined,
    destinationCountry: undefined,
    destinationCountryCode: undefined,
    destinationCenter: undefined,
  })
);
```

Similarly update any other tests that do a full object match on the `onCreate` argument (line 120–121 for the "coerces lone decimal point" test, and line 130 for "coerces trailing decimal point").

---

### E2E Scenario — `tests/e2e/features/create-trip.feature`

Add one new scenario to the existing feature file. Use `page.route()` to stub the Mapbox Geocoding API so the E2E test never makes real network calls.

**Feature addition:**
```gherkin
  Scenario: Create a trip with a destination sets the destination field
    When I open the New Trip dialog
    And I type "E2E Destination Trip" in the title field
    And I type "Par" in the destination field
    And the destination suggestions appear
    And I select the first destination suggestion
    Then the destination field shows the selected place name
    When I click the Create button
    Then I am on the trip detail page for "E2E Destination Trip"
```

**Step definitions (`tests/e2e/steps/create-trip.ts` or appropriate step file):**

The Mapbox network intercept should be set up in a `Before` hook or as a step:
```ts
// In the step file or a shared fixture:
await page.route(
  "**/search/geocode/v6/forward**",
  async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        features: [
          {
            properties: {
              name: "Paris",
              place_formatted: "Paris, France",
              full_address: "Paris, Île-de-France, France",
              coordinates: { longitude: 2.3488, latitude: 48.8534 },
              context: {
                country: { name: "France", country_code: "FR" },
              },
            },
          },
        ],
      }),
    });
  }
);
```

Steps to implement:
- `When I type {string} in the destination field` — `page.fill('[id="new-trip-destination"]', text)`
- `When the destination suggestions appear` — `await page.waitForSelector('[role="listbox"]')`
- `When I select the first destination suggestion` — `page.click('[role="option"]:first-child')`
- `Then the destination field shows the selected place name` — assert input value contains `"Paris, Île-de-France, France"`

**Unsplash note:** `createTrip` will call `searchCoverImages` after trip insert. In E2E, Unsplash API calls are NOT stubbed by default. Either:
1. Also stub `**/api.unsplash.com/search/photos**` to return empty `{ results: [] }` (safest — prevents flaky failures on real API quota)
2. Or accept that cover fetch silently fails (the trip is still created, which is what the scenario verifies)

Option 2 is acceptable since the scenario only tests destination UI flow and trip creation success, not cover image application (that's Story 1.4).

### Coverage Impact

- `src/components/packt/**` is coverage-enforced (≥95% lines/functions, ≥90% branches). `new-trip-dialog.tsx` is in this directory — all new branches must be covered.
- `src/lib/utils.ts` is also coverage-enforced — `deriveGraphicCover` must be fully tested.
- `src/app/(app)/trips/actions.ts` is excluded from coverage (`src/app/**` is excluded).
- `src/app/(app)/trips/use-trips-page-handlers.ts` — also `src/app/**`, excluded.

---

### Regression Risks

1. **Existing `submitCreateTrip` test in `page-client.test.tsx`** — mocks `createTrip` as `vi.fn()` so it won't be affected by the new params. No changes needed there.

2. **`updateTripMetadata` date-sync logic** — adding destination fields to the `.set()` call doesn't affect the date-sync algorithm; it only extends what columns are updated. Zero risk.

3. **`createTrip` redirect** — the cover fetch try/catch must NOT swallow the redirect error. The redirect call is outside and after the try/catch block — this is safe. In the error handler `catch {` (no variable), no re-throw is needed since redirect isn't called inside the try block.

4. **`searchCoverImages` inside `createTrip`** — it calls `requireUser()` internally. Since we're already in an authenticated context, this is a no-op read from session cache. Harmless but adds a small latency. If this becomes a concern in a future refactor, the Unsplash fetch logic can be extracted into a private helper that doesn't call `requireUser()`. For this story, calling `searchCoverImages` directly is correct (matches the AC wording).

5. **`MAPBOX_ACCESS_TOKEN` in Mapbox tile URL** — appended directly to the URL. If the token is missing, the tile URL will have an empty `access_token` param and the tile will 401. This is acceptable for this story — the cover will just be a broken image until `onError` clears it (Story 1.4). A future improvement could check `process.env.MAPBOX_ACCESS_TOKEN` before constructing the URL and skip if missing.

---

### References

- Epics file: `_bmad-output/epics-cover-image.md` — Story 1.3 ACs
- Previous story notes: `_bmad-output/1-2-location-and-image-search-server-actions.md` — API shapes, env vars, `LocationSuggestion` interface location
- `src/app/(app)/trips/actions.ts` — `searchLocations` (line 479), `searchCoverImages` (line 532), `LocationSuggestion` interface (line 431), `createTrip` (line 144), `updateTripMetadata` (line 181)
- `src/components/packt/new-trip-dialog.tsx` — full current file (138 lines); `EMPTY_DRAFT` at line 18; `closeDialog` at line 43; `handleSubmit` at line 49
- `src/components/packt/new-trip-dialog.test.tsx` — full current file (184 lines); strict `toHaveBeenCalledWith` at line 141 must be updated to `objectContaining`
- `src/app/(app)/trips/use-trips-page-handlers.ts` — `submitCreateTrip` at line 82
- `src/lib/utils.ts` — `parseGraphicCover` at line 105; file is 130 lines
- `src/data/types.ts` — `NewTripDraft` (line 413), `CreateTripInput` (line 423)
- `src/db/schema.ts` — `trips` table has `destinationName`, `destinationCountry`, `destinationCountryCode` (lines 89-91); `users` table has `defaultCoverType` (line 35)

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `npx vitest run 'src/lib/utils.test.ts' 'src/components/packt/new-trip-dialog.test.tsx' 'src/app/(app)/trips/actions.test.ts'`
- `npm run lint 2>&1`
- `npx tsc --noEmit 2>&1`
- `npm run test:coverage 2>&1`
- `npm run test:e2e 2>&1`
- `npm run build 2>&1`

### Completion Notes List

- Added destination autocomplete state, ARIA combobox behavior, keyboard navigation, toast-backed error handling, and loading feedback to `NewTripDialog`.
- Threaded destination fields through the create-trip flow, including `destinationCenter`, and added automatic cover selection for unsplash, mapbox, and graphic preferences.
- Extended `updateTripMetadata` to persist destination fields without auto-changing `coverImageUrl`, and added action tests that lock the new create/update behavior in place.
- Added deterministic unit and E2E coverage for destination autocomplete, including a Playwright route stub plus an E2E server-action stub so CI avoids real Mapbox calls.

### File List

- playwright.config.ts
- src/app/(app)/trips/actions.test.ts
- src/app/(app)/trips/actions.ts
- src/app/(app)/trips/use-trips-page-handlers.ts
- src/components/packt/new-trip-dialog.test.tsx
- src/components/packt/new-trip-dialog.tsx
- src/data/types.ts
- src/lib/utils.test.ts
- src/lib/utils.ts
- tests/e2e/features/create-trip.feature
- tests/e2e/steps/create-trip.steps.ts

### Review Findings

None.

## Change Log

- 2026-05-27: Implemented destination autocomplete on create, automatic cover selection logic, supporting tests, and E2E coverage.

### Review Findings (2026-05-27)

#### decision-needed

- [ ] [Review][Decision] `LOCATION_TYPES` includes `region` and `country` — Previous types were `place,locality,neighborhood`. The expanded set returns larger administrative areas in autocomplete results (e.g., whole countries and states). Spec doesn't specify which types to include. [src/app/(app)/trips/actions.ts:514]
- [ ] [Review][Decision] Mapbox cover silently falls back to Unsplash when `destinationCenter` missing — When `defaultCoverType === "mapbox"` but `input.destinationCenter` is falsy, the code falls through to the `else` branch calling `searchCoverImages` (Unsplash) instead. Spec doesn't define this fallback behavior. [src/app/(app)/trips/actions.ts:194-206]

#### patch

- [x] [Review][Patch] Empty `catch {}` in `createTrip` — Added `console.error` for debugging. [src/app/(app)/trips/actions.ts:215]
- [x] [Review][Patch] `as any` cast for SearchBox retrieve — Replaced with `as unknown as SearchBoxSuggestion`. [src/app/(app)/trips/actions.ts:600-601]
- [x] [Review][Patch] `crypto.randomUUID()` in render body — Moved to `useEffect` gated on `open`. [src/components/packt/new-trip-dialog.tsx:38]
- [x] [Review][Patch] Empty `catch {}` in `handleSuggestionSelect` — Added `console.error` logging. [src/components/packt/new-trip-dialog.tsx:109]
- [x] [Review][Patch] `aria-busy` not set during location retrieval — Combined `suggestionsLoading || retrieveLoading`. [src/components/packt/new-trip-dialog.tsx:267]
- [x] [Review][Patch] Session token not rotated after cancelled retrieve — Added `sessionTokenRef.current = crypto.randomUUID()` in cancelled path. [src/components/packt/new-trip-dialog.tsx:107-108]
- [x] [Review][Patch] Submit button not disabled during `retrieveLoading` — Added `|| retrieveLoading` to button `disabled`. [src/components/packt/new-trip-dialog.tsx:352]
- [x] [Review][Patch] `aria-activedescendant` stale ref when suggestions empty — Added `suggestions.length > 0` guard. [src/components/packt/new-trip-dialog.tsx:279]
- [x] [Review][Patch] `feature.geometry` could be null — Added explicit null check before accessing `.coordinates`. [src/app/(app)/trips/actions.ts:611]
- [x] [Review][Patch] Race in `cancelRetrieveRef` microtask ordering — Set `cancelRetrieveRef.current = true` before state setters, then `false` after. [src/components/packt/new-trip-dialog.tsx:99-100]
- [x] [Review][Patch] Suggestion `key` prop may duplicate — Changed to use `index-mapboxId/placeName`. [src/components/packt/new-trip-dialog.tsx:282]

Dismissed (false positive): `blobPut` reference — properly `vi.hoisted`, not a bug.

#### defer

- [x] [Review][Defer] `user.id!` non-null assertion pattern — Pre-existing project convention after `requireUser()`. Not introduced by this change. [src/app/(app)/trips/actions.ts:155,189]
- [x] [Review][Defer] `deriveGraphicCover` returns raw CSS `var()` strings — By design per spec dev notes: CSS variables resolve client-side, acceptable for cover rendering. [src/lib/utils.ts:162]
- [x] [Review][Defer] `LocationSuggestion` removes `center` field — Intentional breaking change for new Search Box API flow; `center` is now obtained via `retrieveLocation`. [src/app/(app)/trips/actions.ts:480-484]
- [x] [Review][Defer] Budget "0" coerced to `undefined` — Pre-existing falsy `||` coercion in submit handler, not introduced by this change. [src/components/packt/new-trip-dialog.tsx:173]
- [x] [Review][Defer] `sanitizeBudget` regex allows multiple decimal points — Pre-existing regex pattern, not introduced by this change. [src/components/packt/new-trip-dialog.tsx:32]
- [x] [Review][Defer] Partial update nullification via undefined fields — Drizzle drops `undefined` from UPDATE statements; handled correctly. Pre-existing pattern. [src/app/(app)/trips/actions.ts:352-355]
