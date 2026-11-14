---
title: "Verify documents and covers end to end"
type: chore
ticket: "10"
created: "2026-11-13"
status: built
baseline_revision: "d83669dc08dea7f1f624b353e60150a952f2a588"
route: full
route_source: auto
risk: high
review: "thorough"
review_source: "auto"
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 0
context: [_bmad-output/initiative-mobile-api/AGENTS.md]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Stories 3.1–3.9 migrated every document and cover flow, but epic completion needs integrated production-build evidence. `api.feature` has no anonymous 401 case on the document and cover write routes, no cached-replay denial after access loss, no changed-body key conflict for document PATCH, and no upload exactly at the 25 MB document or 12 MB cover limit.

**Approach:** Close those gaps tests first; audit D1–D10 and Done-when 1–4; run the relevant API and web features under `next start` on `arrivo_e2e`, including a document between 10 and 25 MB and cover replacement; fix only acceptance failures; run `build-validator` after targeted checks pass.

## Boundaries & Constraints

**Always:** Actual branch `story/3-10-verify-documents-covers-e2e` from latest `feature/api-v1`; PR base `feature/api-v1`; return to `feature/api-v1` after an authorized PR. Scenario-owned mothers and materializers; API waits before gestures; storage only through adapters. Name colocated tests before any runtime fix; register changed runtime ownership in `feature-map.mjs`. Record full canonical revisions.

**Never:** New capabilities, broad cleanup, deferred findings not reproduced as acceptance failures, migrations, new environment variables, `CHANGELOG.md`, automatic full-suite E2E, ticket edits/mark/pull, unauthorized push or PR.

## I/O & Edge-Case Matrix

| Given | When | Then |
| --- | --- | --- |
| No session | Each document/cover write route is called | 401 `unauthenticated`; no row or file |
| Successful keyed write (rename, scope, delete, cover select, cover remove) | Demote to viewer or remove membership; replay exact request | 403 `forbidden` / 404 `not_found`, no cached success, snapshot unchanged |
| Keyed document PATCH (rename, scope) | Reuse key with a different body | 409 `conflict`; first result persists |
| File of exactly 25 MiB (trip, event, reservation) or 12 MiB (cover) | Upload | 200; one row and one file |
| Production server | Document of 10–25 MB; move scope; replace cover | Succeeds and persists after reload; old cover file removed |

</frozen-after-approval>

## Code Map

- `tests/e2e/features/api.feature` (documents/covers from line ~1358), `tests/e2e/steps/api-documents.steps.ts` (`postDocument`, `filler`, `pdfPart`, case maps ~178), `api-covers.steps.ts` (case maps ~245), `api.steps.ts`: reuse role Given, header helpers, replay-denial pattern from "Cached itinerary replay" (lines 6–53). Existing oversize cases cover 25 MiB+1 and 12 MiB+1 only.
- `tests/e2e/features/documents.feature` ("larger than the old 10 MB proxy buffer"), `event-docs`, `reservations`, `trip-cover-overflow`, `preferences-cover-type`: web scenarios to reuse in the production run.
- `src/lib/upload-policy.ts`, `src/lib/utils.ts` (`MAX_UPLOAD_BYTES`, `MAX_COVER_IMAGE_UPLOAD_BYTES`), `next.config.ts` (`proxyClientMaxBodySize: "26mb"`): limits under test; do not change.
- `src/lib/services/{documents,covers,cover-search}.ts`, `src/lib/api/contract/`, `src/app/api/v1/{documents,events,reservations,trips}/**/route.ts`: evidence for D1–D9 and fix sites if a gap fails.
- Retired actions (names from `3724f6c9`): `setTripCoverWithAttribution`, `removeTripCover`, `uploadDocument`, `addDocument`, `removeDocument`, `renameDocument`, `attachTripDocToEvent`, `promoteEventDocToTrip`, `uploadDocumentToEvent`, `uploadCoverImage`, `uploadReservationDocument`, `removeReservationDocument`, `renameReservationDocument`, `searchCoverImages`, plus the remaining reservation attach/promote and destination-search names, and three pass-through wrappers; recover the exact 17 with `git grep` at that commit.
- Pilot `story-verify-checklist-pilot-end-to-end-plan.md`: production procedure; `playwright.config.ts` owns E2E env, `scripts/run-e2e.mjs` supports `--server=reuse` and `--grep`.

## Tasks & Acceptance

**Execution:**

- [ ] `tests/e2e/features/api.feature` then `api-documents.steps.ts`, `api-covers.steps.ts` -- anonymous 401 for each document/cover write route; exact-limit uploads (25 MiB trip/event/reservation, 12 MiB cover) -- fill I/O rows one and four
- [ ] Same files -- cached replay denial after viewer/stranger demotion for the five keyed operations, and changed-body key 409 for document rename and scope PATCH (cover PUT already covered) -- fill rows two and three
- [ ] This plan -- evidence map D1–D10 and Done-when 1–4; audit the 17 retired actions and three wrappers across `src` and `tests`
- [ ] Production run -- `NEXT_DISTDIR=.next-prod npm run build`; `next start -p 3001` on `arrivo_e2e` with `AUTH_TRUST_HOST=true`; run `--server=reuse` over `@feat:api|documents|event-docs|reservations|trip-cover-overflow|preferences-cover-type`; record counts and the observed commands; fix failures tests first; stop the server
- [ ] Invoke `build-validator` after targeted checks pass: lint/types/build, coverage alone, affected E2E alone

**Acceptance Criteria:**

- Given an unauthenticated caller, when any document or cover write route is called, then 401 and nothing is stored.
- Given a successful keyed write, when editor access is lost, then the exact retry denies without cached payload or change.
- Given a file exactly at its limit, when uploaded, then it is stored once; one byte over still returns 413.
- Given the production build on `arrivo_e2e`, when the selected features run, then they pass and prove epic Done-when 1–4 with no migration or environment variable.
- Given the final tree, when the audit runs, then retired-action callers number zero and every validation gate passes.

## Implementation Notes
Actual branch: story/3-10-verify-documents-covers-e2e-bg (worktree `.claude/worktrees/story-3-10`); PR base: feature/api-v1. Branch starts at d83669dc08dea7f1f624b353e60150a952f2a588. Retired-action names recovered at 3724f6c9c34cba06cf7d29560d68fc95bd805f2e.

### Changes

- `api.feature`: anonymous 401 `unauthenticated` rows (trip, event and reservation uploads; document PATCH, DELETE and scope PATCH; cover PUT, DELETE and image upload); exact-limit uploads (25 MiB trip, event, reservation; 12 MiB cover); cached replay denial after viewer/stranger demotion (document rename, scope, delete; cover select, remove); changed-body same-key 409 for document rename and scope.
- `api-documents.steps.ts`, `api-covers.steps.ts`: new cases and replay steps; calls go through the new `tests/e2e/anonymous-api.ts` client. `api.steps.ts`: the anonymous role marks the page, and the checklist write step uses the cookie-free client. `feature-map.mjs`: registers `anonymous-api.ts` under `api`.
- Runtime code unchanged: every I/O row held on first run except one test harness race. Clearing cookies does not keep a page anonymous (the open page re-sets its session cookie), so an anonymous request returned 200 once in dev (event upload) and once in the production run (existing "Denied writes leave state unchanged" example 3). Both used `page.request`; anonymous calls now use a fresh cookie-free context. Routes returned 401 whenever the request had no cookie.

### Evidence map

- D1 transport: `src/lib/api/{endpoint,route,client}.ts` (+ colocated tests; `UPLOAD_TIMEOUT_MS` 120 s); `next.config.ts` `proxyClientMaxBodySize: "26mb"`; exact-limit and 12 MB web scenarios below.
- D2 policy: `src/lib/upload-policy.ts`; `api.feature` oversize-file/oversize-body 413, disallowed/mismatched 422, exact-limit 200, rolled-back cover upload leaves no file.
- D3 uploads: `src/app/api/v1/{trips,events,reservations}/*/documents/route.ts`, `services/documents.ts`; same-id retry, concurrent retry, 409, 404-conceal, denied roles, anonymous 401, keyed 400.
- D4 PATCH: `src/app/api/v1/documents/[documentId]/route.ts`; scope, promote, both 422, linked 422, foreign 404, changed-key 409, replay denial.
- D5 DELETE: same route; keyed replay, repeat 204, row and file removal, rollback leaves no queue residue.
- D6 covers: `src/app/api/v1/trips/[tripId]/cover/{route,image/route}.ts`, `services/covers.ts`; select, remove, upload GIF/PNG, replace removes old file, rollback, replay denial, changed-key 409.
- D7 search: `src/app/api/v1/cover-images/**`, `services/cover-search.ts`; `@cover-search` cases (signed-out 401, cross-origin 403).
- D8 `afterTripWrite`: `services/trip-write.ts` runs it for every `runTripWrite`, which documents.ts and covers.ts use (reservation documents included).
- D9 fair drain: `src/lib/file-cleanup.ts` (`DRAIN_BATCH`, fairness) with `file-cleanup.test.ts`.
- D10 tests: colocated service, contract, route and client tests; `api.feature` cases per route; feature-map entry `api`.
- Done-when 1: production run below, web and API features. 2: the I/O rows above, storage only through adapters. 3: `documents`, `event-docs`, `reservations`, `trip-cover-overflow`, `preferences-cover-type` pass on the production server. 4: "Upload a document larger than the old 10 MB proxy buffer" (12 MB PDF) and "Cover upload replaces a stored cover and removes the old file after commit" pass under `next start`; the exact 25 MiB upload also passes; no migration, no environment variable.

### Retired-action audit (names at 3724f6c9)

17 actions: setTripCoverWithAttribution, removeTripCover, uploadDocument, addDocument, removeDocument, renameDocument, attachTripDocToEvent, promoteEventDocToTrip, uploadDocumentToEvent, uploadCoverImage, uploadReservationDocument, removeReservationDocument, renameReservationDocument, promoteReservationDocToTrip, attachTripDocToReservation, searchCoverImages, resolveDestinationCenter. Three wrappers: `uploadDocument`, `uploadDocumentToEvent`, `uploadCoverImage` in `trips/[tripId]/actions.ts` (delegating to `uploadTripDocumentAction`, `uploadEventDocumentAction`, `uploadCoverImageAction`). `git grep -w` over `src`, `tests`, `scripts` finds no server-action export or caller under these names; the remaining hits are same-named exports of `services/{documents,covers,cover-search}.ts` and `api/contract/*`, plus `createTrip` calling `searchCoverImages` from `services/cover-search`. The modules `document-upload-actions`, `cover-upload-actions`, `cover-image-search-actions` and `reservation-document-actions` are not imported anywhere. Callers: zero.

### Production run

- `NEXT_DISTDIR=.next-prod npm run build` (pass), then a node launcher running `next start -p 3001` with the `playwright.config.ts` env (`DATABASE_URL`=`E2E_DATABASE_URL`, `NEXTAUTH_URL`, `NEXT_DISTDIR=.next-prod`, `E2E_MODE`, both stubs, local storage) plus `AUTH_TRUST_HOST=true`. `/api/v1/meta` 200 `no-store`.
- `node scripts/run-e2e.mjs --server=reuse "--grep=@feat:api|@feat:documents|@feat:event-docs|@feat:reservations|@feat:trip-cover-overflow|@feat:preferences-cover-type"`: 534 scenarios, 533 passed, 1 failed (the anonymous cookie race above). After the step fix, the re-run on the same server of `Denied writes leave state unchanged|Anonymous|anonymous` passed 8 of 8. Server stopped; `.next-prod` removed.

## Plan Change Log

## Review Triage Log

| Finding | Lens | Verdict | Route | Evidence |
| --- | --- | --- | --- | --- |
| Anonymous cover `remove` ran on a trip whose cover equals the graphic a successful DELETE writes | blind, verification-gap | low | patch | Fixed: the outline now seeds a stored map cover first; the 401 row would now change `coverImageUrl` on a wrongful delete. Re-ran: 2 of 2 pass. |
| Other anonymous steps in `api.steps.ts` (event patch, lifecycle create, `audience` meta, ~40 raw `page.request.*`) still use the page cookie jar | verification-gap, edge-case | medium | defer | Pre-existing: those steps were untouched; the cookie-refresh race predates the change and no scenario outside the one fixed failed in 486 affected or 534 production runs. |
| Two coexisting anonymous-client mechanisms | blind, verification-gap | low | defer | Same root cause as the row above; consolidation is a harness refactor outside the intent. |
| `anonymous-api.ts` one-way latch, concurrent `newContext` leak, `about:blank` origin, dispose placement, no unit test | blind, edge-case | false | rejected | Steps run sequentially; anonymous is set once at scenario start on a navigated page; `api-covers.steps.ts` After disposes unconditionally for every scenario. |
| Replay/409 gaps: event/reservation docs, uploads, DELETE changed body, anonymous replay, CSRF-before-auth order | blind, edge-case | low | rejected | Beyond the I/O matrix rows; the intent names rename, scope, delete, select, remove with viewer/stranger only. |
| Cover exact-limit asserts 204 while the matrix says 200 | intent-alignment | false | rejected | Every cover write in the existing suite and contract returns 204; the matrix's 200 describes the document upload rows. |
| Duplicated replay helpers, `requests[operation]` prototype keys, non-null assertions, step wording `cover upload API returns 401` | blind, edge-case | low | rejected | Cosmetic; operations are fixed feature strings and no failing input is reachable. |
| Production evidence names no web scope-move scenario; full selected set not re-run after the harness fix | intent-alignment, blind | low | rejected | `event-docs` and `reservations` promote/attach scenarios ran in the 533 of 534 pass; the harness fix touched test code only and the 486-scenario validator run passed after it. Fix would edit this plan. |
| Plan artifact status, checkboxes, D1–D10 definitions, D8/anonymous-race wording | blind, edge-case | low | rejected | Fix edits this build's plan. |

## Design Notes

Reuse the 2.10 replay pattern: save the exact method, path, body and key, change the role, replay, assert the denial envelope, `no-store` and an unchanged row and file snapshot. Exact-limit bodies stay under the 26 MB proxy buffer (25 MiB plus multipart overhead).

## Verification

**Commands:**

- `npx vitest run src/lib/services src/lib/api src/app/api/v1 scripts/feature-map.test.mjs tests/e2e/api-response.test.ts` -- expected: pass
- `node scripts/run-e2e.mjs --server=kill "--grep=<new scenario names>"` -- expected: new cases pass
- Production run above -- expected: all selected scenarios pass
- `build-validator` -- expected: PASS
