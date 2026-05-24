# Deferred Work

## Deferred from: code review of 4-4-client-side-field-validation (2026-05-22)

- **`Field` silently drops `error` when `htmlFor` absent** — spec-compliant (AC1 says "if htmlFor is absent, the error is not rendered") but a future footgun: a developer who adds `error` to a `Field` without `htmlFor` sees nothing and ships broken UX. Fix path: add a dev-only `console.warn` or tighten the prop type to require both together.

- **Age `parseInt` accepts decimals and trailing garbage** — `"25.7"` parses to `25`, `"25abc"` parses to `25`. Mostly prevented by `<input type="number">` in most browsers. Fix path: replace `parseInt(age, 10)` + `isNaN` with `Number.isInteger(Number(age))`.

---

## Deferred from: code review of 4-3-companion-data-integrity (2026-05-22)

- **Non-atomic cap + position in `addCompanion`** — cap check and `nextPos` query are two separate SELECTs with no wrapping transaction. Concurrent inserts from the same `userId` could bypass the 20-cap or produce duplicate `position` values. Low-risk for a single-user personal planner; fix path: merge into a CTE or wrap in a serializable transaction.

- **Same atomicity gap in `addLoyaltyNumber` / `addWishlistDestination`** — the position formula was fixed from COUNT to MAX+1 but the SELECT+INSERT pair remains non-atomic, same as companions.

- **No E2E coverage for 20-companion cap or validation error toasts** — excluded per dev notes as server-side correctness fixes with no new user-facing flow. Add scenarios if a regression occurs.

---

## Promoted to story: 4-4-client-side-field-validation (2026-05-22)

Fields with existing server-side validation rules have no inline client-side feedback. `Field` in `form-section.tsx` needs an `error` prop; companion name/age fields, the companion add input, and the password change form should validate client-side and show inline errors. Auth forms are intentionally excluded (form-level error is correct for sign-in/sign-up security). See `4-4-client-side-field-validation.md`.

---

## Deferred from: code review of story-3-2-delete-an-event-with-attached-documents (2026-05-21)

- **`hasDocs` decision uses stale client-side data** [src/components/packt/place-row.tsx:229] — Spec explicitly approved the client-side check, but if a collaborator attaches a doc concurrently, the local user bypasses the confirmation dialog and the cascade FK silently deletes the new doc. Revisit if multi-editor concurrency becomes real.

---

## Follow-ups from itinerary drag-reorder review (2026-05-16)

Surfaced during step-04 review of `spec-add-itinerary-drag-reorder.md`. Real but out of scope for that ticket.

### DragOverlay clones run their own side effects
`DragOverlay` mounts a fresh `NoteItem` / `ChecklistItem` for the duration of a drag. Each clone runs its own `useEffect`s — most visibly, a completed checklist's 600 ms completion-animation timer fires again on drag start. The clones also drop props the live row had (`isLast`, `onAddDoc`, etc.), so the overlay can look subtly different from the row that was grabbed. Fix path: add a stripped-down presentational variant or a `displayOnly` mode that no-ops the effects, used by the overlay branch in `day-card.tsx`.

### Reorder action lacks ownership/integrity checks
`reorderDayItems` in `src/app/(app)/trips/[tripId]/actions.ts` writes positions per item, gated only by `id = item.id AND dayId = input.dayId`. If a peer added or moved an item between the client's drag start and submit, the per-row UPDATE silently affects zero rows for the missing IDs and renumbers the rest against a stale set, producing colliding `position` values across the three tables. Fix path: inside the transaction, `SELECT` the live `(dayId)` rows, assert the submitted set matches (or merge unknown items at the tail), and reject mismatched payloads.

### No optimistic rollback / no error surfacing on reorder failure
`handleDayItemsReorder` in `page-client.tsx` calls `reorderDayItems` inside `React.startTransition` with no try/catch and no local snapshot. On network failure or auth loss the dropped order persists in the DOM until `revalidatePath` returns server state — no toast, no rollback, no signal to the user. Fix path: optimistic local state with rollback, or a try/catch + toast.

---

## Follow-ups from companions feature review (2026-05-18)

Surfaced during step-04 review of `spec-profile-companions.md`. Pre-existing patterns applied consistently; real but out of scope.

### Position gaps after companion delete
`deleteCompanion` removes the row but does not recompact `position` values for remaining companions. Gaps (e.g. positions [0, 1, 3]) cause `addCompanion`'s `count(*)`-based position assignment to produce duplicates when any intermediate position was deleted. Same issue exists in `userLoyaltyNumbers` and `userWishlistDestinations`. Fix path: recompact positions in a transaction after delete, or switch to a sparse-safe ordering scheme.

---

## Deferred from: code review of 1-3-browse-and-delete-documents (2026-05-19)

Surfaced during step-04 review of `1-3-browse-and-delete-documents.md`. Real but out of scope for story 1.3.

### `removeDocument` silently returns on orphan rows
`actions.ts:356-357` returns `undefined` when neither `tripId` nor `eventId` is set on a document row. Schema permits this state (`src/db/schema.ts` has no `.notNull()` and no CHECK constraint on either FK). Function does nothing — no log, no error — so the button is permanently dead for that row. Pre-existing; fix path: add a CHECK constraint requiring at least one FK, or log/throw on the orphan case.

### Server-action import path coupling in client components
`DocRow` and `TripDocsTab` both import server actions via the literal `@/app/(app)/trips/[tripId]/actions` path, which couples each leaf component to a single route. Refactoring to an `onDelete` / `onUpload` prop would decouple them and simplify unit tests (no need to mock route-specific paths). Established pattern across the codebase; would be a broader refactor.

### Missing DB index on `documents.added_at`
`getTripDetail` now sorts by `desc(addedAt)`. Acceptable at current scale; revisit when per-trip document volume grows or the column is used for cross-trip queries.

### E2E scenario ordering hazard if Playwright `fullyParallel` is ever enabled
`documents.feature` relies on file-order execution (Delete before Upload) for empty-state assertions to hold. `global-setup.ts` reseeds only once per suite, not per scenario. If a future config change parallelizes or shuffles scenarios, the empty-state assertion will flake. Fix path: a `Before` hook that reseeds, or a Background that resets to a known document count.

### AC4 blob-cleanup path has no automated test
`actions.ts` is excluded from coverage and E2E runs with `UPLOAD_STUB=true`, so the `del(doc.url)` branch is never executed by any test. The spec explicitly authorizes this exclusion. Defer reason: verifying it requires real Blob storage or an integration test layer that does not yet exist.

### `getByText(docName).not.toBeVisible()` is a substring match
The "no longer visible" step in `documents.steps.ts:30-32` would also resolve to the delete button's accessible name (`Delete <name>`) on strict matching, since both contain the doc name. Works today because the seed name is unique. Tightening to `getByRole("button", { name: \`Delete ${name}\` }).not.toBeVisible()` would be more precise.

---

## Deferred from: code review of 2-1 & 2-2 doc-viewer (2026-05-21)

Surfaced during step-04 review of `2-1-open-document-in-the-in-app-viewer.md` and `2-2-render-document-content-in-the-viewer.md`. Real but out of scope for these stories.

### Icon-button style duplication
Three near-identical inline-style blocks (close, share in `doc-viewer.tsx`; view in `doc-row.tsx`). Future a11y/focus-ring/touch-target fixes have to touch every copy. Fix path: extract a small `IconButton` primitive or a shared style constant in `src/lib/`.

### PDF rendering has no Android browser fallback
Only mobile Safari is special-cased. Android Chrome and Firefox also often refuse to render PDFs inline and may show a download prompt instead. Out of Story 2.2 scope. Fix path: detect Android UA and treat similarly to mobile-Safari fallback.

### Mobile full-screen popup ignores iOS safe-area insets
`position: fixed; inset: 0` on mobile pushes the close button and header behind the iOS notch / home indicator. No `env(safe-area-inset-*)` padding applied. UX polish, not in AC. Fix path: add `paddingTop: env(safe-area-inset-top)` etc. to the mobile popup style.

### `isMobileSafari` regex misses other iOS browsers
Only excludes `CriOS|FxiOS|OPiOS|mercury` — Edge iOS (`EdgiOS`), DuckDuckGo, Brave, etc. all wrap WebKit and would incorrectly take the "mobile Safari" fallback branch. Spec's exclusion list was minimal; widen when those browsers are reported as broken.

---

## Deferred from: code review of 1-2-create-trip-server-action-initial-trip-page (2026-05-23)

- **No `assertTripAccess` in `createTrip`** — Creation of non-existent resource; can't assert. Pre-existing pattern across all create actions.
- **DST-safe date arithmetic concern** — False positive finding. `Date.getTime()` uses UTC ms, unaffected by DST transitions.
- **Timezone shift in `T00:00:00` parsing** — Follows same `"T00:00:00"` convention as `getTripStatus`/`getTripDays` in utils.ts. Consistent with codebase pattern; pre-existing.
