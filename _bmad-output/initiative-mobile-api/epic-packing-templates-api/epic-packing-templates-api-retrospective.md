---
epic: epic-packing-templates-api
date: 2026-11-23
verdict: rejected
criteria: declared
headless: false
---

# Retrospective: Packing templates through the API (epic 6)

## Epic summary

Seven tickets, all `status: built` (state `review`), so `pending_tickets` is empty. None is marked `done`: closing is `bmad-ticket`'s call. Going-in concerns: none, full sweep, no team discussion.

| Ticket | Title | PR |
| --- | --- | --- |
| 6.1 | Create and list owned packing templates | #567 |
| 6.2 | Save the selected packing list as a template | #568 |
| 6.3 | Open, rename and delete owned templates | #569 |
| 6.4 | Edit template items and sections | #570 |
| 6.5 | Reorder template items across sections | #571 |
| 6.6 | Refactor sweep | #572 |
| 6.7 | Verify packing template reuse end to end | #575 |

Follow-up work merged between 6.6 and 6.7 and lives in 6.6's range: #573 (`story/template-api-follow-ups`) and #574 (`fix/packing-trip-deferred-issues`, mostly epic 5 deferred items).

Plan ranges, from each plan's `baseline_revision` to the next baseline; 6.7's runs to `HEAD` (inferred):

- 6.1 `c4816de6..b1ea3591`
- 6.2 `b1ea3591..148d5689`
- 6.3 `148d5689..5c6dc7ac`
- 6.4 `5c6dc7ac..1b814370`
- 6.5 `1b814370..c48db44e`
- 6.6 `c48db44e..75fac2e3`
- 6.7 `75fac2e3..HEAD`

Whole epic `c4816de6..HEAD`: 35 commits, 9 merges (all measured), 100 files, no binary revisions.

Evidence available: epic file, tickets, all seven plans, `deferred-work.md`, git, epic 5 retrospective. Missing: session logs, so no process-lesson analysis from why-a-session-turned. No PRD or architecture folder in the initiative.

## Findings

### Spec reconciliation (Done when)

- **D1 met.** No `"use server"` file mentions templates. `src/app/(app)/packing/[templateId]/actions.ts` and `packing/actions.ts` are gone (`git diff --stat`: -330, -159). Eleven template routes are in `docs/api-v1.md:474-540`.
- **D2 met.** Save, reuse, edit and delete are covered by `@feat:template-reuse` (passes) and the four per-stage features. Selected-list save fixed the old copy-everything bug (epic Decision, 2026-11-21).
- **D3 partly met.** Ownership and replay are tested per route. One idempotency invariant is missing (F1).

### Aggregate views

- **F1 (fix now, medium). Template ids have no deletion record.** `deletion-records.ts:25-27` lists `packing-item`, `packing-list` and `packing-template-item`, not `packing-template`. `deletePackingTemplate` (`packing-templates.ts:232-242`) records nothing, and `createPackingTemplate` (`:36-91`) inserts any unused id. A create retried with the same client id after the template was deleted (no key, or key past its replay window) brings the template back. Trips, lists and items already get this protection (epic 5 retro action 2, ADR `adr-packing-order-is-a-full-list-put-with-section`). Same class as epic 5's F3/F4, in the one epic-6 resource the 6.7 verify story did not check. Cascade-deleted template items are also unrecorded; only items deleted individually are (`packing-template-items.ts:213,265`).
- **F2 (defer, low). Replay validators are copied three times.** The `createdAt` check appears at `packing-templates.ts:56-66`, `:123-128` and `:207-212`, with slightly different shapes. Fold into a helper when the null-`createdAt` item below is worked.
- **F3 (defer, low). Domain step file bypassed again.** Ticket 6.2 added 182 lines of save-template steps to `tests/e2e/steps/api.steps.ts` (now 4,826 lines), although `api-packing-templates.steps.ts` (464 lines) existed from 6.1. This is epic 5's AV2 recurring.
- **F4 (defer, low). `src/lib` still imports `src/app`.** `services/trips.ts` and `trip-date-change.ts` (epic 5 AV1) are unchanged. Epic 6 added none: no new import from `src/app` in `packing-templates*.ts`.
- **Size growth.** Largest new modules are `packing-template-items.ts` (337 lines) and `packing-templates.ts` (242). Nothing past a healthy size. Biggest churn is tests (`packing-template-items.test.ts` +519, `api-packing-templates.steps.ts` +467), which is expected.
- **Scope drift (accept).** 6.6's range includes `scripts/pr-review` comment-aware checking and `scripts/benchmark-template-reorder.integration.ts` (+133). Both came from deferred items, were reviewed in #573, and are recorded in `deferred-work.md`. Accepted so later runs stop flagging them.

### Lenses (`bmad-review` not run as a separate skill; inline narrowed scope)

The adversarial, edge-case and verification-gap lenses were run inline over the service files and the 6.7 plan, not over the full 100-file diff. Narrowed scope: service layer, deletion/replay paths, plan verification sections. UI components, route handlers and E2E step bodies were not re-read.

- **F5 (process, medium). Plan Verification sections still skip the validator result.** Plans 6.1, 6.2, 6.4, 6.5 and 6.7 list `build-validator` as a command to run and record no result. 6.3 and 6.6 record counts (6.3: 8,305 tests, 98.05% lines, 1,314 E2E passed). Epic 5 retro action 8 asked for this to be a required field. It was not made one.
- **F6 (process, low). 6.7 verifies composition, not invariants.** Its plan (`story-verify-packing-template-reuse-end-to-end-plan.md`, Design Notes) says to keep one long scenario and asserts ordering and persistence. Epic 5 retro action 9 asked verify stories to add a cross-story invariant pass (deletion records, replay windows). That is how F1 got through.
- **F7 (open, carried). Contract decisions the sprint follow-ups left open.** Cross-section anchors keep the flat-order behavior, and interleaved order is documented. Both are recorded in `deferred-work.md` (2026-11-22 dispositions) and `docs/api-v1.md`. They are decisions made, not fixes, so they are ADR candidates below.

## Behavior verification

- Vitest, 10 files, 180 tests passed: `packing-templates`, `packing-template-items`, `contract/packing-templates`, `src/app/(app)/packing`, `use-packing-handlers`, template components.
- Playwright against the production build: `@feat:templates`, `template-items`, `save-trip-as-template`, `pull-templates`, `template-reuse`, 32 passed. `@feat:api` (where the template API scenarios live) was not run. Not exercised by hand: UI in a browser.
- F1 was found by reading code, not reproduced. A failing test (create, delete, recreate with the same id) would confirm it.

## Previous-retro follow-through

Epic 5 retrospective action items:

1. **Developer: fix the ETag snapshot (F1, F2).** Landed per the epic 5 verdict (fixed on `fix/epic-5-retrospective`).
2. **Developer: add deletion records (F3, F4).** Landed for trips, packing items, sections and lists (`deletion-records.ts:25-27`). Not applied to the new template resource (F1 here).
3. **Developer: fix date-change confirmation and range (F5, F6, F11).** Landed per the epic 5 verdict.
4. **Developer: defer post-commit file removal in `updateTrip` (AV3).** Landed per the epic 5 verdict.
5. **Developer: keep the packing-list form on a failed create (F10).** Landed per the epic 5 verdict.
6. **Developer: log deferred findings in `deferred-work.md`.** Landed: F8, F9, F12-F17, F19, AV1, AV2 appear at `deferred-work.md:255-300`. F9, F14, F16 completed 2026-11-23; F8, F13, F15, F17, AV1 and AV2 still open.
7. **Process owner: update ticket and plan status at merge (P2).** No evidence it landed: all seven epic 6 tickets are still `state: review`.
8. **Process owner: validator result required in plan Verification (P1).** Did not land (F5).
9. **Process owner: cross-story invariant pass in verify stories (P3).** Did not land (F6).
10. **Developer: reproduce invitation F3 conflict.** Still open: `deferred-work.md:190-193`, "not planned for this sprint".

Items 1-6 verified against the epic 5 verdict text and the files cited; commits were not re-diffed. Items 7-9 are the process repeats.

## Action items

Proposed, not applied.

1. **Developer: add template deletion records (F1).** Add `packing-template` to `deletion-records.ts`, record on `deletePackingTemplate` (and its cascade), refuse recreate within the window, with a failing service test and an `api.feature` scenario first.
2. **Process owner: make validator result a required plan Verification field (F5).** Repeat of epic 5 action 8.
3. **Process owner: add the cross-story invariant pass to the epic 7 verify story (F6).** For epic 7: deletion records for every client-id resource (reservations, expenses), replay windows, ETag determinism.
4. **Process owner: update ticket and plan status at merge.** Mark epic 6 tickets `done` through `bmad-ticket` after F1 lands and the verdict is revised.
5. **Developer: move template save steps out of `api.steps.ts` (F3).** Fold into the AV2 split.
6. **Developer (carried over from epic 5): AV1, AV2, F8, F13, F15, F17 and the invitation F3.** Already in `deferred-work.md`; decide before epic 8 or 12.

## Decision records

Considered by the test (hard to reverse, surprising without context, real trade-off, not already recorded):

- **Selected-list save only** (epic Decision 2026-11-21; plans 6.2). Candidate: the web dialog and the old action disagreed, the API copies one list. The user has not been asked.
- **Flat order and grouped display differ** (plan 6.5, `docs/api-v1.md`). Candidate: the API stores request order, the editor groups by membership; chosen without canonicalization.
- **Cross-section anchors keep flat-order placement** (plan 6.4). Candidate, same area; could be one record with the one above.
- Not proposed: whole-list PUT with 409 on mismatch (6.5), already `docs/decisions/adr-packing-order-is-a-full-list-put-with-section.md`.

None written (user decision, 2026-11-23: no ADRs; the choices stay in `docs/api-v1.md` and `deferred-work.md`).

## Acceptance verdict

**Rejected** (user decision, 2026-11-23). The machine verdict was accepted-with-open-items: Done when 1 and 2 are met with evidence, 3 is met except for F1, and every ticket is built. The user overrode it to hold epic 6 open until F1 (template deletion records) is fixed. Criteria declared. Epic 6 tickets stay at `review`; do not mark them `done` until F1 lands and this verdict is revised.

## Open questions

- Does epic 7 inception wait for the F1 fix, or can the two run in parallel? Epic 7's `after` names epic 6's final feature-map and scenario-helper baseline, which F1 touches only through `api.feature` and `api-packing-templates.steps.ts`.
