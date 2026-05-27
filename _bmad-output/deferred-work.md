# Deferred Work

## Deferred from: code review of 1-1-trip-destination-data-layer (2026-05-27)

- `dbUserToType` empty sub-collections — intentional per spec: "caller must populate" [src/lib/db-mappers.ts:68-70]
- `email ?? ""` — pre-existing UserProfile mapping pattern, not introduced here [src/lib/db-mappers.ts:56]
- No DB constraint on `defaultCoverType` — spec says nullable text, intentional [src/db/schema.ts:35]
- `destinationCountryCode` no length constraint — spec says text, out of scope [src/db/schema.ts:89]
- `UpdateTripPatch` can't clear destination fields — pre-existing pattern, not scoped [src/data/types.ts]
- No migration file in diff — schema-only commit, separate workflow [src/db/schema.ts]
- `CoverType.Graphic` value and URL prefix coupled — no spec requirement for shared constant

## Deferred from: code review of 1-2-location-and-image-search-server-actions (2026-05-27)

- Unsound `as` type assertions for API responses — pre-existing project-wide pattern; not introduced by this change [actions.ts:502,534]
