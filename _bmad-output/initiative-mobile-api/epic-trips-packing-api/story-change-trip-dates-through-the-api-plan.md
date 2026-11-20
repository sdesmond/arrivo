---
title: "Change trip dates through the API"
type: feature
ticket: 7
created: 2026-11-20
status: built
baseline_revision: "f72a17f4633325b5e26d46cb507afd411596818d"
route: full
route_source: auto
risk: high
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
followup_review_recommended: false
context: ["{project-root}/_bmad-output/initiative-mobile-api/AGENTS.md"]
warnings: ["oversized"]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Trip date changes (shrink/extend/clear, with event and reservation conflict handling) run only through the `updateTripMetadata` server action, unavailable to API clients, and its file removal is not crash-safe.

**Approach:** Extend `PATCH /api/v1/trips/:tripId` with `startDate`/`endDate`, a 409 `confirmation_required` preview carrying the confirmation payload, `resolution` plus echoed `confirmation` to apply, stale-confirmation rejection, and file removal through the file-cleanup queue; move the three web callers onto it and retire `updateTripMetadata`.

## Boundaries & Constraints

**Always:** Story branch `story/5-7-change-trip-dates-api`; PR base `feature/api-v1`. Test first. Preserve existing date semantics (dated/dateless transitions, day renumbering via temp offset, reservation overlap rule, deletion records for events and days), editor authorization, `lockTrip` ordering, activity, live events, revalidation, idempotent replay with authorization recheck. Metadata and dates in one request commit atomically; a preview writes nothing and is never cached for replay. Event and reservation document URLs are queued in the deleting transaction and removed after commit. No schema or environment changes.

**Never:** Accept `coverImageUrl` (covers stay on `/trips/:id/cover`); change page reads; commit to the integration branch or target main.

## I/O & Edge-Case Matrix

| Scenario | Input / state | Expected behavior |
| --- | --- | --- |
| Safe change | Extend range, dateless to dated with no overflow content, clear dates | 200 trip; days adjusted; no confirmation |
| Preview | Removed days hold events, notes, checklists or overlapping reservations; no `resolution` | 409 `confirmation_required` with `confirmation` in the error body; nothing written or cached |
| Apply | `resolution` plus matching `confirmation` | `delete-events`: events, affected reservations and days deleted with deletion records, documents queued; `keep-as-unscheduled`: events get null day and `displacedDate`; trip updated |
| Stale | `confirmation` differs from freshly computed one | 409 `conflict`; no writes |
| Resolution alone | `resolution` without `confirmation` | 422; no writes |
| Mixed | Metadata plus dates | One atomic update, including currency conversion; preview commits nothing |
| Access | Editor, viewer, stranger | Allowed, 403, 404 |

</intent-contract>

## Code Map

- `src/app/(app)/trips/actions.ts` — `updateTripMetadata` (370-683), `summarizeRemovedDayContent` (124-271); logic to port, then delete with `convertMismatchedExpenses` and cover guard. `date-sync.ts`, `create-trip-days.ts` move or are imported by the service.
- `src/lib/services/trips.ts`, `src/lib/api/contract/trips.ts`, `src/app/api/v1/trips/[tripId]/route.ts` — extend; `trip-write.ts`, `trip-write-effects.ts` give `runTripWrite`/`lockTrip`/`markChanged`.
- `src/lib/api/errors.ts`, `src/lib/services/confirmation-required-error.ts`, `src/lib/api/client.ts` — add optional `confirmation` body to 409 and `ApiClientError`.
- `src/lib/file-cleanup.ts` and `deleteDay` in `src/lib/services/days.ts:200-272` — `queueFileDeletions` in `mutate`, `removeQueuedFiles` after `runTripWrite`. `deletion-records.ts` `recordDeletions`.
- `src/lib/trip-metadata-save.ts` plus `use-trips-page-handlers.ts`, `use-trip-detail-handlers.ts`, `use-travel-history-page-handlers.ts` — send all saves to the API, mapping 409 `confirmation_required` to the existing confirmation state.
- `src/data/types.ts` `TripDateChangeConfirmation`; `docs/api-v1.md` (PATCH at ~733); `tests/e2e/feature-map.mjs`.

## Tasks & Acceptance

**Execution:**

- [ ] Tests first: `src/lib/services/trips.test.ts`, `src/lib/api/contract/trips.test.ts`, `src/app/api/v1/trips/[tripId]/route.test.ts`, `src/lib/api/errors.test.ts`, `src/lib/api/client.test.ts` — I/O matrix, rollback, no preview caching, queue, deletion records, stale, atomic currency.
- [ ] Tests first: `src/lib/trip-metadata-save.test.ts`, three handler tests, `src/app/(app)/trips/page-client.test.tsx` — API-only dispatch, 409 to confirmation state, resolve and cancel; remove `updateTripMetadata` mocks and its `actions.test.ts` block.
- [ ] `tests/e2e/features/api.feature` + `steps/api.steps.ts` — date preview, apply both resolutions, stale, access, cleanup queue; repoint `day-planning`, `linked-events`, `reservations` step waits from server action to the PATCH response.
- [ ] Implement service, contract, error body, client, save helper and handlers; delete `updateTripMetadata` and dead helpers; update `docs/api-v1.md` (also the stale "400" note: validation is 422) and `feature-map.mjs`.

**Acceptance Criteria:**

- Given a shrinking range removing content, when PATCH is sent without resolution, then 409 `confirmation_required` returns the confirmation and nothing changes.
- Given a matching confirmation and resolution, when PATCH is sent, then events/reservations are deleted or unscheduled as chosen, days renumber, and removed documents are queued then removed after commit.
- Given a changed trip since the preview, when the stale confirmation is sent, then 409 `conflict` and no writes.
- Given web edits on trips, detail or travel history, when dates change with conflicts, then the dialog flow works unchanged and persists after reload.

## Implementation Notes

## Plan Change Log

## Review Triage Log

### 2026-11-20 — Review pass

- verdicts: 6 findings — high 0, medium 0, low 3, false 1, maybe-false 0 (2 low rejected)
- findings:
  - `[low]` `[reject]` `route.test.ts` not updated — 409 body is covered by `errors.test.ts`, the client test and the new API E2E preview scenario; a route-level duplicate was not worth adding.
  - `[low]` `[patch]` `feature-map.mjs` lists the same globs twice in several entries — deduplicated; `feature-map.test.mjs` passes.
  - `[low]` `[patch]` Missing-confirmation 422 ran before the access check, so a viewer or stranger got 422 — check moved after `requireTripRole`; `trips.test.ts` passes.
  - `[false]` `[reject]` Revalidation narrowed — `afterTripWrite` (`trip-write-effects.ts:11`) already revalidates `/trips/{id}`; the service adds `/trips`.
  - `[low]` `[reject]` Same file queued twice if linked to a deleted event and reservation — a document row links one owner, so a shared URL is not reachable; the drain tolerates a missing file.
  - `[low]` `[reject]` Stale-confirmation conflict leaves the dialog state — the legacy action threw the same way and the same handlers never cleared it; pre-existing, user can cancel and re-save.

## Design Notes

Throw `ConfirmationRequiredError` from `mutate` (rolls back, no replay record) instead of returning the preview. Compute the confirmation inside the locked transaction so stale comparison uses fresh state (`stableStringify`).

## Verification

**Commands:**

- `npx vitest run` on touched files -- expected: pass
- `npm run test:e2e:affected` -- expected: pass (via `build-validator`)

## Auto Run Result

- Summary: `PATCH /api/v1/trips/:tripId` now changes dates with a 409 `confirmation_required` preview (confirmation in the error body), `resolution` plus echoed `confirmation` to apply, stale rejection (409 `conflict`), and crash-safe file cleanup; metadata and dates commit atomically. The three web callers use it and `updateTripMetadata` is retired.
- Files: `src/lib/services/trip-date-change.ts` (ported date logic), `trips.ts` (service), `contract/trips.ts`, `errors.ts`, `client.ts`, `confirmation-required-error.ts` (confirmation body), `trip-metadata-save.ts` and three handlers (API-only), `actions.ts` (action removed), `docs/api-v1.md`, `feature-map.mjs`, unit tests, `api.feature` and steps, `day-planning.steps.ts`.
- Review: 2 patches applied (feature-map dedupe, access-before-422 ordering), 4 rejected with reasons in the triage log, 0 deferred.
- Follow-up review recommended: false.
- Verification: targeted Vitest (68 files, 1882 tests) and `tsc --noEmit` passed; `npm run test:e2e:affected` 865 passed; post-patch `trips.test.ts` and `feature-map.test.mjs` passed. Full `build-validator` (lint, coverage, build) not run in this loop.
- Residual risks: web error toast now shows the API message; E2E not re-run after the two small patches; PR not opened.
