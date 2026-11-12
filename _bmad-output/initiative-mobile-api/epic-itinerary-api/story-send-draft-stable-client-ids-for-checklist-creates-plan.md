---
title: "Send draft-stable client IDs for checklist creates"
type: "feature"
ticket: "3"
created: "2026-11-10"
status: done
baseline_revision: "90a391e65d96219bbd26245758b7e9f37669a93b"
route: "full"
route_source: "auto"
risk: "medium"
review: "thorough"
review_source: "auto"
lenses_ran: ["blind-hunter", "edge-case-hunter", "verification-gap", "intent-alignment"]
review_loop_iteration: 0
context: ["{project-root}/_bmad-output/initiative-mobile-api/AGENTS.md"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The checklist-from-gap UI sends no client UUID, so the API's id-based replay is unused: a retry after a lost response or double submit can duplicate the checklist (retro A-5). `handleInsertFromPackingSource` mints a fresh ID per call and nothing guards an in-flight insert, so a double-click creates two checklists. `use-day-draft` locks a draft whose commit resolves without growing the timeline (F-5). The service rejects a same-ID retry once another insert shifted `position` (F-3).

**Approach:** `use-day-draft` mints one ID per draft and sends it on every commit of that draft; `handleAddChecklist` forwards it as the checklist `id`, and `handleAddChecklistItem` sends an ID per add. The picker handler ignores a call while one insert is in flight. The draft clears when its own ID shows in the timeline and re-arms when the day changes without growing. `createChecklist` treats position drift as a replay, and the ADR records this rule for every later create. Branch `story/2-3-draft-stable-checklist-client-ids` from `feature/api-v1`; PR base `feature/api-v1`; switch back to `feature/api-v1` after the PR.

## Boundaries & Constraints

**Always:** Tests first. One ID per draft: a rejected commit, a re-arm and a repeat Enter/blur reuse it; cancel, a new gap or a new draft mints a new one. A same-ID create replays when the stored row has the same trip, day, title and contents; only `position` may differ, and the stored row is returned unchanged with no shift, write or effects. Title, day, item text/count/order/checked state and trip stay collisions (409). Item adds mint one ID per gesture.

**Never:** Add IDs to event, note, day-note or trip-note creates (entries 5–7). Add retries or timers. Change `src/lib/validation-schemas.ts`, add migrations, edit the idempotency-key layer, or edit `CHANGELOG.md`. Send a first-item ID (replay matches the first item by content). No push or PR without user confirmation.

## I/O & Edge-Case Matrix

| Scenario                    | Input / State                                                       | Expected Output / Behavior                                             | Error Handling                       |
| --------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------ |
| Commit rejects, user retries | Draft D failed with a toast; Enter again                            | Second call carries D's ID                                             | —                                    |
| Lost response               | Create committed, client timed out; refresh shows checklist with D's ID | Draft clears, no second row                                        | —                                    |
| Commit resolves, day changes without growth | Draft committed; live sync removes one item before the refresh | Draft re-arms; next commit reuses the ID                          | Replay returns the stored row        |
| New draft                   | Cancel, then open a gap again                                       | Fresh ID                                                               | —                                    |
| Position drift              | Same ID after another insert shifted `position`                     | 200 stored row at its current position, no write/effects               | —                                    |
| Content drift               | Same ID, different title/day/contents                               | 409 `conflict`                                                         | `ConflictError`                      |
| Picker double-click         | Two selects before the first insert resolves                        | One request                                                            | Guard clears when the insert settles |
| Picker after failure        | Insert failed, user selects again                                   | New request with a new ID                                              | —                                    |

</frozen-after-approval>

## Code Map

- `src/components/arrivo/use-day-draft.ts:35-122` -- replace `propTimelineItemCount` with `propTimelineItemIds: string[]`; ID in a `useRef` minted in `activateDraft` via `createRandomId` (`src/lib/utils.ts:11`); pass it as the 4th arg of `onAddChecklist`. Effect on the ids signature: own ID present → clear; length grew past the baseline → clear; signature changed without growth → re-arm (`pendingCommitBaselineRef = null`, `commitStartedRef = false`). Baseline stores count and signature.
- `src/components/arrivo/day-card-body.tsx:96-104` -- pass `propTimelineItems.map((item) => item.data.id)`; widen the `onAddChecklist` prop type.
- `src/components/arrivo/day-card.tsx:28`, `src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx:57`, `trip-detail-tab-body.tsx:60`, `use-trip-detail-handlers.ts:48` -- widen `onAddChecklist` to `(dayNumber, insertAtPosition, firstItemContent?, clientId?: string)`. Type-only.
- `src/app/(app)/trips/[tripId]/use-checklist-handlers.ts:178-240` -- `handleAddChecklist` adds `id` to the body when given; `handleAddChecklistItem` adds `id: createRandomId()`.
- `src/app/(app)/trips/[tripId]/use-packing-handlers.ts:212-229` -- `useRef` in-flight flag set before the await, cleared in `finally`; a call during flight returns. Keep the per-call `createRandomId()`.
- `src/lib/services/checklists.ts:163-181` -- drop `current.position !== body.position` from the collision test; the replay returns `current`. Update the doc comment.
- `src/lib/services/checklists.test.ts:580-597,984-997` -- both tables list `position` as a collision; move it to a replay test.
- `docs/decisions/adr-client-uuids-are-locked-before-the-trip-lock.md` -- add the retry-equality rule; later creates adopt it.
- `tests/e2e/features/api.feature` + `steps/api.steps.ts:502-600` -- reuse `lifecycleInput`/`sendLifecycleCreate`. `tests/e2e/features/day-planning.feature:59` + `steps/day-planning.steps.ts:609` -- reuse "I add a checklist with item".
- `tests/e2e/feature-map.mjs:469,476,530` -- the touched files are already mapped; no change expected.

## Tasks & Acceptance

**Execution:**

- [ ] `src/lib/services/checklists.test.ts` then `checklists.ts` -- position drift replays with no write/effects (both tables); title, day, item and checked-state drift still 409.
- [ ] `src/components/arrivo/use-day-draft.test.ts` then `use-day-draft.ts` -- one ID across a rejected commit and a re-arm; new ID after cancel and new draft; clear on own ID; re-arm on a non-growing change; existing count tests move to the ids prop.
- [ ] `use-checklist-handlers.test.tsx` then `use-checklist-handlers.ts` -- body carries the given `id`; item add sends an ID; calls without one send none.
- [ ] `use-packing-handlers.test.tsx` then `use-packing-handlers.ts` -- double select sends one request; a later select after settle or failure sends another with a new ID.
- [ ] `src/components/arrivo/day-card-body.test.tsx` then `day-card-body.tsx` -- a checklist draft committed through the card passes its draft ID to `onAddChecklist` as the 4th argument, and the draft clears once a checklist with that ID is in `day.checklists`.
- [ ] Type-only prop widening in `day-card.tsx`, `trip-itinerary-view.tsx`, `trip-detail-tab-body.tsx`, `use-trip-detail-handlers.ts`; run `tsc`. No split of the two files already over 250 lines (268, 283): the edit adds no JSX.
- [ ] `api.feature` + `api.steps.ts` -- create a second checklist at the same position, retry the first create: 200, original ID, shifted position, two rows. `day-planning.feature` + steps -- add a checklist, reload: exactly one with that item.
- [ ] ADR -- state the equality rule and that entries 5–8 adopt it.

**Acceptance Criteria:**

- Given a checklist draft whose first commit failed, when the user commits again, then both requests carry the same `id`.
- Given a double-click on a picker row, when the insert settles, then one checklist exists.
- Given a draft committed while the day changes without growth, when props update, then the draft accepts a new commit.
- Given the change set, when `scripts/affected-e2e.mjs` runs, then it selects the mapped features.

## Implementation Notes

## Plan Change Log

## Review Triage Log

| Finding | Lens | Verdict | Route | Evidence |
| --- | --- | --- | --- | --- |
| Re-arm on a changed signature also applied to note/event drafts, which carry no ID, so a repeat commit could duplicate | blind, verification-gap | medium | patch | Verified in `use-day-draft.ts`: `canRearm` now limits re-arm to checklist drafts; note-draft test added |
| Draft stays open when its own ID lands after a rejected/timed-out commit (matrix "Lost response") | blind, edge | medium | patch | Effect returned early while `committedRef` was null; now clears on own ID regardless; test added |
| Re-arm nulled the baseline so a later-landing own item never cleared the draft | edge | medium | patch | Same effect fix (own-ID clear is independent of the baseline); test added |
| `propTimelineItemIds` in effect deps is a fresh array each render | blind, edge, verification-gap | low | patch | Effect now reads the `signature` string only |
| Commit A pending while draft B is opened arms B's baseline | edge | low | defer | Pre-existing: the old baseline ref behaved the same |
| Stale baseline / another user's item mid-flight clears draft early | blind | low | defer | Pre-existing count-growth clear; cosmetic |
| Edited text on retry after an ambiguous failure gets 409 until cancel | edge, verification-gap | low | defer | Frozen boundary: content drift stays 409; a fix needs a new-ID-on-conflict rule |
| Replay after the stored row was edited returns 409 | edge | false | rejected | Intended per Design Notes and the ADR |
| Packing guard drops a different second insert silently | blind, edge | false | rejected | Intent: "ignores a call while one insert is in flight" |
| Item add IDs are per call, no retry stability | blind | false | rejected | Intent: "an ID per add"; plan: one ID per gesture |
| ADR silent on source-path equality and replayed position | blind | low | patch | One sentence added to the ADR |
| E2E brittleness (3-row count, reload before DB read, first button) | blind | low | rejected | Mirrors existing steps; fix adds complexity for no everyday harm |
| Undefined `data.id` in the ids list | edge | false | rejected | `data.id` is a required string on every timeline item |
| Empty-string `clientId` / `activateDraft` after `openGap` untested | blind | low | rejected | Trivial branches; no named harm |
| Intent-alignment: expectations live at UI, tests at hook/handler level | intent-alignment | n/a | none | Descriptive; one UI scenario and one API scenario cover the persisted outcome |

## Design Notes

Position is the one field other writers move, so it is excluded from replay equality; content edits are user intent, so replaying over them would answer with state the request did not describe. Re-arming on a changed signature is safe because the retained ID makes a duplicate commit a replay. If the day vanishes (live-sync delete), the card unmounts, so no draft stays stuck.

## Verification

**Commands:**

- `npx vitest run src/lib/services/checklists.test.ts src/components/arrivo/use-day-draft.test.ts "src/app/(app)/trips/[tripId]"` -- expected: pass
- `node scripts/affected-e2e.mjs` -- expected: lists the mapped features
- `build-validator` -- expected: PASS
