# Story 1.2: Location & Image Search Server Actions

Status: done

## Story

As a developer,
I want server actions for searching locations and cover images,
so that NewTripDialog and CoverImagePicker can retrieve validated location data and candidate photos.

## Acceptance Criteria

1. **Given** `src/app/(app)/trips/actions.ts` — **Then** a `searchLocations(query: string)` server action exists that calls the Mapbox Geocoding **v6** API (`GET /search/geocode/v6/forward`) and returns `{ placeName: string; country: string; countryCode: string; center: [number, number] }[]`

2. **Given** `searchLocations` is called with a valid query — **When** the Mapbox API returns results — **Then** results are mapped to the return type and returned (maximum 5 suggestions)

3. **Given** `searchLocations` is called — **When** the Mapbox API throws or returns an error — **Then** the action throws with a descriptive message (caller handles the toast)

4. **Given** `src/app/(app)/trips/actions.ts` — **Then** a `searchCoverImages(query: string)` server action exists that calls `GET https://api.unsplash.com/search/photos?query={query}+travel&orientation=landscape&per_page=19` and returns `{ id: string; url: string; photographer: string; alt: string }[]`

5. **Given** `searchCoverImages` is called with a valid query — **When** the Unsplash API returns results — **Then** the mapped result array is returned

6. **Given** `searchCoverImages` is called — **When** the Unsplash API throws or returns an error — **Then** the action throws with a descriptive message

7. **Given** `MAPBOX_ACCESS_TOKEN` or `UNSPLASH_ACCESS_KEY` are missing from the environment — **Then** the respective action throws a clear "missing env var" error on first call

8. **Given** `src/app/(app)/trips/actions.test.ts` — **Then** tests cover: `searchLocations` maps Mapbox response to return type, throws on API error, throws on missing env var; `searchCoverImages` maps Unsplash response to return type, throws on API error, throws on missing env var

## Tasks / Subtasks

- [x] Add `searchLocations` server action to `src/app/(app)/trips/actions.ts` (AC: 1, 2, 3, 7)
  - [x] Guard: throw early if `MAPBOX_ACCESS_TOKEN` is not set
  - [x] Require authenticated user with `requireUser()` (no assertTripAccess needed — not trip-scoped)
  - [x] Call Mapbox Geocoding **v6** API: `GET https://api.mapbox.com/search/geocode/v6/forward?q={encodedQuery}&access_token={token}&limit=5&types=place,locality,neighborhood`
  - [x] Map each feature from `feature.properties`: `placeName = props.full_address ?? \`${props.name}, ${props.place_formatted}\``, `country = props.context?.country?.name ?? ""`, `countryCode = props.context?.country?.country_code ?? ""`, `center = [props.coordinates.longitude, props.coordinates.latitude]`
  - [x] On fetch error or non-ok response, throw descriptive error
  - [x] Return mapped array (max 5 from `limit=5`)

- [x] Add `searchCoverImages` server action to `src/app/(app)/trips/actions.ts` (AC: 4, 5, 6, 7)
  - [x] Guard: throw early if `UNSPLASH_ACCESS_KEY` is not set
  - [x] Require authenticated user with `requireUser()`
  - [x] Call Unsplash: `GET https://api.unsplash.com/search/photos?query={encodedQuery}+travel&orientation=landscape&per_page=19` with `Authorization: Client-ID {key}` header
  - [x] Map each result: `id = result.id`, `url = result.urls.regular`, `photographer = result.user.name`, `alt = result.alt_description ?? result.description ?? ""`
  - [x] On fetch error or non-ok response, throw descriptive error
  - [x] Return mapped results array

- [x] Write tests in `src/app/(app)/trips/actions.test.ts` (AC: 8)
  - [x] Add a `mockFetch = vi.fn()` local to each describe block; stub it with `vi.stubGlobal("fetch", mockFetch)` in `beforeEach`
  - [x] Use `requireUser.mockResolvedValue({ id: "user-1" })` — the existing hoisted mock variable in `trips/actions.test.ts` is named `requireUser` (not `mockRequireUser`)
  - [x] `searchLocations`: success case (valid Mapbox response → mapped array), API error (non-ok status → throws), missing env var (no `MAPBOX_ACCESS_TOKEN` → throws)
  - [x] `searchCoverImages`: success case (valid Unsplash response → mapped array), API error (non-ok status → throws), missing env var (no `UNSPLASH_ACCESS_KEY` → throws)

## Dev Notes

### File to Modify: `src/app/(app)/trips/actions.ts`

This file already has `"use server"` at top. The two new actions are append-only additions at the bottom of the file. Do **not** touch any existing actions (`createTrip`, `updateTripMetadata`, `deleteTrip`, `addCollaborator`, etc.) — they must remain unchanged.

Current imports include: `requireUser`, `assertTripAccess`, `db`, schema tables, drizzle operators, `revalidatePath`, `redirect`, and domain types from `@/data/types`. The new actions only need `requireUser` (already imported) and `fetch` (global — no import needed). No new top-level imports are required.

**Do NOT add `assertTripAccess` to these actions** — they are not trip-scoped; they're standalone search utilities used by NewTripDialog before a trip even exists.

**Do NOT call `revalidatePath`** — these are read-only actions; nothing is mutated.

### API Implementation Details

#### `searchLocations` — Mapbox Geocoding v6

> **Important:** Mapbox Geocoding v5 is superseded. Use the v6 API — different base URL, different response shape.

**Endpoint:**
```
GET https://api.mapbox.com/search/geocode/v6/forward
  ?q={encodedQuery}
  &access_token=MAPBOX_ACCESS_TOKEN
  &limit=5
  &types=place,locality,neighborhood
```

**Env var:** `process.env.MAPBOX_ACCESS_TOKEN`

**Response shape:**
```ts
interface MapboxGeoResponse {
  features: Array<{
    properties: {
      name: string;                  // city/place name, e.g. "Tokyo"
      place_formatted: string;       // "Tokyo, Japan"
      full_address?: string;         // "Tokyo, Tokyo, Japan" (preferred for display)
      coordinates: {
        longitude: number;
        latitude: number;
      };
      context: {
        country?: {
          name: string;              // "Japan"
          country_code: string;      // "JP" — already uppercase ISO 3166 alpha-2
          country_code_alpha_3?: string;
        };
        region?: { name: string; region_code?: string };
        place?: { name: string };
        [key: string]: unknown;
      };
    };
  }>;
}
```

**Mapping logic:**
```ts
const props = feature.properties;
return {
  placeName: props.full_address ?? `${props.name}, ${props.place_formatted}`,
  country: props.context?.country?.name ?? "",
  countryCode: props.context?.country?.country_code ?? "", // already uppercase
  center: [props.coordinates.longitude, props.coordinates.latitude] as [number, number],
};
```

**Return type** (define inline in the action or as a local interface — do NOT add to `src/data/types.ts` since this is a server-action-internal shape):
```ts
interface LocationSuggestion {
  placeName: string;
  country: string;
  countryCode: string;
  center: [number, number];
}
```

**Error handling:**
```ts
const token = process.env.MAPBOX_ACCESS_TOKEN;
if (!token) throw new Error("MAPBOX_ACCESS_TOKEN is not configured");
// ... fetch call ...
if (!res.ok) throw new Error(`Mapbox geocoding error: ${res.status}`);
```

#### `searchCoverImages` — Unsplash Search

**Endpoint:**
```
GET https://api.unsplash.com/search/photos
  ?query={encodedQuery}+travel
  &orientation=landscape
  &per_page=19
```

**Header:** `Authorization: Client-ID {UNSPLASH_ACCESS_KEY}`

**Env var:** `process.env.UNSPLASH_ACCESS_KEY`

**Response shape:**
```ts
interface UnsplashSearchResponse {
  results: Array<{
    id: string;
    urls: { regular: string; small: string };
    user: { name: string };
    alt_description: string | null;
    description: string | null;
  }>;
}
```

**Mapping logic:**
```ts
return {
  id: result.id,
  url: result.urls.regular,
  photographer: result.user.name,
  alt: result.alt_description ?? result.description ?? "",
};
```

**Return type** (local interface in the action):
```ts
interface CoverImageResult {
  id: string;
  url: string;
  photographer: string;
  alt: string;
}
```

**Error handling:**
```ts
const key = process.env.UNSPLASH_ACCESS_KEY;
if (!key) throw new Error("UNSPLASH_ACCESS_KEY is not configured");
// ... fetch call ...
if (!res.ok) throw new Error(`Unsplash search error: ${res.status}`);
```

### File to Modify: `src/app/(app)/trips/actions.test.ts`

**Existing test setup:** The file uses `vi.hoisted` to declare mocks for `requireUser`, `db`, `revalidatePath`, etc. `requireUser` mock is already hoisted and set up. The new tests extend this file — they use the already-mocked `requireUser` but add a `fetch` stub.

**Pattern for mocking `fetch`:** Use `vi.stubGlobal("fetch", mockFetch)` inside a `beforeEach` and `vi.unstubAllGlobals()` in `afterEach`, or simply declare a `mockFetch = vi.fn()` in `vi.hoisted()` and stub it once in a `describe` block.

**Do NOT re-mock** `@/lib/auth-helpers`, `@/db`, `next/cache`, or `next/navigation` — they're already mocked at module level in the existing file. The new `describe` blocks call `requireUser.mockResolvedValue({ id: "user-1" })` in `beforeEach` — note the hoisted variable is named `requireUser` (no "mock" prefix) in this specific file (differs from `[tripId]/actions.test.ts` which uses `mockRequireUser`).

**Test structure to add:**

```ts
// ── searchLocations ───────────────────────────────────────────────────────────

import { searchLocations, searchCoverImages } from "./actions";

describe("searchLocations", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    requireUser.mockResolvedValue({ id: "user-1" });
    process.env.MAPBOX_ACCESS_TOKEN = "test-mapbox-token";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.MAPBOX_ACCESS_TOKEN;
  });

  it("maps Mapbox response to LocationSuggestion array", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          {
            properties: {
              name: "Tokyo",
              place_formatted: "Tokyo, Japan",
              full_address: "Tokyo, Tokyo, Japan",
              coordinates: { longitude: 139.69, latitude: 35.68 },
              context: {
                country: { name: "Japan", country_code: "JP" },
              },
            },
          },
        ],
      }),
    });
    const result = await searchLocations("Tokyo");
    expect(result).toEqual([
      { placeName: "Tokyo, Tokyo, Japan", country: "Japan", countryCode: "JP", center: [139.69, 35.68] },
    ]);
  });

  it("throws when Mapbox returns non-ok status", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 403 });
    await expect(searchLocations("Tokyo")).rejects.toThrow("Mapbox geocoding error: 403");
  });

  it("throws when MAPBOX_ACCESS_TOKEN is missing", async () => {
    delete process.env.MAPBOX_ACCESS_TOKEN;
    await expect(searchLocations("Tokyo")).rejects.toThrow("MAPBOX_ACCESS_TOKEN is not configured");
  });
});

// ── searchCoverImages ─────────────────────────────────────────────────────────

describe("searchCoverImages", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    requireUser.mockResolvedValue({ id: "user-1" });
    process.env.UNSPLASH_ACCESS_KEY = "test-unsplash-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.UNSPLASH_ACCESS_KEY;
  });

  it("maps Unsplash response to CoverImageResult array", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            id: "abc123",
            urls: { regular: "https://images.unsplash.com/abc", small: "..." },
            user: { name: "John Photographer" },
            alt_description: "Tokyo skyline",
            description: null,
          },
        ],
      }),
    });
    const result = await searchCoverImages("Tokyo");
    expect(result).toEqual([
      { id: "abc123", url: "https://images.unsplash.com/abc", photographer: "John Photographer", alt: "Tokyo skyline" },
    ]);
  });

  it("uses description as fallback when alt_description is null", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            id: "xyz",
            urls: { regular: "https://images.unsplash.com/xyz", small: "..." },
            user: { name: "Jane" },
            alt_description: null,
            description: "A beautiful view",
          },
        ],
      }),
    });
    const result = await searchCoverImages("Paris");
    expect(result[0].alt).toBe("A beautiful view");
  });

  it("throws when Unsplash returns non-ok status", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401 });
    await expect(searchCoverImages("Tokyo")).rejects.toThrow("Unsplash search error: 401");
  });

  it("throws when UNSPLASH_ACCESS_KEY is missing", async () => {
    delete process.env.UNSPLASH_ACCESS_KEY;
    await expect(searchCoverImages("Tokyo")).rejects.toThrow("UNSPLASH_ACCESS_KEY is not configured");
  });
});
```

**Import:** Add `searchLocations, searchCoverImages` to the existing import from `"./actions"`. The existing import is `import { updateTripMetadata } from "./actions"` — change to a combined import or add a second import statement.

### Implementation Pattern Reference

The existing `actions.ts` pattern for auth guard + external interaction:
```ts
export async function someAction(...) {
  const user = await requireUser(); // throws redirect if not authed
  // ... do work ...
}
```

No need for `assertTripAccess` — these search actions are pre-trip-creation utilities.

### TypeScript Conventions

- Return types must be explicitly typed as the local interface (TypeScript will infer but explicit is cleaner for server actions)
- `encodeURIComponent(query)` for the query string — never interpolate raw user input into URLs
- `as [number, number]` cast is needed on `center` because TypeScript infers `number[]` from array spread

### Coverage Impact

Both new actions go in `src/app/(app)/trips/actions.ts` — but actions files are excluded from coverage config (`src/app/**` is excluded). No coverage delta from this story. Tests still required for correctness verification — they just don't affect coverage thresholds.

### Project Structure Notes

- **Alignment:** Both new actions belong in `src/app/(app)/trips/actions.ts` (already `"use server"`). This follows the existing pattern of all trip-related actions in one file.
- **No new files:** This story is add-only to two existing files: `actions.ts` and `actions.test.ts`.
- **No type additions to `src/data/types.ts`:** The return shapes (`LocationSuggestion`, `CoverImageResult`) are internal server-action types, not domain types. Keep them as local interfaces or inline type annotations in `actions.ts`.
- **Environment variables:** These will need to be set in `.env.local` for development. For E2E, Mapbox/Unsplash calls in `searchLocations`/`searchCoverImages` will be mocked via unit tests; E2E scenarios that trigger these won't be added until Story 1.3.

### References

- Epics file: `_bmad-output/epics-cover-image.md` — Story 1.2 ACs
- Current actions file: `src/app/(app)/trips/actions.ts` — append-only, preserve all existing actions
- Current actions test: `src/app/(app)/trips/actions.test.ts` — extend with new describe blocks
- Mapbox Geocoding v6 docs: `https://docs.mapbox.com/api/search/geocoding/` — `GET /search/geocode/v6/forward?q={query}` (v5 is superseded; do not use)
- Unsplash API docs: `https://unsplash.com/documentation#search-photos` — `GET /search/photos`
- Project context: `_bmad-output/project-context.md` — server action patterns, auth conventions
- Story 1.1: `_bmad-output/1-1-trip-destination-data-layer.md` — completed; `CoverType`, destination fields, `dbUserToType` are all in place

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `npx vitest run src/app/(app)/trips/actions.test.ts`
- `npx vitest run src/app/(app)/trips/actions.test.ts src/lib/db-mappers.test.ts`
- `npm run lint 2>&1`
- `npx tsc --noEmit 2>&1`
- `npm run test:coverage 2>&1`
- `npm run test:e2e 2>&1`
- `npm run build 2>&1`

### Completion Notes List

- Added `searchLocations()` and `searchCoverImages()` to `src/app/(app)/trips/actions.ts` with env guards, auth checks, encoded queries, mapped return shapes, and descriptive external API failures.
- Extended `src/app/(app)/trips/actions.test.ts` with success, non-OK response, and missing-env coverage for both server actions.
- Tightened `src/lib/db-mappers.ts` cover-type narrowing and added the matching regression case in `src/lib/db-mappers.test.ts` so TypeScript and production build stay green.
- Full validation passed: lint, TypeScript, coverage, Playwright E2E, and production build.

### File List

- src/app/(app)/trips/actions.ts
- src/app/(app)/trips/actions.test.ts
- src/lib/db-mappers.ts
- src/lib/db-mappers.test.ts
