---
title: Preserve pending event-edit intent
type: bugfix
ticket: ""
created: "2026-11-11"
status: built
baseline_revision: "45e85e74756587a9e3ad64a18c26d2983cbf0ef4"
route: full
route_source: auto
risk: medium
review: 'thorough'
review_source: 'auto'
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Event updates are inferred by comparing a full edited row against stale server props. Saving a field back to its original value before an earlier save refreshes can silently discard the latest intent. Retrospective F-1 reproduced this with event time.

**Approach:** Have event editors submit only explicitly saved fields plus event identity. Preserve per-event serialization and API absent-means-unchanged/null-means-clear semantics; do not infer user intent by diffing whole server rows.

## Boundaries & Constraints

**Always:** Latest field save wins after queue settles; disjoint edits compose; absent fields stay unchanged, explicit clears become null, zero coordinates remain valid. Preserve error toasts, linked-event read-only behavior, draft creation, cancellation and permissions. User chose current branch `chore/epic-2-retrospective`; PR base `feature/api-v1`. Preserve existing retrospective.

**Never:** Diagnose/fix keyboard reorder in this change; change checklist retries, cleanup maintenance, migrations, transport queues or navigation lifetime behavior; introduce global optimistic state; run full E2E suite; push without authorization. No unrelated component extraction or formatting sweep.

## I/O & Edge-Case Matrix

| Scenario | Input / state | Expected behavior | Error handling |
| --- | --- | --- | --- |
| Reversion | First field write held; second save restores rendered original | Both explicit saves reach same event queue; original persists | Existing toast on failure |
| Clear | Originally empty time/location; pending nonempty write followed by clear | Explicit nulls restore empty stored values | Existing toast |
| Disjoint edits | Name, time, location or note saved from stale props | Only each saved field group is sent; earlier unrelated changes survive | Existing toast |
| Empty update | Identity without saved fields | No request | No error |
| Cancel/invalid name | Escape or empty name | No mutation; existing draft behavior preserved | Existing behavior |

</frozen-after-approval>

## Code Map

- `src/data/types.ts`: canonical `TripEvent`; define narrow event-update intent type here rather than local domain duplicates.
- `src/components/arrivo/place-row.tsx`: name/note/time/location callbacks spread `place`. Name/note also suppress saves against stale props. Track user editing per input session: untouched blur stays a no-op; edited valid input submits even if equal to props. Time/location explicit Save submits owned fields. Preserve Enter/blur single-save behavior.
- `src/components/arrivo/day-card.tsx`, `day-card-body.tsx`, `day-card-dnd.tsx`: typed callback chain forwards updates directly. Propagate intent type mechanically.
- `src/app/(app)/trips/[tripId]/{trip-detail-tab-body,trip-itinerary-view,unscheduled-events-section}.tsx`: remaining callback declarations; propagate same type, retaining scheduled/unscheduled routing.
- `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts`: `eventPatchBody` and `handleEventUpdate` currently locate stored row and discard empty diff. Replace inference with explicitly present writable fields, normalize clear values, keep `event:${id}` queue key.
- `tests/e2e/steps/day-planning.steps.ts`: existing untimed-event mother tag, event ID helper and API waits; reuse scenario-owned fixtures and hold first PATCH deterministically.

## Tasks & Acceptance

**Execution:**

- [x] Tests first: `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.test.tsx`: held-write reversions, clears, disjoint edits, scheduled/unscheduled identity, empty updates, zero coordinates and failures. Use controlled promises.
- [x] `src/components/arrivo/place-row.test.tsx`: exact field-only name/note/time/location payloads, clears, baseline reversions with unchanged props, untouched blur, Enter without duplicate save, Escape/empty-name/draft behavior.
- [x] Colocated `day-card.test.tsx`, `day-card-body.test.tsx`, `day-card-dnd.test.tsx`: narrow-intent forwarding. Route type-only changes checked by TypeScript; existing route/component tests also run. No new navigation mocks.
- [x] `tests/e2e/features/day-planning.feature` and `tests/e2e/steps/day-planning.steps.ts`: hold first PATCH; restore time/location to empty; assert ordered successful writes then reload and check DB/UI. Release interception in finally; use scenario-owned fixtures, no fixed sleeps.
- [x] Implement narrow update type, field-specific editor emissions, callback type propagation and handler normalization after regression tests demonstrate failure.
- [x] Run targeted component/hook tests and new E2E scenarios; repeat new scenarios against production build. Resolve review findings, then project validator owns final gate.

**Acceptance Criteria:**

- Given a pending event-time/location save, when user explicitly restores original empty value, then latest intent persists after both requests and reload.
- Given an earlier edit to another field, when user saves a second field from stale props, then both changes persist without overwriting unrelated fields.
- Given existing name/note editors, when user saves original value after another submission, then latest save is represented; when cancelled or name blank, then no unintended mutation occurs.

## Implementation Notes

- Plan-reviewer: all five checks ran inline against event-fix request. Zero blockers; one architecture warning for existing callback depth, retained to avoid unrelated context refactor. JSX spans below 250: PlaceRow 170, DayCard 58, Body 64, Dnd 122, Unscheduled 76, Itinerary 144, TabBody 123. Existing interfaces/client declarations and controls retained. All covered component edits have colocated tests and E2E regression intent.

## Plan Change Log

## Review Triage Log

| Finding | Verdict / route | Evidence |
| --- | --- | --- |
| Blind 1: structural typing permits full rows | false / reject | All actual editor emitters send identity plus owned fields; caller search found no remaining full-row submission. A possible future caller is not a demonstrated defect. |
| Blind 2: unbounded first-request arrival wait | low / patch | Missing PATCH would consume scenario timeout rather than fail a bounded request assertion; replace arrival promise with bounded expectation. |
| Blind 3: disjoint browser coverage | false / reject | Controlled-promise hook case verifies disjoint payload composition; editor tests verify exact field ownership. Real-dialog E2E covers both reproduced empty reversions. No uncovered branch demonstrated. |
| Blind 4: failed first queued write | false / reject | Existing mutation tests cover continuing resource queue after failed write and final absolute write after middle failure; hook failure test verifies toast. Queue implementation unchanged. |
| Blind 5: refresh during editing | false / reject | Session refs reset on editor open, persist through rerenders, and saves use current draft plus identity. No failing refresh path identified. |
| Blind 6: selected location clear | false / reject | Exact component location payload includes name and coordinates; hook held-write case includes zero coordinates and clears every location field. Real-dialog E2E verifies group clearing and persistence. |
| Blind 7: name/note test title overclaims Enter | low / patch | Only name uses Enter; rename shared test title to describe baseline reversion accurately. |
| Blind 8: unchecked tasks | false / reject | Completion bookkeeping is finalized after review and validation; plan-only edit suggestions are rejected by workflow rule. |
| Blind 9: expected verification text | false / reject | Observed results will be recorded at final gate; plan-only edit suggestions are rejected by workflow rule. |
| Blind 10: retrospective action wording | low / reject | Pre-existing retrospective wording; frozen constraints explicitly require preserving retrospective. No edit or deferral needed for this excluded documentation cleanup. |
| Intent: operation-owned field groups | false / reject | Time pair and four location fields are explicitly grouped by plan Code Map and matrix. Diff implements that reading and matches editor Save operations. |
| Intent: coverage surfaces and structural typing | false / reject | Layered hook/editor/browser coverage matches plan; structural compatibility is addressed by actual emitters. No additional defect claimed. |

Edge-case hunter returned no findings; verification-gap reviewer found no gaps. Matrix audit maps reversions/clears/disjoint edits to controlled-promise hook tests, empty intent to no-request test, cancellation/invalid names/drafts to PlaceRow tests, failures to hook toast test, and real persistence to both production E2E examples. All covering tests ran and passed (303 targeted tests; 80-test final hook rerun; production auth plus two examples passed).

## Verification

- Targeted Vitest: handler test plus `place-row`, `day-card`, `day-card-body`, `day-card-dnd` colocated tests. Expected regression fails before fix and passes after.
- Generate BDD and run new day-planning reversal scenarios with production server using existing E2E runner options; assert API completion before reload. Existing feature-map already maps affected source; change mapping only if investigation proves a missing registration.
- `build-validator`: lint, TypeScript and production build first; coverage alone; affected E2E alone. Expected all pass; no full-suite run.

### Observed verification — 2026-11-11

- Tests-first regressions reproduced full-row payload leakage and pending time-clear loss before implementation.
- Targeted Vitest hook/editor/DayCard/Body/Dnd and route suites: 303 passed across 7 files; final identity assertion hook rerun: 80 passed.
- New pending time/location reversal examples: development and fresh optimized production build each passed both examples plus auth (3 checks). Production build used isolated output and production server reuse.
- Review patches: bounded first-PATCH assertion and accurate name/note test title. PlaceRow rerun: 86 passed; reversal E2E plus auth: 3 passed.
- Final validator: `npm run lint` passed (13 existing warnings, zero errors); `npx tsc --noEmit` passed; isolated `NEXT_DISTDIR=.next-validate npm run build` passed, 19 static pages generated. Next.js reports no bundle sizes.
- `npm run test:coverage`: 444 files / 7529 tests passed; lines 97.90%, functions 97.52%, branches 93.75%.
- `npm run test:e2e:affected`: 63 passed, zero failed; day-planning, linked-events, schedule-conflict, viewer-trip-access. No full-suite run.
- Four review lenses completed; both low test-only findings patched and reverified; no deferred findings. Existing retrospective and deferred-work edits preserved outside implementation commit.
- Temporary production build moved under ignored scratch storage after lint initially scanned generated output; clean lint rerun passed. No source/config change required.