---
title: "Preserve document scope integrity during reservation deletion"
type: bugfix
ticket: "4"
created: "2026-11-12"
status: built
baseline_revision: "153b6e1998119010e3bfef322a89db3fcf1fddff"
route: full
route_source: auto
risk: high
review: "thorough"
review_source: "auto"
lenses_ran: ["blind-hunter", "edge-case-hunter", "verification-gap", "intent-alignment"]
review_loop_iteration: 0
context:
  - "_bmad-output/initiative-mobile-api/AGENTS.md"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Mixed-trip legacy ancestry authorizes document edits through wrong trip. Reservation deletion can remove a concurrently promoted document's file; surviving promoted files also become unreadable after original reservation disappears.

**Approach:** Extend story 3.4 with consistent ancestry validation, transactional reservation deletion sharing document writes' trip lock, and surviving-document download resolution. Branch: `story/3-4-attach-and-promote-documents-through-the-api`; PR base: `feature/api-v1`.

## Boundaries & Constraints

**Always:** Require every populated parent and explicit tripId to resolve consistently; otherwise 404 before PATCH/DELETE, reservation deletion or replay. Preserve same-trip normalization and unchanged-patch no-ops. Recheck role/identity/trip under original trip lock. Queue files transactionally; cleanup only after commit. Preserve server-action/retry semantics. Download fallback requires exact URL, validated ancestry and existing membership authorization.

**Never:** Backfill, migrations, new reservation API, unrelated create/update changes, UI redesign, environment changes, CHANGELOG edits or remote operations. User adds these fixes to story 3.4's scope.

## I/O & Edge-Case Matrix

| State | Expected behavior |
| --- | --- |
| Consistent single/dual legacy links | Existing normalization/no-op semantics |
| Mixed/missing ancestry, including explicit-trip conflict; editor owns one or both trips | 404; row/file unchanged, no effects or cleanup |
| Source becomes inconsistent under lock or before replay | 404; no cached response disclosure |
| Promotion queues first | Deletion excludes promoted row/file; document remains downloadable |
| Deletion queues first | Reservation/document removed; subsequent promotion 404 |
| Queue/DB rollback | Row/file intact; no effects/cleanup; propagate failure |
| Reservation disappears, moves trip, or role lost under lock | Missing is no-op; moved/denied concealed; no effects |
| Storage cleanup fails after commit | Deletion succeeds; queued retry retained |
| Reservation gone, matching surviving document | Members download original bytes; strangers refused; invalid/missing fallback rejected |

</frozen-after-approval>

## Code Map

- `src/lib/document-ancestry.ts`: server-only resolver for three consumers below; accept executor/DB row, return agreed trip or unresolved.
- `src/lib/services/documents.ts`: replace event-first documentTripId with resolver before/under lock; preserve target/replay checks.
- `src/app/(app)/trips/[tripId]/reservations/actions.ts`: retain deleteReservation; lockTripForUpdate, transactional requireTripRole/identity recheck, ancestry validation, queue and cascade. Translate typed access errors to notFound; never catch framework notFound. Effects/cleanup follow actual committed deletion.
- `src/lib/storage/trip-resolution.ts`: add reservation's missing-owner URL fallback, validate surviving document; preserve other scopes.
- Reuse `src/lib/file-cleanup.ts` queue/drain unchanged and `src/lib/services/events.ts::deleteEvent` ordering. Lock/waiter pattern: `tests/e2e/deletion-concurrency-fixture.ts`; scope to scenario trip/PIDs.

## Tasks & Acceptance

**Execution:**

- [x] Tests first: new `src/lib/document-ancestry.test.ts`; `src/lib/services/documents.test.ts` uses table-specific mocks. Cover matrix across rename/empty/unchanged/attach/promote/DELETE, conflicts, missing parents and transactional changes; assert no writes/effects/cleanup on rejection.
- [x] First update `src/app/(app)/trips/[tripId]/reservations/actions.test.ts`: lock/read order, identity/role recheck, promoted attachment excluded, both orders, rollback, cleanup-after-commit, no URLs, missing/moved/retry and cleanup failure. Reuse `src/lib/file-cleanup.test.ts`.
- [x] `src/lib/storage/trip-resolution.test.ts`: valid fallback, missing/ambiguous/orphan rejection, original reservation path.
- [x] Implement resolver and three callers after expanded tests fail. Read version-matched Next.js server-action/notFound docs first. Do not change unrelated reservation writes.
- [x] Extend `tests/e2e/features/api.feature` and `tests/e2e/steps/api-documents.steps.ts`: scenario-owned mixed-trip PATCH/DELETE rejection, actor owning both, unchanged row/file, keyed replay reauthorization after corruption.
- [x] Extend `tests/e2e/features/reservations.feature` and `tests/e2e/steps/reservations.steps.ts`: real PDF upload/promote/delete/reload/download, stranger denial, both deterministic race orders. New `tests/e2e/document-scope-concurrency.ts` holds trip lock and observes blocked writers; finally release/settle resources. Await POST/PATCH before reload.
- [x] `tests/e2e/feature-map.mjs`: register ancestry for API/documents/event-docs/reservations plus storage consumers via STORAGE; map concurrency helper to exercised features. Mark both original deferred entries resolved with evidence and link continuation from original plan, retaining review history.

**Acceptance Criteria:**

- Given inconsistent ancestry, when document mutation or reservation deletion runs, then access is concealed and row/file remain intact.
- Given either observed race order, when requests settle and page reloads, then surviving document downloads original bytes or deletion leaves no dangling file reference.
- Given rollback/storage failure, when deletion settles, then data/files survive rollback or committed cleanup stays retryable.

## Implementation Notes

- `resolveDocumentTripId` treats a missing parent, a link into another trip, or no link at all as unresolved; every populated link plus the explicit trip must agree. Documents rename/attach/promote/delete call it before and under the trip lock.
- `deleteReservation`: preflight `assertTripAccess`, then one transaction: trip lock, `requireTripRole` on the transaction (denied or lost role becomes `notFound()`), reservation re-read (gone = no-op, moved trip = `notFound()`), attached documents read under the lock and each ancestry-checked, file names queued, reservation deleted (cascade removes the rows). Activity, revalidation and `removeQueuedFiles` run only after commit; a cleanup failure is logged and leaves the queue rows for the drain. "Identity" recheck means the reservation id and trip, not a second user lookup.
- `resolveOwningTripId` for a reservation key with no reservation: exactly one document row with the exact `/api/storage/<key>` URL whose remaining links agree on one trip names the trip; the route still enforces membership.
- E2E race scenarios hold the scenario trip row lock through `tests/e2e/document-scope-concurrency.ts` and count only waiters chained to its own backend. Attach is followed by a reload because the freshly attached document is not listed until the page refreshes.

## Plan Change Log

## Review Triage Log

| Finding | Lens | Verdict | Route | Evidence |
| --- | --- | --- | --- | --- |
| `event-document` fallback trusts first row's `tripId`, no ancestry check | blind, edge, verification-gap, intent | medium | defer | Pre-existing code at `trip-resolution.ts` event-document branch; plan says preserve other scopes. Logged in deferred-work. |
| Cascade deletes consistent dual-linked document still tied to an event | blind | false | reject | Owner confirmed an event-and-reservation dual link cannot exist, so the cascade never meets one. |
| Corrupt attached document makes reservation undeletable (404) | blind, edge, verification-gap | false | reject | Matrix requires 404 with row and file unchanged on mixed ancestry; intended behavior. |
| No E2E for mixed ancestry during `deleteReservation`; role-lost and moved paths unit-only | blind | low | reject | Plan lists API and real-PDF reservation E2E; unit tests cover these rows. Adding a scenario is more than a direct fix. |
| Sequential ancestry queries run under trip lock | blind | low | reject | Per-document count is small; no named harm. |
| Fallback scans `documents.url`; duplicate URL yields 404 | blind, edge | false | reject | Matrix requires ambiguous fallback to be rejected; no copy flow sharing a URL was shown. |
| URL encoding or normalization mismatch in fallback | edge | false | reject | Key and stored URL come from one upload path; no mismatch shown. |
| Reservation and survivor reads not transactional | edge | false | reject | Reservation read comes first; a concurrent commit only leaves fewer survivors, never a wrong trip. |
| Cascade queue could delete a file another row still serves | edge | false | reject | Promotion mutates the same row's scope, so the promoted row is not among attached documents; shared-URL rows not shown reachable. |
| `TRIP_NOT_FOUND_MESSAGE` string match for vanished trip | blind | low | reject | Constant from the shared lock helper; no named divergence. |
| Cleanup failure only `console.warn`; drain unproven | blind | false | reject | `drainPendingFileDeletions` in `file-cleanup.ts` retries queued rows; unit test covers the failure and retry. |
| Denied-under-lock surface differs from preflight | edge | false | reject | Both paths conceal through `notFound()`. |
| "Stranger" step deletes caller's collaborator row | blind | low | reject | Step reused from the existing trip-document scenario; the route authorizes through `collaborators`. |
| Plan and review artifacts contradict the code; frontmatter stale | blind | false | reject | Frontmatter now updated; review file is a prior planning artifact, and fixing it edits the plan. |
| `trip-access` and `server-action-locks` under-mapped | blind | false | reject | `trip-access.ts` is mapped in many entries and `server-action-locks.ts` is in `SHARED_GLOBS`. |
| Duplicate `ReadExecutor` type and forwarding wrapper | blind | low | reject | No named caller that will diverge. |
| `removeDocument` passes silently for an absent row | edge | false | reject | Absent row cannot be ancestry-checked; the no-op returns null and discloses nothing. |
| Fallback `where` predicate not pinned by an assertion | verification-gap | low | reject | `length === 1` and ancestry guards plus the E2E happy path bound the impact; a robust assertion needs drizzle SQL introspection. |
| E2E step guards and lock-helper misuse errors | edge | low | reject | Test hygiene with no named harm. |
| Intent reading: other ancestry consumers (mapper, event and trip delete) untouched | intent | n/a | reject | Descriptive; plan scopes three consumers and excludes the mapper. |

## Verification

- Targeted Vitest files above plus `scripts/feature-map.test.mjs`: all pass.
- Focused new API/reservation Playwright cases pass without sleeps/shared mutable fixtures.
- Parent owns build-validator: lint/types/build, coverage alone, affected E2E alone; implementation agent must not invoke it.
