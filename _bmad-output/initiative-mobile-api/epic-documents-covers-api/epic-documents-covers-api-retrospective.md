---
epic: epic-documents-covers-api
date: 2026-11-14
verdict: accepted-with-open-items
criteria: declared
headless: false
---

# Retrospective: Documents and covers through the API

## Epic summary

Run against `feature/api-v1` at `b25eef8a` (merge of PR #519, story 3.10). Interactive run; no going-in concerns supplied.

Tickets, in build order (all ten plans carry `status: built`; none unfinished, `pending_tickets` empty):

| Ref | Title | Plan `baseline_revision` → range end |
| --- | --- | --- |
| 3.1 | Upload one trip document through the API | `e2363aba` → `c24c82c8` (6 commits, 33 files) |
| 3.2 | Upload event and reservation documents | `c24c82c8` → `595534bc` (3, 26) |
| 3.8 | Keep file cleanup progressing past failing files | `595534bc` → `5fd462ea` (2, 3) |
| 3.3 | Rename and remove documents | `5fd462ea` → `49a3721b` (5, 43) |
| 3.4 | Attach and promote documents | `49a3721b` → `b48922a8` (8, 38) |
| 3.5 | Select and remove a cover | `b48922a8` → `8adabe1a` (7, 22) |
| 3.6 | Upload a cover | `8adabe1a` → `1cd8f831` (8, 25) |
| 3.7 | Search cover images and destinations (GET) | `1cd8f831` → `8858f61d` (5, 34) |
| 3.9 | Refactor sweep | `8858f61d` → `d83669dc` (3, 3) |
| 3.10 | Verify documents and covers end to end | `d83669dc` → `HEAD` (`b25eef8a`, inferred; 3, 8) |

Baselines verified in ancestry order with `git merge-base --is-ancestor`. Ranges produced with `git_evidence.py`; 137 distinct paths touched. Every merge was measured except one in the 3.6 range (3 merges, 2 measured), so that range's churn ranking is slightly incomplete.

Tickets at `built`: all ten. Note: a first read of `tickets.py status` against the shared checkout showed 3.1–3.9 as `state: review` and 3.10 as `backlog`; that checkout was behind `feature/api-v1`. After fast-forwarding the worktree, 3.10's plan reads `built`. No ticket `state` was changed here; closing tickets is `bmad-ticket`'s.

Evidence inventory. Available: epic file with Done when, initiative Requirements, ten plans (frontmatter, frozen blocks, Implementation Notes, Review Triage Logs), `deferred-work.md`, previous retro (`epic-itinerary-api-retrospective.md`), ADRs under `docs/decisions/`. Missing: session logs (process-lesson analysis from conversations skipped); `tickets.py find`/`status` could not run inside the worktree (`_bmad/scripts` is gitignored and absent), so ticket data was read from the plan files and `tickets.toml`.

## Findings

### Aggregate views

Narrowed: computed inline from `git_evidence.py` output and `git grep`, not by dependency tooling. No `bmad-review` run (see Diff-scope review).

- **Architecture delta: clean.** Documents and covers sit in `src/lib/services/{documents,covers,cover-search}.ts` behind `src/app/api/v1/**` routes and `src/lib/api/contract/`. The `src/app/(app)/trips/[tripId]/actions.ts` file is now 52 lines. Retired-action audit reproduced: none of the 17 names is a `"use server"` export (the only `"use server"` hit is `createTrip` calling `searchCoverImages` from `services/cover-search`, `src/app/(app)/trips/actions.ts:70,373`, as the epic Notes allow). The four orphan action modules are gone from `git ls-files`.
- **Size growth: tests only.** Top churn is test code: `tests/e2e/steps/api-documents.steps.ts` (+760, now 742 lines), `src/lib/services/documents.test.ts` (+714), `tests/e2e/features/api.feature` (+616, now 1,938 lines), `tests/e2e/steps/api-covers.steps.ts` (+394, 384 lines). Production growth is modest: `documents.ts` 245, `covers.ts` 148, `cover-search.ts` 180 lines. No production god-class. **F-1 (low): `api.feature` at 1,938 lines and `api-documents.steps.ts` at 742 lines are candidates to split by domain.** Disposition: defer. Upstream lesson: none; the pilot's shared API test files were always going to accumulate per-domain cases.
- **Duplication / pattern divergence.** 3.10's triage records duplicated replay helpers in `api-documents.steps.ts` and `api-covers.steps.ts`, and two coexisting anonymous-client mechanisms (`tests/e2e/anonymous-api.ts` and `anonymousApiRequests` in `api.steps.ts`) (plan Review Triage Log, rows 3 and 6; `deferred-work.md:133–135`). Confirmed by that log; not re-derived. **F-2 (low): finish moving the remaining anonymous steps to the cookie-free client.** Disposition: defer under the existing `deferred-work.md` record. 3.10 showed the failure mode: `clearCookies()` does not keep an open page anonymous (the page re-sets its session cookie), so an anonymous call returned 200 once in dev and once in the production run (plan Implementation Notes, "Changes").

### Spec-to-implementation reconciliation

Checked D1–D10 and Done when 1–4 against code and the 3.10 evidence map (plan lines 80–92):

- D1/Done-when 4: `next.config.ts` adds `proxyClientMaxBodySize: "26mb"` (+3 lines, the only change to config across the range). `serverActions.bodySizeLimit: "25mb"` stays and is still needed by `src/app/(app)/profile/avatar-actions.ts` (FormData server action), so it is not dead config. Multipart contract recorded in `docs/decisions/adr-api-contracts.md:19–27`.
- D2–D6: held by the 3.10 matrix rows (401, 413, 422, exact-limit, replay denial, changed-body 409) with runtime code unchanged in 3.10. Cover upload is now one atomic step (`src/lib/services/covers.ts:110–146`) and discards the stored file if no trip row points at it.
- D7: GET read-side cross-site check recorded in `docs/decisions/adr-api-cookie-csrf.md:11`.
- D8: `services/trip-write.ts` runs `afterTripWrite` for every `runTripWrite`, which documents and covers use (plan line 89).
- D9: `src/lib/file-cleanup.ts` moves failed rows to the back of the queue (`151b60c4`); test `file-cleanup.test.ts:196` "still removes a newer file after more than one batch of permanently failing files".
- D10: server-action waits remain only in `reservations.steps.ts:453,509`, for `deleteReservation`, which the epic Notes leave with `epic-reservations-budget-api`. Correct.
- Migrations, schema, `.env.example`, Dockerfile, compose: `git diff e2363aba HEAD` shows no change. Done-when 4's "no migration or new environment variable" holds.

Divergences:

- **F-3 (low, stale record): `deferred-work.md:116–118` ("Uploaded cover files whose follow-up PUT fails or is abandoned are never cleaned up", premise "Upload stays a server action until entry 6") no longer describes the code.** Story 3.6 made upload a single atomic POST (`covers.ts:110–146`), so the two-step path is gone. Disposition: fix now (record reconciliation), proposed below.
- **F-4 (low, accepted deviation): the plan's matrix says exact-limit cover upload is 200; the endpoint returns 204.** 3.10's triage already rejects it: every cover write in the suite and contract returns 204 (Review Triage Log, intent-alignment row). Recorded so later runs stop re-flagging it.

### Diff-scope review

`bmad-review` was not invoked: the epic's ten plans each carry a Review Triage Log from the build's own review lenses (3.10 ran blind-hunter, edge-case-hunter, verification-gap and intent-alignment, `lenses_ran` in its frontmatter), and a fresh review of a 137-file epic diff was not run here. Narrowed scope: boundaries between tickets were checked through the handoff list in the epic Notes (service extensions 3.1→3.2→3.3→3.4; cleanup fairness 3.8 reused by 3.3/3.5/3.6; cover service 3.5→3.6; GET guard 3.7), each reflected in the shared modules above. No cross-ticket defect found by that reading; this is "checked at plan level", not a code-lens pass.

Carried deferred findings, unchanged by this epic (all in `deferred-work.md`):

- **F-5 (medium, severity unverified): retried upload with a client document id re-inserts a document deleted in between** (`deferred-work.md:95–97`). Done-when 2 covers replay but no delete-then-retry case exists in `api.feature`. Disposition: defer; reproduce first.
- Lines 82–93 (byte-size replay metadata, dialog selection races, reservation-delete/upload orphan race), 109–111 (`resolveOwningTripId` event branch), 113–115 (`coverPhotographer` bounds), 120–131 (Mapbox budget, provider response validation, fixture escaping, hostile-page evidence). All pre-existing and tracked; none reproduced as an acceptance failure.

## Behavior verification

Not re-executed in this run. This run relied on story 3.10's recorded production run (plan lines 98–101): `NEXT_DISTDIR=.next-prod npm run build` (pass), `next start -p 3001` on `arrivo_e2e`, then `node scripts/run-e2e.mjs --server=reuse "--grep=@feat:api|@feat:documents|@feat:event-docs|@feat:reservations|@feat:trip-cover-overflow|@feat:preferences-cover-type"`: 534 scenarios, 533 passed, 1 failed (the anonymous cookie race above). After the step fix, a re-run of `Denied writes leave state unchanged|Anonymous|anonymous` passed 8 of 8. The full selected set was not re-run after the fix; 3.10's triage accepts that because the fix touched test code only and the validator's 486-scenario affected run passed after it. The run covers Done-when 4 (12 MB PDF above the old 10 MB proxy buffer; exact 25 MiB upload; cover replacement removes the old file). Independent checks in this run were static (retired-action grep, config/migration diff, file sizes), not runtime.

## Previous-retro follow-through

Source: `epic-itinerary-api/epic-itinerary-api-retrospective.md`, Action items (A-1–A-7).

- **A-1 Preserve rapid event reversions (developer): landed.** `deferred-work.md` records the event-edit race cleared (commit `b408d88e`; plan `plan-preserve-pending-event-edits.md` exists in the initiative folder).
- **A-2 Resolve checklist-item draft retry contract (developer, product owner): not carried.** Epic Notes decision 2026-11-12 excludes it explicitly; no evidence found of it landing.
- **A-3 Reconcile durable-cleanup migration (epic author, release maintainer): landed.** `initiative-mobile-api.md:38` records migration `0014` as an exception applied automatically on start.
- **A-4 Ensure cleanup backlog progress (developer): landed.** Story 3.8, commit `151b60c4`, test `src/lib/file-cleanup.test.ts:196`.
- **A-5 Keep verification evidence complete, add the blank-first-item API case (verification-story author): partly landed.** 3.10 records commands, revision and counts. The blank-first-item case is absent: `api.feature:65–80` hold only concurrent first-item cases. The epic Notes also excluded it from this epic.
- **A-6 Run full regression before integrating into main (user): no evidence found.** The user-run `npm run test:e2e` is not recorded in this epic's artifacts; this retro and 3.10 ran selected features only.
- **A-7 Resolve production keyboard note reorder failure (developer): closed without root cause.** `deferred-work.md:81`: not reproduced, `@feat:trip-notes` 20/20, harness-related likely.

## Action items

All proposed; none applied.

1. **A-1 Reconcile `deferred-work.md:116–118` (F-3). Owner: developer.** Mark the cover-upload orphan entry completed by story 3.6 with evidence `covers.ts:110–146`. Fix now.
2. **A-2 Finish routing anonymous API steps through the cookie-free client (F-2). Owner: developer.** Move the remaining `api.steps.ts` anonymous examples to `tests/e2e/anonymous-api.ts`, retire `anonymousApiRequests`; do before the next epic that adds anonymous `api.feature` cases (`epic-sharing-api`). Defer, already recorded at `deferred-work.md:133–135`.
3. **A-3 Add the blank-first-item checklist API case (prior A-5). Owner: verification-story author.** Add the case to `api.feature` and steps; schedule in `epic-web-api-cleanup` verification or earlier. Defer.
4. **A-4 Settle the delete-then-retry upload question (F-5). Owner: developer.** Reproduce with a client document id after delete; add a service test and an `api.feature` case, then decide tombstone versus accepted window. Defer.
5. **A-5 Run `npm run test:e2e` once before merging `feature/api-v1` toward `main` (prior A-6). Owner: user.** Not launched automatically.
6. **A-6 Close the epic in the ticket store through `bmad-ticket` (user).** Ticket `state` still read `review`/`backlog` in the stale shared checkout; this retro changed no status.
7. **Process lesson. Owner: verification-story author.** When a harness fix lands after the full production run, re-run the whole selected set once, not only the failing subset. 3.10 re-ran 8 scenarios.
8. **Optional split (F-1). Owner: developer.** Split `api.feature` and the per-domain step files if they pass roughly 2,000 lines; no trigger yet. Accept for now.

## Decision records

Proposed, none written (awaiting approval; interactive run, user not yet asked):

- **`docs/decisions/adr-documents-have-one-scope.md`** — a document is linked to a trip, an event or a reservation, never two; attaching one clears the other, setting both is 422. Hard to reverse (v1 contract), surprising, a real trade-off against the web app's earlier dual links. Source: epic Notes decision 2026-11-12; plans 3.3/3.4 (`story-rename-and-remove-documents-through-the-api-plan.md`, `story-attach-and-promote-documents-through-the-api-plan.md`); no ADR in `docs/decisions/` records it.
- **`docs/decisions/adr-file-deletions-survive-transaction-commit.md`** — carried from the epic 2 retro, still unwritten. Epic 3 now depends on it for document removal, cover select/remove and cover replacement (`file-cleanup.ts`, `covers.ts:22–31`). Sources: epic 2 plan 2.5, commit `3b2f9f4d`, plans 3.3/3.5/3.6/3.8.

Already recorded, no duplicate proposed: multipart contract and no `Idempotency-Key` for uploads (`adr-api-contracts.md:19–27`), GET cross-site check (`adr-api-cookie-csrf.md:11`), client-UUID lock ordering (`adr-client-uuids-are-locked-before-the-trip-lock.md`). The 26 MB proxy value and cover 204-versus-200 are easy to reverse and fail the ADR test.

## Acceptance verdict

Machine verdict: **accepted-with-open-items**, criteria **declared**. All ten tickets are finished; no unfinished tickets.

1. Flows use `/api/v1` in the production build: met. Routes, contract and services present; 3.10 production run 533/534, the one failure a harness race fixed and re-run 8/8.
2. Multipart limits, unsafe inputs, storage failures, authorization and replay: met. 413, 422, exact-limit, rollback-without-file, 401, replay denial and changed-body 409 are covered in `api.feature`; storage goes only through the adapter (`covers.ts:116`, `file-cleanup.ts`).
3. Existing document, reservation-attachment and cover flows pass affected regression checks: met per the production run and the 486-scenario validator run recorded in 3.10 (not re-run here).
4. Upload above 10 MB and within 25 MB against the production server, no new environment variable or migration: met. 12 MB PDF scenario passes under `next start`; exact 25 MiB passes; no drizzle, schema, env or Docker change in the range.

Open items: F-2, F-3, F-5 and the carried deferrals above. None is a blocking finding. This verdict rests on recorded production evidence plus static checks, not a fresh runtime pass.

## Open questions

- Approve the two ADR proposals (and write them)?
- Is the full-suite `npm run test:e2e` before `feature/api-v1` → `main` still planned (prior A-6, no evidence)?
- Should the delete-then-retry upload case (F-5) be reproduced before `epic-sharing-api` starts, since sharing edits the same `actions.ts` and `api.feature`?
