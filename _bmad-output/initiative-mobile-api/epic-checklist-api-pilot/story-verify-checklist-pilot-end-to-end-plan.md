---
title: "Verify checklist pilot end to end"
type: chore
ticket: 10
created: "2026-11-09"
status: built
baseline_revision: "8fcd908d477ecf2bd38309cbf00094069fb05ec1"
route: oneshot
route_source: auto
risk: high
review: quick
review_source: auto
lenses_ran: []
review_loop_iteration: 0
context: [_bmad-output/initiative-mobile-api/AGENTS.md]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Stories 1.1-1.9 each passed targeted tests, but the epic's Done-when requires the checklist API to work "in the production build". Playwright (`playwright.config.ts`) starts `npm run dev`, and `build-validator` only runs `next build`, so no check exercises `/api/v1` under `next start` (proxy public path, no-store, origin handling, standalone output).

**Approach:** Audit P1-P9 and the five Done-when items against existing evidence; run the `api`, `day-planning` and `packing-lists` E2E features against a production build and `next start` on the E2E database; close only gaps the audit or that run finds, tests first; then run `build-validator`. Branch `story/1-10-verify-checklist-pilot` from latest `feature/api-v1`; PR base `feature/api-v1`; return to `feature/api-v1` after the PR. No migrations, new env vars, new capability, `CHANGELOG.md`, full E2E, or push without authorization.

</frozen-after-approval>

## Implementation Notes

Oneshot: verification story whose fixes, if any, are small and found by running; a full plan cannot name them in advance.

Evidence gathered at planning (HEAD 8fcd908d, `feature/api-v1` after PRs 485 and 486):

- 37 targeted Vitest files, 777 tests pass (services, `src/lib/api`, proxy, rate-limit, checklist and packing handlers, trip-detail handlers, `actions.test.ts`, `src/app/api`, feature-map, `api-response`, checklist-item, db-mappers).
- P1: seven `docs/decisions/adr-api-*.md` exist. P8: five routes plus meta exist; `handler-coverage.test.ts` exists. P6: no checklist-mutation exports remain in `actions.ts`.
- P9: `api.feature` covers 401/403/404/422/400, CSRF, sequential and concurrent replay, 409, authorization loss, client IDs, idempotent delete. `day-planning.feature` covers slow-write rapid toggles, overlapping item edits, mixed placement, failed-write recovery. `packing-lists.feature` covers source insertion.
- Gap: no production-server run (above). Deferred findings in `deferred-work.md` stay deferred.

Planned steps, in order:

1. Map each of P1-P9 and Done-when 1-5 to a test or ADR; add a failing test first for any item with no evidence.
2. `NEXT_DISTDIR=.next-prod npm run build`, then `next start` on the E2E port with the E2E env from `playwright.config.ts` (`E2E_MODE`, `E2E_DATABASE_URL` as `DATABASE_URL`, `NEXTAUTH_URL`); run `E2E_REUSE_SERVER=true` with `--grep` limited to `@feat:api`, `@feat:day-planning` and `@feat:packing-lists`. Record results here. A production-only failure is a gap: fix tests first.
3. Targeted Vitest for touched files, then `build-validator` (lint/types/build; coverage alone; affected E2E alone).

Results (branch `story/1-10-verify-checklist-pilot` from `feature/api-v1` at 8fcd908d; PR base `feature/api-v1`; nothing pushed):

- Audit (step 1): every P1-P9 and Done-when item mapped to existing tests or ADRs above; no missing evidence.
- Production run (step 2): `NEXT_DISTDIR=.next-prod npm run build`, then `next start -p 3001` on `arrivo_e2e` with the `playwright.config.ts` env plus `AUTH_TRUST_HOST=true` (the Docker image sets it; without it Auth.js rejects `localhost`), driven by `node scripts/run-e2e.mjs --server=reuse "--grep=@feat:api|@feat:day-planning|@feat:packing-lists"`. `/api/v1/meta` answers 200 with `cache-control: no-store`. First run: 149 pass, 1 fail. Final run: 150 pass. `.next-prod` removed afterwards.
- Gap 1 (plans 1.5, 1.7 scenario "A checklist created with its first item keeps its place"): `NoteItem` calls `onCreate` on Enter and again on the blur that follows while the draft stays mounted until the refreshed day lands, so `createNote` ran twice (66 ms apart, seen as two `Mixed note` POSTs). Fix in `use-day-draft.ts` (`commitStartedRef`: a draft submits once; a rejected commit, cancel, new draft or landed day re-arms it), covering notes, events and checklists. Tests first in `use-day-draft.test.ts` (two failed before the fix). Pre-existing UI behavior, not introduced by the pilot; fixed because the run exposed it and the fix is one guard.
- Gap 2 (same scenario): the "I add a note" step passed while the draft row (`note-draft`) was still mounted, so the next gesture raced the write, and the assertion "event before note" held only by that race (dev also fails once the race is gone). Step now waits for the saved note; the assertion pins the deterministic order `note, event, checklist` (the only "Add a place" gap appends).

## Review Triage Log

Inline review by the builder (no subagent authorized); diff is 3 files, about 60 lines.

| Finding | Verdict | Route | Evidence |
| --- | --- | --- | --- |
| Guard could block a legitimate second submit | false | rejected | `commitStartedRef` re-arms on reject, cancel, new draft and landed day; the retry test covers each. |
| A successful commit whose day never grows leaves the draft locked | low | rejected | The draft already stayed mounted in that case before this change; the guard adds no new stuck state. |
| Escape then blur double-cancel | false | rejected | `cancelDraft` is idempotent (`setDraft(null)`). |
| Validator results | n/a | noted | lint, tsc, build pass; coverage 415 files, 6955 tests, lines 97.68%, branches 93.34%; affected E2E 32 pass (`@feat:day-planning`, `@feat:viewer-trip-access`). |

## Verification

**Commands:**

- `npx vitest run src/lib/services src/lib/api src/proxy.test.ts src/lib/rate-limit.test.ts src/app/api scripts/feature-map.test.mjs "src/app/(app)/trips/[tripId]"` -- expected: pass
- Production-server E2E as in step 2 -- expected: the three features pass
- `build-validator` -- expected: PASS
