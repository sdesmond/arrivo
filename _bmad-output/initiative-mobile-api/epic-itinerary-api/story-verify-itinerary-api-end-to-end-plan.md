---
title: "Verify itinerary API end to end"
type: chore
ticket: "10"
created: "2026-11-11"
status: built
baseline_revision: "42f0b73221975832e06baa45a9385ecdcc31dce0"
route: full
route_source: auto
risk: high
review: 'thorough'
review_source: 'auto'
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 0
context: [_bmad-output/initiative-mobile-api/AGENTS.md]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Stories 2.1–2.9 migrated itinerary writes, but epic completion needs integrated production-build evidence. API tests lack cached replay after access loss for itinerary routes and changed-body day-order key reuse.

**Approach:** Close those gaps; audit I1–I10 and Done-when 1–3; exercise relevant API/web flows under `next start` on `arrivo_e2e`; fix acceptance failures tests first; run project-owned `build-validator` afterward.

## Boundaries & Constraints

**Always:** Actual branch `story/2-10-verify-itinerary-api` from latest `feature/api-v1`; PR base `feature/api-v1`; return after authorized PR. Scenario-owned mothers/materializers; API waits before gestures; preserve authorization, locking, positioning, linked events and post-commit cleanup. Name colocated tests before any runtime fix; register changed runtime ownership in feature map. Record full canonical revisions.

**Never:** New capabilities, broad cleanup, unrelated deferred findings, migrations, new environment requirements, `CHANGELOG.md`, automatic full-suite E2E, ticket edits/mark/pull, or unauthorized push/PR.

## I/O & Edge-Case Matrix

| Given | When | Then |
| --- | --- | --- |
| Successful keyed write | Demote actor to viewer; repeat exact request | 403 `forbidden`, no-store; no cached success or further mutation |
| Successful keyed write | Remove membership; repeat exact request | 404 `not_found`, no-store; no cached success or further mutation |
| Reversed day order saved with key | Reuse key for original list | 409 `conflict`; reversed order persists |
| Production server | Run existing persistence scenarios | CRUD, mixed ordering, rapid writes, linked events and documents survive reload |

</frozen-after-approval>

## Code Map

- `tests/e2e/features/api.feature`, `tests/e2e/steps/api.steps.ts`: mixed-day fixture, role Given, `headers`, request helpers, per-page state, key cleanup. Fourteen operations: event create/edit/delete; day order; day-note create/edit/delete; trip-note create/edit/delete/order; day edit/append/delete. Delete services authorize body `tripId` even after resource deletion. Save exact request descriptor before deletion. Snapshot full relevant rows/content, positions and trip end date, not IDs alone.
- `tests/e2e/features/`: `day-planning`, `linked-events`, `event-docs`, `trip-notes`, `trip-live-refresh`, `packing-lists`, `app-activity` already cover mixed persistence, rapid drags, linked exclusion, document decisions, checklist drafts and live sync; reuse scenarios.
- `src/lib/services/` and `src/lib/api/`, colocated tests, `src/app/api/v1/**/route.test.ts`: service/transport evidence. Story 2.9 consolidated `readDayTripId`; preserve it. Deferred findings stay deferred unless reproduced acceptance failures require fixes.
- `src/app/(app)/trips/[tripId]/actions.ts`: audit retired names `createEvent`, `updateEvent`, `deleteEvent`, `deleteEventWithDocDecision`, `reorderDayItems`, `updateDay`, `addDay`, `removeLastDay`, `createNote`, `updateNote`, `deleteNote`, `createTripNote`, `updateTripNote`, `deleteTripNote`, `reorderTripNotes`. Distinguish valid same-named service/contract exports from action callers.
- Pilot `story-verify-checklist-pilot-end-to-end-plan.md`: production procedure; `playwright.config.ts` owns E2E env/storage/timezone, `scripts/run-e2e.mjs` supports explicit grep/server reuse. Feature map already covers API feature/steps.

## Tasks & Acceptance

**Execution:**

- [x] `tests/e2e/features/api.feature` then `tests/e2e/steps/api.steps.ts`: 28 replay-denial examples (14 operations × viewer/stranger). Prove initial success and persisted effect, change role, retry identical method/path/body/key, assert exact denial envelope/no-store and unchanged post-commit DB snapshot. Keep deleted IDs deleted.
- [x] Same files: changed-body day-order key conflict scenario; assert 409 and stored reversed order.
- [x] This plan: evidence map from I1–I10 and Done-when 1–3 to tests/ADRs/results; audit production imports/callers of 15 retired actions.
- [x] Run targeted checks below. Build `.next-prod`; start production server on E2E port with existing E2E DB/storage/stub/timezone settings and `AUTH_TRUST_HOST=true` (Docker parity). Run selected production features; record counts, fix acceptance failures tests first, stop task-owned server.
- [x] Invoke `build-validator` after targeted checks pass: finish lint/types/build, then coverage alone, then affected E2E alone. Record results.

**Acceptance Criteria:**

- Given any successful keyed itinerary mutation, when editor access is lost, then exact retry denies without cached payload or further change.
- Given a saved day-order key, when reused with different list, then 409 leaves first order persisted.
- Given production build on E2E DB, when selected scenarios run, then all pass and prove epic Done-when 1–3, including reload persistence.
- Given final tree, when audit and validator finish, then retired-action callers number zero and all validation gates pass without migrations/new environment requirements.

## Implementation Notes

Actual branch: `story/2-10-verify-itinerary-api`; PR base: `feature/api-v1`. HEAD, local base and remote-tracking base all resolved to `42f0b73221975832e06baa45a9385ecdcc31dce0` before implementation. No runtime changes were needed.

The replay outline covers all fourteen operations for both viewer and removed-member access. Each first request must return 200/204 and persist its specific content/order/deletion/end-date effect. The exact method, path and body are retained before any deletion and retried with the original key. Denial asserts the complete error envelope, no-store and identical full trip/day/event/day-note/trip-note/checklist/item/document/expense rows, including timestamps, content and positions. Existing key cleanup owns the scenario key. Deleted resource IDs remain absent.

### Epic evidence map

| Item | Evidence |
| --- | --- |
| I1 | `src/lib/services/timeline-positions.test.ts`; event/note/checklist service tests; `day-planning.feature` mixed insertion/edit/delete scenarios. |
| I2 | `src/lib/services/events.test.ts`, `src/lib/api/contract/events.test.ts`, event route tests and API create/edit/delete scenarios; `linked-events.feature` rapid drags beside linked events; `event-docs.feature` keep/discard persistence. |
| I3 | Day-order route and timeline-position tests; API full-list/stale-list/replay cases plus new changed-body key conflict; `day-planning.feature` rapid successive drags and `linked-events.feature` rapid drags. |
| I4 | `src/lib/services/itinerary-notes.test.ts`, matching contract/route tests, API note create/edit/delete cases; `day-planning.feature` mixed note persistence. |
| I5 | `src/lib/services/trip-notes.test.ts`, matching contract/route tests, API note CRUD/order cases; `trip-notes.feature` prepend, editing position, deletion and pointer/keyboard/rapid reorder persistence. |
| I6 | `src/lib/services/days.test.ts`, matching contract/route tests and API edit/append/delete matrix (cap, confirmation, conflicts, cleanup, end date); `day-planning.feature` dated/dateless append and last-day removal. |
| I7 | `src/lib/services/conflict-error.test.ts`, `src/lib/api/errors.test.ts`, `src/lib/api/idempotency.test.ts`, checklist/event/note/day service tests; `docs/decisions/adr-api-service-boundaries.md`. |
| I8 | `use-day-draft.test.ts`, `checklist-item.test.tsx`, trip-detail handler tests, trip-note editor tests and API UUID retry-after-position-shift cases; `packing-lists.feature` source insertion; `day-planning.feature` failed creation retry. |
| I9 | `src/lib/api/client.test.ts`, `src/lib/api/use-api-mutation.test.tsx`, `src/lib/services/checklists.test.ts` (timeout, resource errors, throwing success callback, no-op effects); `docs/decisions/adr-api-client-mutations.md`. |
| I10 | Colocated service/contract/route/client/component tests, `scripts/feature-map.test.mjs`, `tests/e2e/api-response.test.ts`; affected API/web features and app-activity API waits. |
| Done-when 1 | Production build plus selected API feature exercises notes/events/days/full-list ordering through `/api/v1`; route/service tests verify boundaries. |
| Done-when 2 | Production `day-planning`, `linked-events`, `event-docs`, `trip-notes`, `packing-lists` persistence and rapid-write scenarios; move means within-day reorder, as clarified by epic. |
| Done-when 3 | Partial PATCH and access matrices in API feature and contract/service/route tests, including 28 cached replay denials; targeted tests and project validator. |

Retired-action audit: searched every non-test file under `src` for the fifteen exact retired names. Zero occurrences in trip-detail `actions.ts`; all remaining occurrences resolve to API contracts or service definitions/imports. UI consumers resolve to API contracts (`use-trip-detail-handlers`, delete-event dialog, trip-note editor/tab/reorder hook). Remaining action imports concern documents, cover images, trip metadata or other domains. Retired action production exports/imports/callers: **0**. Preserved consolidated `readDayTripId`; no deferred findings taken into scope.

## Plan Change Log

## Review Triage Log

- Blind 1 — medium, patch: initial success and denial alone could pass if a route stopped caching. Add one actor/key replay-record assertion matching the first response.
- Blind 2 — low, patch (same cache-observation root cause as Blind 1): domain snapshots omit the replay row; include it so denial must preserve cached response and metadata.
- Blind 3 — false: inspected `withIdempotency`; authorization throws before mutation and rolls back the transaction. No reachable same-value write on denial was identified. Full domain snapshots cover committed state; checklist trigger-audit helpers target a different resource.
- Blind 4 — low, rejected: these deletion cases do not cover file cleanup, but existing populated deletion and event-document scenarios exercise that path. Expanding fixtures and filesystem audit machinery for denied retries adds complexity without an observed cleanup defect; authorization precedes mutation and post-commit cleanup.
- Blind 5 — maybe-false, rejected: cookie restoration after the newly adjacent clear remains theoretically possible, but production reruns passed and no outstanding-response overlap after that clear was established. Isolated contexts add lifecycle complexity for an unverified low-impact test race.
- Blind 6 — false: absence of extra anonymous/revoked-session replay cases is not a demonstrated authentication gap. Shared `apiRoute` calls `requireApiUser` before idempotency/service execution; existing auth, route and API matrices cover authentication. Story's new matrix targets trip-access loss.
- Edge-case hunter — no findings.
- Verification-gap reviewer — no verification gaps.
- Intent alignment — evidence-completion reading matches ticket: existing production browser scenarios plus new HTTP cases and evidence audit. Initial production failures and clean affected-group reruns are recorded separately; no claim of a single clean 425-case rerun. Validator remains pending until parent gate completes. No additional work prescribed by lens.
## Verification

Targeted results: 62 Vitest files / 1,272 tests passed; targeted ESLint and TypeScript passed. New E2E cases: **29 scenarios plus authentication setup = 30 passed**. First run exposed an incorrect test expectation that trip-note creation appended; corrected the assertion to position 0 (prepend, as required by I5), then reran all new cases successfully. No production code change was required.

Production build: `NEXT_DISTDIR=.next-prod npm run build` passed. Started `next start -p 3001` with the existing Playwright E2E DB, storage, stub, maintenance and timezone settings plus `AUTH_TRUST_HOST=true`. The initial selected eight-feature production run completed **421 passed / 4 failed (425 total)**; all 29 new cases passed. The failures exposed existing test synchronization gaps:

- `app-activity.steps.ts`: forged MFA callback's UI filter ended at HTTP response time although Activity records after the response. After the existing persisted-row assertion, derive the filter end from the stored row's `endedAt`.
- `api.steps.ts`: two older anonymous checklist helpers cleared cookies only in the Given; an in-flight page response could restore them during DB fixture reads. Clear them immediately before sending, matching the newer helpers' existing pattern.
- `trip-notes.steps.ts`: keyboard reorder could drop before the lifted/moved state rendered. Await `aria-pressed=true` after lift and the incremented position label after ArrowDown before arming the existing API wait and dropping.

These changes alter test synchronization only. The original failing scenarios provide failure-first evidence. Reran their full scenario-outline groups against the same production build after the fixes: **18 passed** (6 item-denial examples, 9 lifecycle-denial examples, forged callback, keyboard reorder, authentication setup). The initial selected run and clean affected-group rerun together exercise all selected scenarios; the entire 425-case selection was not rerun. Targeted ESLint passed for all three step files; final TypeScript check passed. Task-owned production server stopped; isolated `.next-prod` output removed and Next-generated `tsconfig.json` additions restored.

- `npx vitest run src/lib/services src/lib/api src/app/api/v1 "src/app/(app)/trips/[tripId]" scripts/feature-map.test.mjs tests/e2e/api-response.test.ts` — final rerun: 62 files/1,272 tests passed.
- `node scripts/run-e2e.mjs --server=kill "--grep=Cached itinerary replay|Changed day order with the same key"` — 29 new cases pass.
- `node scripts/run-e2e.mjs --server=reuse "--grep=@feat:(api|day-planning|linked-events|event-docs|trip-notes|trip-live-refresh|packing-lists|app-activity)"` — 421 passed / 4 failed initially; all four affected scenario groups passed in the 18-test production rerun recorded above.
- `build-validator` — PASS: lint, TypeScript, production build; coverage 444 files / 7,512 tests (97.90% lines, 97.52% functions, 93.75% branches); affected E2E 354 passed / 0 failed across API, app-activity and trip-notes.

Review patch verification: 28 cached replay examples plus setup passed after adding actor/key-scoped replay-record assertions. Each initial response now matches exactly one cached result (null for delete); full record remains unchanged after denial. Removed redundant trip-note path assignments.

Validator E2E initially encountered widespread nested-route 404s from stale generated dev route discovery: collection/order sources existed but were absent from active dev manifest. Stopped that incomplete run, cleared only generated E2E dev caches, then reran unchanged affected command: **354 passed (10.8 minutes), 0 failed**. No source fix was needed for cache recovery. Lint, types, build and isolated coverage had already passed; only affected E2E was repeated after cache cleanup. No full-suite run, migrations or new environment variables.