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

## Deferred from: code review of 1-3-destination-autocomplete-and-auto-cover-on-create (2026-05-27)

- `user.id!` non-null assertion pattern — Pre-existing project convention after `requireUser()`. Not introduced by this change.
- `deriveGraphicCover` returns raw CSS `var()` strings — By design per spec dev notes; CSS variables resolve client-side.
- `LocationSuggestion` removes `center` field — Intentional breaking change for new Search Box API flow; `center` obtained via `retrieveLocation`.
- Budget "0" coerced to `undefined` — Pre-existing falsy `||` coercion, not introduced by this change.
- `sanitizeBudget` regex allows multiple decimal points — Pre-existing regex pattern, not introduced by this change.
- Partial update nullification via undefined fields — Drizzle drops `undefined` from UPDATE; handled correctly. Pre-existing pattern.

## Deferred from: code review of 1-4-trip-cover-image-display-wiring (2026-05-27)

- Image onError can update state after component unmount — minor React anti-pattern, rarely materializes [trip-cover.tsx:74]
- Hardcoded 48px icon size with no consumer override — design limitation, not a bug [trip-cover.tsx:29]
- No srcSet/sizes on cover `<img>` — enhancement, not in scope [trip-cover.tsx:73-85]

## Deferred from: code review of 1-5-default-cover-type-user-preference (2026-05-28)

- ToggleGroup deselect sends empty array; state unchanged but UI visually clears — pre-existing pattern for all toggles in preferences-section.tsx; fix when ToggleGroup primitives are refactored
- Cover preference DB query runs outside the trip transaction — pre-existing from Story 1.3; trip could exist without cover if the query throws post-commit

## Deferred from: code review of 2-1-split-trip-edit-sheet-into-subcomponents (2026-05-28)

- Duplicate "Destination" heading text [trip-edit-destination.tsx] — Section title and Field label both render "Destination" text; UX/presentation judgment deferred

## Deferred from: code review of 2-1-split-trip-edit-sheet-into-subcomponents round 2 (2026-05-28)

- Currency cleared to `""` stored as empty string after `??` fix [trip-edit-sheet.tsx:71] — old `||` coerced `""` to `undefined`; new `??` stores `""`. Semantically equivalent for UI; revisit if server rejects empty-string currency.
- `TripEditDestination` has unnecessary `"use client"` — purely presentational, no hooks or event handlers [trip-edit-destination.tsx:1]
- Budget number inputs could pass `NaN` if non-numeric string bypasses `type="number"` [trip-edit-budget.tsx:46,56] — browser returns `""` for invalid number inputs in practice
- `TripEditDestination` read-only within edit form — destination cannot be edited or cleared here; by spec design, revisit when destination editing is scoped
- Cover image URL field accepts data URIs and very long URLs without format validation [trip-edit-cover.tsx:30] — `onError` suppresses broken previews; full URL validation is out of scope for story 2.1

## Deferred from: code review of 2-3-cover-image-picker-upload-and-url-tabs (2026-05-28)

- Test coverage location mismatch — subcomponent tests are in colocated files per project convention, not in cover-image-picker.test.tsx as the spec states; deferred, pre-existing project pattern
