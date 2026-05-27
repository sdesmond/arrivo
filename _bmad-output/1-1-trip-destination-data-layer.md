# Story 1.1: Trip Destination Data Layer

Status: done

## Story

As a developer,
I want destination fields and a cover type preference persisted in the database with proper types and mapper coverage,
so that all subsequent cover image features have a stable data foundation to build on.

## Acceptance Criteria

1. **Given** `src/db/schema.ts` trips table — **When** migration runs — **Then** three new nullable `text` columns exist: `destination_name`, `destination_country`, `destination_country_code`
2. **Given** `src/db/schema.ts` users table — **When** migration runs — **Then** a new nullable `text` column `default_cover_type` exists with no default value
3. **Given** `src/data/types.ts` — **Then** `Trip` has optional fields `destinationName?: string`, `destinationCountry?: string`, `destinationCountryCode?: string`
4. **Given** `src/data/types.ts` — **Then** `CreateTripInput`, `UpdateTripPatch`, and `NewTripDraft` each include the three destination fields as optional
5. **Given** `src/data/types.ts` — **Then** a `CoverType` const object `{ Unsplash: "unsplash", Mapbox: "mapbox", Graphic: "graphic" } as const` and union type are defined using the const-object pattern (never `enum`)
6. **Given** `src/data/types.ts` — **Then** `UserProfile` gains `defaultCoverType?: CoverType`
7. **Given** `src/lib/db-mappers.ts` `dbTripToType()` — **Then** it maps `destination_name`, `destination_country`, `destination_country_code` to camelCase Trip fields (null → undefined)
8. **Given** `src/lib/db-mappers.ts` — **Then** a `dbUserToType()` function maps a raw user row to `UserProfile`, including `defaultCoverType` mapped from `default_cover_type` (validated as `CoverType`, null → undefined)
9. **Given** `src/lib/utils.ts` — **Then** a `parseGraphicCover(url: string): { color: string; icon: string } | null` function is exported that returns `{ color, icon }` when the string matches `graphic:{color}/{icon}` and `null` for any other input including falsy
10. **Given** `src/lib/db-mappers.test.ts` — **Then** `dbTripToType` tests cover destination fields present and null; `dbUserToType` tests cover `defaultCoverType` for `"unsplash"`, `"mapbox"`, `"graphic"`, and null
11. **Given** `src/lib/utils.test.ts` — **Then** `parseGraphicCover` tests cover valid graphic URLs, non-graphic URLs, null, and malformed strings

## Tasks / Subtasks

- [x] Add DB columns to schema (AC: 1, 2)
  - [x] Add `destinationName`, `destinationCountry`, `destinationCountryCode` text columns (nullable) to `trips` table in `src/db/schema.ts`
  - [x] Add `defaultCoverType` text column (nullable, no default) to `users` table in `src/db/schema.ts`
  - [x] Run `npm run db:migrate` to apply to dev DB; run `npm run db:migrate:e2e` to apply to E2E DB
- [x] Update `src/data/types.ts` (AC: 3, 4, 5, 6)
  - [x] Add `destinationName?`, `destinationCountry?`, `destinationCountryCode?` to `Trip` interface
  - [x] Add the three destination fields to `CreateTripInput`, `UpdateTripPatch`, and `NewTripDraft`
  - [x] Add `CoverType` const object + union type
  - [x] Add `defaultCoverType?: CoverType` to `UserProfile`
- [x] Update `src/lib/db-mappers.ts` (AC: 7, 8)
  - [x] Map the three destination columns in `dbTripToType()`
  - [x] Write new `dbUserToType()` function
  - [x] Export `dbUserToType` from the module
- [x] Add `parseGraphicCover` to `src/lib/utils.ts` (AC: 9)
- [x] Write/update tests (AC: 10, 11)
  - [x] Extend `src/lib/db-mappers.test.ts` with `dbTripToType` destination field cases and full `dbUserToType` describe block
  - [x] Extend `src/lib/utils.test.ts` with `parseGraphicCover` describe block

## Dev Notes

### Files to Modify

| File | Change type | Notes |
|------|-------------|-------|
| `src/db/schema.ts` | UPDATE | Add columns to `trips` and `users` table definitions |
| `src/data/types.ts` | UPDATE | Add fields + `CoverType` const; no new imports needed |
| `src/lib/db-mappers.ts` | UPDATE | Extend `dbTripToType`, add `dbUserToType` |
| `src/lib/utils.ts` | UPDATE | Add `parseGraphicCover` export |
| `src/lib/db-mappers.test.ts` | UPDATE | Extend existing `describe` blocks + add new one |
| `src/lib/utils.test.ts` | UPDATE | Add new `describe` block |

No new files are created in this story.

### Schema Changes

**`trips` table — append to existing column list:**
```ts
destinationName: text("destination_name"),
destinationCountry: text("destination_country"),
destinationCountryCode: text("destination_country_code"),
```

**`users` table — append to existing column list:**
```ts
defaultCoverType: text("default_cover_type"),
```

All four columns are nullable with no default. Drizzle infers them as `string | null` in `$inferSelect`.

### Migration Commands

After editing `schema.ts`, run in order:
```bash
npm run db:migrate        # dev database
npm run db:migrate:e2e    # E2E database (packt_e2e)
```

Do NOT skip the E2E migration — E2E tests run against `packt_e2e` and will fail with column-not-found errors if the schema is out of sync.

### TypeScript — CoverType Pattern

Follow the project's const-object + union pattern (never `enum`):
```ts
export const CoverType = {
  Unsplash: "unsplash",
  Mapbox: "mapbox",
  Graphic: "graphic",
} as const;
export type CoverType = (typeof CoverType)[keyof typeof CoverType];
```

Place it in `src/data/types.ts` in the ENUMS section alongside `TripStatus`, `CollaboratorRole`, etc.

### `dbTripToType` Extension

Current function returns a `Trip` object. Append the three new optional fields after the existing `coverImageUrl` mapping:
```ts
destinationName: row.destinationName ?? undefined,
destinationCountry: row.destinationCountry ?? undefined,
destinationCountryCode: row.destinationCountryCode ?? undefined,
```

The column names in Drizzle schema use camelCase keys (e.g., `destinationName`) mapping to snake_case DB columns (`destination_name`). Drizzle handles this automatically — access via `row.destinationName`, not `row.destination_name`.

### `dbUserToType` — New Function

`getUserById` in `queries.ts` currently builds a `UserProfile` object inline (manually spreading + mapping). The story calls for a `dbUserToType()` mapper in `db-mappers.ts` for consistency with the project's mapper pattern.

**Important:** `queries.ts` currently does NOT use a user mapper — it builds `UserProfile` inline. This story adds `dbUserToType` as a new export but does **not** require refactoring `queries.ts` to use it. The new function will be consumed by stories 1.3/1.5 when they read `defaultCoverType` during trip creation. Do not touch `queries.ts` in this story.

The mapper input type is `typeof users.$inferSelect` (the full Drizzle row). The `defaultCoverType` field must be validated as `CoverType` — cast it only if the value is one of the three valid string literals:

```ts
import { users } from "@/db/schema";
import { CoverType } from "@/data/types";
import type { UserProfile } from "@/data/types";

export function dbUserToType(row: typeof users.$inferSelect): UserProfile {
  const validCoverTypes = Object.values(CoverType) as string[];
  return {
    id: row.id,
    name: row.name ?? null,
    email: row.email ?? "",
    dateFormat: row.dateFormat ?? null,
    currency: row.currency ?? null,
    distanceUnit: row.distanceUnit ?? null,
    passportNumber: row.passportNumber ?? null,
    passportExpiry: row.passportExpiry ?? null,
    passportNationality: row.passportNationality ?? null,
    knownTravelerNumber: row.knownTravelerNumber ?? null,
    defaultCoverType: validCoverTypes.includes(row.defaultCoverType ?? "")
      ? (row.defaultCoverType as CoverType)
      : undefined,
    loyaltyNumbers: [],       // caller must populate — mapper only handles the flat row
    wishlistDestinations: [], // caller must populate
    companions: [],           // caller must populate
  };
}
```

**Note:** The nested arrays (`loyaltyNumbers`, `wishlistDestinations`, `companions`) require separate queries that the caller (`getUserById`) already handles. The mapper only maps the flat user row.

### `parseGraphicCover` — Utility

Graphic cover values are stored as `coverImageUrl` in the DB using the encoding `graphic:{color}/{icon}`. This utility extracts the parts:

```ts
export function parseGraphicCover(url: string): { color: string; icon: string } | null {
  if (!url || !url.startsWith("graphic:")) return null;
  const rest = url.slice("graphic:".length);
  const slashIdx = rest.indexOf("/");
  if (slashIdx === -1) return null;
  const color = rest.slice(0, slashIdx);
  const icon = rest.slice(slashIdx + 1);
  if (!color || !icon) return null;
  return { color, icon };
}
```

Place after the existing utility functions in `src/lib/utils.ts`. This function is pure — no imports needed.

### Testing — `db-mappers.test.ts`

The existing `BASE_TRIP` test fixture has all schema columns already defined. When you add destination columns to the schema, TypeScript will require them in `BASE_TRIP`. Add all three as `null`:
```ts
const BASE_TRIP: TripRow = {
  // ... existing fields ...
  destinationName: null,
  destinationCountry: null,
  destinationCountryCode: null,
};
```

Add to the existing `dbTripToType` describe block:
```ts
it("null destination fields become undefined", () => {
  const result = dbTripToType(BASE_TRIP);
  expect(result.destinationName).toBeUndefined();
  expect(result.destinationCountry).toBeUndefined();
  expect(result.destinationCountryCode).toBeUndefined();
});

it("maps destination fields when present", () => {
  const result = dbTripToType({
    ...BASE_TRIP,
    destinationName: "Tokyo",
    destinationCountry: "Japan",
    destinationCountryCode: "JP",
  });
  expect(result.destinationName).toBe("Tokyo");
  expect(result.destinationCountry).toBe("Japan");
  expect(result.destinationCountryCode).toBe("JP");
});
```

New `dbUserToType` describe block:
```ts
const BASE_USER: UserRow = {
  id: "user-1",
  name: "Spencer",
  email: "spencer@example.com",
  emailVerified: null,
  image: null,
  passwordHash: null,
  dateFormat: null,
  currency: null,
  distanceUnit: null,
  passportNumber: null,
  passportExpiry: null,
  passportNationality: null,
  knownTravelerNumber: null,
  defaultCoverType: null,
};

describe("dbUserToType", () => {
  it("maps core fields correctly", () => { ... });
  it("null defaultCoverType becomes undefined", () => { ... });
  it('maps defaultCoverType "unsplash"', () => { ... });
  it('maps defaultCoverType "mapbox"', () => { ... });
  it('maps defaultCoverType "graphic"', () => { ... });
  it("invalid defaultCoverType value becomes undefined", () => { ... });
  it("loyaltyNumbers defaults to empty array", () => { ... });
});
```

The `users` table type: `import type { users } from "@/db/schema"; type UserRow = typeof users.$inferSelect;`

### Testing — `utils.test.ts`

New `parseGraphicCover` describe block — no environment annotation needed (pure function):
```ts
describe("parseGraphicCover", () => {
  it('returns color and icon for valid graphic URL', () => {
    expect(parseGraphicCover("graphic:oklch(0.7 0.15 200)/plane")).toEqual({
      color: "oklch(0.7 0.15 200)",
      icon: "plane",
    });
  });
  it('handles icon names with hyphens', () => {
    expect(parseGraphicCover("graphic:#3b82f6/map-pin")).toEqual({
      color: "#3b82f6",
      icon: "map-pin",
    });
  });
  it('returns null for non-graphic URL', () => {
    expect(parseGraphicCover("https://example.com/img.jpg")).toBeNull();
  });
  it('returns null for empty string', () => {
    expect(parseGraphicCover("")).toBeNull();
  });
  it('returns null for malformed graphic URL (no slash)', () => {
    expect(parseGraphicCover("graphic:coloronly")).toBeNull();
  });
  it('returns null for graphic with empty color', () => {
    expect(parseGraphicCover("graphic:/plane")).toBeNull();
  });
  it('returns null for graphic with empty icon', () => {
    expect(parseGraphicCover("graphic:blue/")).toBeNull();
  });
});
```

Import `parseGraphicCover` alongside the existing imports at the top of `utils.test.ts`.

### Project Structure Notes

- `src/data/types.ts` — all types in one file; no sub-files. Enums at top, then interfaces in domain groupings (User, Document, Trip, etc.)
- `src/lib/db-mappers.ts` — each mapper function takes a Drizzle `$inferSelect` row type. Never map raw DB rows anywhere else.
- `src/lib/utils.ts` — pure utility functions only; no imports from `@/data` (only `@/lib/mock-date` for `getNow`)
- `src/lib/queries.ts` — `server-only`; not touched in this story
- No `any` types; no single-letter variables; `?:` for optional fields (not `| undefined`)

### Coverage Impact

This story adds functions to two coverage-tracked files:
- `src/lib/db-mappers.ts` — new `dbUserToType` export must be fully tested
- `src/lib/utils.ts` — new `parseGraphicCover` export must be fully tested

Coverage thresholds: ≥95% lines/functions, ≥90% branches. The new code is simple enough that complete branch coverage is achievable with the test cases listed above.

### References

- Schema: `src/db/schema.ts` — existing `trips` and `users` table definitions
- Types: `src/data/types.ts` — existing `Trip`, `UserProfile`, `CreateTripInput`, `UpdateTripPatch`, `NewTripDraft`, enum pattern
- Mappers: `src/lib/db-mappers.ts` — existing `dbTripToType` + all other mappers
- Tests: `src/lib/db-mappers.test.ts` — existing test fixtures and `BASE_TRIP` shape
- Utils: `src/lib/utils.ts` — existing pure utility exports
- Context: `_bmad-output/epics-cover-image.md` — Story 1.1 ACs and requirements
- Project conventions: `_bmad-output/project-context.md`

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `npx vitest run src/lib/db-mappers.test.ts src/lib/utils.test.ts` (red)
- `npx vitest run src/lib/db-mappers.test.ts src/lib/utils.test.ts` (green)
- `npm run db:migrate`
- `npm run db:migrate:e2e`
- `npm run lint 2>&1`
- `npx tsc --noEmit 2>&1`
- `npm run test:coverage 2>&1`
- `npm run test:e2e 2>&1`
- `npm run build 2>&1`

### Completion Notes List

- Added nullable trip destination columns and nullable user `default_cover_type`, then pushed both dev and E2E schemas with Drizzle.
- Extended canonical trip and user types with destination metadata and the `CoverType` const-object union.
- Added `dbUserToType()`, extended `dbTripToType()` destination mapping, and added `parseGraphicCover()` with full mapper and utility coverage.
- Full validation passed: lint, TypeScript, coverage, Playwright E2E, and production build.

### File List

- src/db/schema.ts
- src/data/types.ts
- src/lib/db-mappers.ts
- src/lib/utils.ts
- src/lib/db-mappers.test.ts
- src/lib/utils.test.ts

## Review Findings

- [x] [Review][Patch] `parseGraphicCover` param type — should accept `string | null | undefined` to prevent runtime crash [src/lib/utils.ts:105]
- [x] [Review][Patch] `VALID_COVER_TYPES as string[]` — erases union type safety; prefer `as readonly CoverType[]` [src/lib/db-mappers.ts:43]
- [x] [Review][Patch] `dbUserToType` tests skip passport/date/currency fields — add coverage for `passportNumber`, `passportExpiry`, `passportNationality`, `knownTravelerNumber` [src/lib/db-mappers.test.ts]
- [x] [Review][Patch] `parseGraphicCover` whitespace-only color/icon segments — add `.trim()` check [src/lib/utils.ts:109-112]
- [x] [Review][Patch] `parseGraphicCover` unvalidated slashes in icon — guard against structured path leakage [src/lib/utils.ts:109-112]
- [x] [Review][Defer] `dbUserToType` empty sub-collections — intentional per spec: "caller must populate" [src/lib/db-mappers.ts:68-70]
- [x] [Review][Defer] `email ?? ""` — pre-existing UserProfile mapping pattern, not introduced here [src/lib/db-mappers.ts:56]
- [x] [Review][Defer] No DB constraint on `defaultCoverType` — spec says nullable text, intentional [src/db/schema.ts:35]
- [x] [Review][Defer] `destinationCountryCode` no length constraint — spec says text, out of scope [src/db/schema.ts:89]
- [x] [Review][Defer] `UpdateTripPatch` can't clear destination fields — pre-existing pattern, not scoped [src/data/types.ts]
- [x] [Review][Defer] No migration file in diff — schema-only commit, separate workflow [src/db/schema.ts]
- [x] [Review][Defer] `CoverType.Graphic` value and URL prefix coupled — no spec requirement for shared constant

## Change Log

- 2026-05-27: Implemented Story 1.1 trip destination data layer, added mapper and utility coverage, and validated with full project checks.
