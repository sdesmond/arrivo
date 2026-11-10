---
epic: epic-checklist-api-pilot
date: 2026-11-09
verdict: accepted-with-open-items
criteria: declared
headless: false
---

# Retrospective: API foundation and checklist pilot

## Epic summary

Epic 1, folder `_bmad-output/initiative-mobile-api/epic-checklist-api-pilot`. Reviewed at `feature/api-v1` HEAD `b4fd33f2` (PR #487 merged). Going-in concerns asked of the user: none.

Tickets (all `status: built`, `state: review`; none `done`, none unfinished, `pending_tickets` empty):

| Ref | Title | Plan range (baseline → next baseline) | Commits (merges) |
| --- | --- | --- | --- |
| 1.1 | Check one checklist item through the API | 57416341..64cae8da | 2 (1) |
| 1.2 | Make API replay atomic and authorization-aware | 64cae8da..1f387cf8 | 8 (3, 2 measured) |
| 1.3 | Preserve optimistic state and serialize rapid writes | 1f387cf8..b9bc6c74 | 2 (1) |
| 1.4 | Expose metadata and enforce wrapper coverage | b9bc6c74..8209eccf | 5 (1) |
| 1.5 | Move checklist creation, title and deletion to services | 8209eccf..975cdd1e | 9 (1) |
| 1.6 | Move checklist item lifecycle to the API | 975cdd1e..402f554f | 5 (1) |
| 1.7 | Move packing-source checklist insertion to the API | 402f554f..54357300 | 6 (1) |
| 1.8 | Retire checklist actions, complete regression coverage | 54357300..bb4dbcae | 4 (1) |
| 1.9 | Refactor sweep (incl. 1.9b drop dead `isChecked`) | bb4dbcae..8fcd908d | 8 (3, 2 measured) |
| 1.10 | Verify checklist pilot end to end | 8fcd908d..HEAD (inferred end) | 3 (1) |

Ranges run from each plan's recorded `baseline_revision`, ordered by `git rev-list --count <baseline>..HEAD`. Every baseline is a merge commit on `feature/api-v1`, so each range holds that story's PR plus any docs merges that landed before the next baseline. Whole epic: 93 code files, +8867/−587 (`src`, `tests`, `scripts`, `docs/decisions`).

Evidence inventory. Available: epic file with Done when, initiative file, ten plans with Review Triage Logs, `deferred-work.md`, `validation-report.md`, `git_evidence.py` output for all ten ranges, seven pre-existing API ADRs. Missing or narrowed:

- Session logs: not examined. Process-lesson analysis from conversations was skipped; process observations below come from plans and git only.
- Story files: `find` returned `story_file: null` for ticket 1.1; story intent was read from plans' frozen blocks.
- Review lenses and aggregate views were run inline (no subagents authorized), not delegated. Architecture delta used import inspection of the changed `src/lib/api`, `src/lib/services` and route files, not a dependency-graph tool. Duplication and pattern divergence were read over the final files, not derived by script.
- `tickets.py status` reports a problem: `plan-1-5-checklist-lifecycle-ui.md: ticket 5 names no entry or leaf file in initiative-mobile-api; skipped` (see F-P1).

## Findings

Dispositions: fix now / defer / accept. "Upstream" is what would prevent the next one.

### Aggregate views

**Architecture delta.** Layering holds: `src/lib/api/contract/*` imports no server module; `client.ts` and `use-api-mutation.ts` import only contract and `@/data/types`; `errors.ts` and `route.ts` are server-side. `src/lib/services/checklists.ts` imports from `@/lib/api/contract/checklists`, `@/lib/api/idempotency` and `@/lib/api/errors`, so services depend on the transport layer for `ApiError` and for body schemas (`checklists.ts:20-29`). ADR `adr-api-service-boundaries` says services return typed domain results; the 409 `collision()` at `checklists.ts:59-61` throws a transport error from the domain layer. Disposition: accept for the pilot; revisit when a second consumer (mobile) shares services. Upstream: decide whether conflict is a typed service error mapped in `errors.ts`, as `TripForbiddenError` is.

**God-class / size growth.** Largest net growth in non-test source: `src/lib/services/checklists.ts` +453 (now 453 lines), `use-checklist-handlers.ts` +311 (311 lines), `src/lib/api/idempotency.ts` +168, `use-api-mutation.ts` +121. All are single-responsibility files under review limits. `actions.ts` shrank 227 lines but is still 789 lines, a god module the pilot did not touch beyond removing exports (`actions.ts`, 789 lines). `use-trip-detail-handlers.ts` fell 66 net. Disposition: accept; `actions.ts` size is pre-existing and owned by later epics.

**Duplication map.** `checklists.ts` repeats the pre-check-then-transaction-recheck shape in all six writes (`:174-185`, `:283-292`, `:320-326`, `:350-361`, `:401-407`, `:437-444`) but they share `runChecklistWrite` (`:90-111`) and the helpers added in 1.9 (commit `50d0bd66`). Residual: the ancestry read for a checklist or item runs once outside the transaction and again inside by design. Accept.

**Pattern divergence.** One divergence found: first-item content is validated with raw `checklistItemContentSchema` (`contract/checklists.ts:19`) while item create/update use trimmed, non-empty `itemContent` (`:43-47`). See F-1. Another: `updateChecklistTitle` skips no-op writes (`checklists.ts:297`) while `updateChecklistItem` does not (`:415-422`). See F-4.

**Spec-to-implementation reconciliation.**

| Requirement | As built | Verdict |
| --- | --- | --- |
| P1 ADRs | seven `docs/decisions/adr-api-*.md` | met; two more written by this retro |
| P2 services, typed access errors, effects | `src/lib/services/{checklists,trip-access,trip-write-effects}.ts` | met (see architecture delta) |
| P3 wrapper, CSRF, envelope, rate limit, no-store, proxy path | `route.ts`, `csrf.ts`, `errors.ts`, `rate-limit.ts` `api` bucket, `proxy.ts` `/api/v1` | met |
| P4 replay, client-generated IDs, partial PATCH, idempotent delete | API-level met; UI sends no client IDs | met at API; UI use deferred (F-D1, F-D2) |
| P5 client, hook, optimism, keyed serialization | `client.ts`, `use-api-mutation.ts`, `use-checklist-handlers.ts` | met; gaps F-2, F-6 |
| P6 nine exports migrated and deleted | none of the nine remain in `actions.ts` exports (listed 2026-11-09) | met |
| P7 mixed positions, lock, atomic copy, effects | `checklists.ts:226-231`, `:244-256` | met |
| P8 meta route and handler coverage | `meta/route.ts`, `handler-coverage.test.ts` | met |
| P9 API waits, API E2E, regressions | `api-response.ts`, `api.feature`, `day-planning.feature`, `packing-lists.feature` | met |

Spec divergence to record: epic Test intent names `tests/e2e/api-response.ts`, `use-packing-handlers.test.tsx` and others; all exist. Epic Notes call 1.5 one story; it ran as two plans (services/API, then UI), and the UI half has no ticket-attached plan (F-P1).

### Diff-scope review (`bmad-review` lenses, run inline)

Per-story reviews already ran with up to four lenses and are triaged in each plan's Review Triage Log; rejected items were not re-reported. New findings from the cumulative range, with sources:

- **F-1 (edge-case / pattern divergence) — fix now.** `src/lib/api/contract/checklists.ts:19` accepts blank or whitespace-only `firstItem.content` because it uses `checklistItemContentSchema` (`text()` has only `.max`, `validation-schemas.ts:24-26,142`) rather than `itemContent` (`:43-47`). `POST /api/v1/trips/:tripId/checklists` can create an empty item that `POST .../items` rejects with 422. Tests: `contract/checklists.test.ts:31-32` cover bad id and 301 chars only; no blank case found. Fix: reuse `itemContent` for `firstItem.content` and add contract and service cases.
- **F-2 (adversarial) — defer.** `client.ts:26` has no timeout or `AbortController`, and `use-api-mutation.ts:108-109` chains each keyed write on the previous one. A request that hangs (the trip row lock after the actor-key lock is unbounded, `idempotency.ts:105`) stalls every later write to that key and keeps `isPending` true. Suite search for `AbortController|timeout|signal` in `src/lib/api/client*.ts`, `use-api-mutation*.ts` found none.
- **F-3 (edge-case) — accept, record.** `checklists.ts:203-209` treats a retry of a create by `id` as a conflict once a later insert on the same day has shifted `position` (`:226-231`), or the title changed. The plan's Design Notes accept title drift; position drift is not named. Unreachable from the UI today because it sends no ID (F-D1). Upstream: state position drift in the idempotency ADR when the UI adopts client IDs.
- **F-4 (edge-case / pattern divergence) — defer.** `checklists.ts:415-422` marks changed and publishes effects for a PATCH whose values equal the stored row; `updateChecklistTitle` skips that (`:297`). Redundant activity and live-sync events on repeated same-value writes. Only the empty-patch no-op is tested (`checklists.test.ts:1230`).
- **F-5 (edge-case) — defer.** `use-day-draft.ts:81-84,104-108` locks a draft after a commit that resolves without growing the timeline: `handleAddChecklist`, `handleAddNote` and `handleAddEvent` resolve silently when the day id is missing (`use-checklist-handlers.ts:209-210`; `use-trip-detail-handlers.ts:149,166`), and a live-sync delete can offset the `+1` that re-arms it (`:54-58`). Only cancel or a new draft re-arms. Introduced by the 1.10 guard; the plan rejected the nearby case as pre-existing.
- **F-6 (adversarial) — defer.** `use-api-mutation.ts:63` clears the hook-wide `fields` at the start of every run, so a concurrent independent write clears another item's retained field errors, against P5's "independent resources retain concurrency". Also `:66-83`: a throwing `onSuccess` is reported as "Could not save changes" after the write committed.
- **F-7 (adversarial) — accept.** `checklists.ts:326,443` return 204 for a missing item or checklist but 404 when the ID exists in another trip, so a caller with editor rights on one trip can probe whether a UUID exists elsewhere. UUIDs are unguessable and the plan sets the idempotent-delete matrix row, so no change proposed.
- **F-8 (verification-gap, missing-adoption) — accept, record.** `route.ts:28` rate-limits only after authentication and CSRF, so 401/403 floods are unthrottled; the limiter is per process. Epic P3 asks for rate limits on authenticated calls only. Recorded so later epics stop re-flagging.

### Deferred by the stories (carried, not re-judged)

- F-D1: UI sends no client UUID on checklist create or item create (`deferred-work.md`; plans 1.5, 1.6). Fix later: draft-stable ID in `use-day-draft`.
- F-D2: double-click in the packing-source picker creates two checklists (plan 1.7).
- F-D3: no retention sweep for `idempotency_keys` (plan 1.2).
- F-D4: `src/app/(app)/trips/[tripId]/actions.ts` maps only to `@feat:app-activity`, so edits run that feature only (plan 1.8). Because stories 1.5–1.8 edited this file and ran affected E2E, no full-suite run covered those deletions; see action item A-4.

### Process

- **F-P1 — fix now.** `plan-1-5-checklist-lifecycle-ui.md` sits in `_bmad-output/initiative-mobile-api/` and is attached to no ticket (`tickets.py status` problem line; `deferred-work.md` entry for plan 1.5 says "story 1.5 not marked done"). Ticket 1.5's own plan is titled "Checklist lifecycle services and API" and covers the first half. The UI half's baseline and review record are not under the epic folder, so a future retro cannot derive its range from the ticket. Upstream: when a story splits mid-build, add a ticket entry for the second half.
- **F-P2 — accept.** Story 1.10 found two real defects only by running the production server (`use-day-draft.ts` double submit; a racy E2E step). Adopt: production-server E2E in the first story of a new epic's verification, not the last. Evidence: plan 1.10 Implementation Notes, commit `6e491bb9`.
- **F-P3 — note.** Story 1.3's affected-E2E selector expanded to full scope (591 checks) because shared API hook files are in `SHARED_GLOBS`; later stories ran narrower sets. Verification of Done-when 4 therefore rests on 1.3 plus affected subsets.

## Behavior verification

Not re-run end to end in this retro; evidence relied on and what was exercised:

- This run: targeted Vitest over `src/lib/services`, `src/lib/api`, `src/app/api`, `src/proxy.test.ts`, `src/lib/rate-limit.test.ts`, `scripts/feature-map.test.mjs`, `src/app/(app)/trips/[tripId]`, `use-day-draft.test.ts` at HEAD `b4fd33f2`: 48 files, 901 tests pass.
- From plan 1.10 (not re-run here): production build, `next start -p 3001` on `arrivo_e2e`, `@feat:api|@feat:day-planning|@feat:packing-lists`: 150 pass after two fixes; `/api/v1/meta` returned 200 with `cache-control: no-store`. Validator at 1.10: coverage 415 files, 6955 tests, lines 97.68%, branches 93.34%; affected E2E 32 pass.
- Not exercised: manual browser pass, and the full Playwright suite (user-initiated per `AGENTS.md`).

## Previous-retro follow-through

None. Epic 1 is the first epic in the initiative (`epics` order), so no previous retrospective file exists; this is not a case of a file with no outstanding items.

## Action items

All are proposed; none was applied. Owner is the person who runs the dev loop.

- A-1 (F-1): reuse `itemContent` for `firstItem.content` in `src/lib/api/contract/checklists.ts`, with contract, service and API E2E blank-content cases first. Owner: developer. Remediation, awaiting dev loop.
- A-2 (F-P1): attach the 1.5 UI half to ticket 1.5 or record it as a ticket entry so `tickets.py` stops reporting it. Owner: `bmad-ticket` user. Spec reconciliation, awaiting human.
- A-3 (F-2, F-5, F-6, F-4): file one hardening story in the next epic's refinement: client request timeout, draft re-arm when a commit resolves without growth, per-key field errors, no-op item PATCH skipping effects. Owner: developer.
- A-4 (F-D4, F-P3): run the full E2E suite (`npm run test:e2e`) before merging `feature/api-v1` toward `main`; agents do not launch it. Owner: user.
- A-5 (F-D1): carry F-D1 and F-D2 into the itinerary epic's first story, since they need `use-day-draft` changes.
- A-6 (F-P2): in later epics, put the production-server E2E run in the first verification story, not the last. Owner: epic author.

Process lessons: story splits need ticket entries (A-2); production-server verification should come earlier (A-6).

## Decision records

Proposed from plans' frozen blocks and Design Notes; none already recorded in `docs/decisions/` (checked by search for advisory-lock, replay, `createdAt`, `clock_timestamp`).

- Checklist item order is creation time (plans 1.6/1.7, commits ac540923, 53f00699): approved; written to `docs/decisions/adr-checklist-item-order-is-creation-time.md`.
- Client UUIDs are locked before the trip lock (plan 1.5, commit 5d95cbfc): approved; written to `docs/decisions/adr-client-uuids-are-locked-before-the-trip-lock.md`.
- Not proposed: the 3-second actor/key lock bound (already in `adr-api-contracts.md:15`); the submit-once draft guard (cheap to reverse).

The two ADR files are written and uncommitted; committing them is the user's concern.

## Acceptance verdict

**accepted-with-open-items**, criteria declared (epic file Done when).

1. Checklist operations through `/api/v1` in the production build: met. Plan 1.10 production run, 150 scenarios, `/api/v1/meta` 200 no-store; five route files plus meta exist.
2. Authorization, CSRF, validation, envelopes, rate limits, replay, client IDs, no-store, handler coverage: met. `api.feature` covers 401/403/404/422/400, CSRF, replay, 409, authorization loss, client IDs, idempotent delete; `handler-coverage.test.ts`; 901 targeted tests pass here.
3. Rapid writes in intended order, optimistic state stable: met. Plan 1.3 gated FIFO and failure-recovery E2E, 591-check run.
4. Shared positioning, locks, activity, live sync, unrelated flows unchanged: met on the evidence available, with the caveat in F-P3 and A-4.
5. Targeted tests and validation gate pass, feature-map covered, checklist actions retired: met. Validator PASS at 1.10; nine exports absent from `actions.ts`.

Open items keep this from plain accepted: F-1 (blank first item accepted, fix now), F-P1 (orphan plan), and the deferred F-2, F-4, F-5, F-6 and F-D1–D4. No blocking finding stands. All ten tickets are finished (`built`); none is `done`. Closing them is `bmad-ticket`'s, confirmed by the user.

## Open questions

- Should `ApiError` stay thrown from services, or become a typed service error mapped in `errors.ts` before a second consumer shares them? Changes where the 409 `collision()` lives.
- Does the user want F-1 fixed before story 2.x builds on `createChecklist`, or batched into A-3? A blank first item is reachable only by direct API callers today.
- Session logs for the ten builds were not examined; if they exist, they could explain why 1.5 split and whether the double-submit was seen earlier.
