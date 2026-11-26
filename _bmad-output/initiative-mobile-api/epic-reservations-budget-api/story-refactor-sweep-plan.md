---
title: "Reservation and budget refactor sweep"
type: refactor
ticket: 8
created: "2026-11-25"
status: done
baseline_revision: "0f565cccbedb0f04a0c084574138aa162b0811ae"
route: full
route_source: auto
risk: medium
review: thorough
review_source: auto
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 0
context: ["_bmad-output/initiative-mobile-api/AGENTS.md"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Epic 7 accumulated deferred review findings, including an incomplete date edit that can save another field before reporting an error, and reservation API behavior lacks real HTTP coverage. Plans also do not require a recorded build-validator result.

**Approach:** Resolve or explicitly disposition each deferred finding against current code; fix the incomplete-date save and add HTTP coverage. Require a recorded validator result in future build plans. Fix residual cascade deletion records for API resources removed by event, day, checklist, packing list, and trip deletes.

## Boundaries & Constraints

**Always:** Keep public API contracts unchanged. Branch `story/7-8-refactor-sweep`; PR base `feature/api-v1`, following the initiative branch policy. Preserve keyboard, focus and error feedback in the date editor, and use existing design tokens and 44×44px minimum targets. Record the disposition of each deferred finding with evidence. Run tests first for runtime behavior.

**Never:** No schema migration or endpoint contract change. Do not silently relax validation for invalid legacy reservation rows; document the remaining behavior as a deliberate contract-preserving disposition. Do not change identical expense PATCH no-op semantics; explicit recalculation provides retry. Do not modify prior frozen plans or ticket files.

## I/O & Edge-Case Matrix

| Scenario | Input / state | Expected behavior |
| --- | --- | --- |
| Incomplete date draft | One date/time pair incomplete while the other is changed | Show error, retain drafts, make no PATCH and do not call onSaved |
| Complete or cleared dates | Valid complete pairs or fully cleared pair | Preserve existing PATCH, validation, success and error behavior |
| Reservation HTTP | Viewer PATCH; editor null clear; GET as viewer and editor | Viewer denied; clear persists; viewer response hides expense while editor sees it |
| Cascade deletion records | Delete an event, day, checklist, packing list, or trip with child API resources | Record the IDs of removed child API resources in the same transaction, preserving authorization and delete responses |
| Verification field | New plan or completed build | Verification has required build-validator result; record lint, typecheck, build, coverage and affected E2E outcomes or explicit blocked reason before marking built |

</frozen-after-approval>

## Code Map

- `src/components/arrivo/reservation-date-editor.tsx`: `handleDoneEditingDates` currently checks incomplete drafts after PATCH; its trigger and text sizes also need scoped accessibility correction. Existing `reservation-date-editor.test.tsx` mocks date/time controls and API hook.
- `src/lib/services/reservations.ts`: merged date checks apply to unrelated changes on legacy invalid rows; changing these would alter accepted PATCH behavior. GET visibility is covered in mocked service tests only.
- `tests/e2e/features/api.feature`, `tests/e2e/steps/api.steps.ts`, `tests/e2e/scenario-fixture.ts`, `tests/e2e/e2e-seed-data.ts`: reuse scenario-owned fixture and authenticated API patterns; assert actual DB-backed response and persisted clear. `tests/e2e/feature-map.mjs` maps routes and components to affected features.
- `_bmad/custom/bmad-build.toml`: project build workflow customization; add persistent requirement for Verification result without changing shipped skills. `AGENTS.md`: project verification instructions. Preserve existing customization.
- Story plans for 7.2, 7.3, 7.5 contain explicit deferrals. Expense cascade records now exist in reservations, events, days and trip-date-change services; 7.6 removed old delete action; 7.7 exposes recalculation. Record precise evidence and remaining decisions in this plan.

## Tasks & Acceptance

**Execution:**

- [x] Tests first: extend `src/components/arrivo/reservation-date-editor.test.tsx` for incomplete start and end alongside a changed complete pair, asserting no API or saved callback; retain valid, cleared, error and keyboard behavior.
- [x] `tests/e2e/features/api.feature` and `tests/e2e/steps/api.steps.ts`: add scenario-owned reservation and linked expense; exercise real GET visibility by role, editor PATCH null clear and persisted GET, viewer PATCH denial. Use existing fixture helpers; update `tests/e2e/feature-map.mjs` if needed.
- [x] `tests/e2e/features/reservations.feature` and `tests/e2e/steps/reservations.steps.ts`: exercise an incomplete date draft alongside another changed pair; verify error and persistence after reload using a scenario-owned reservation.
- [x] `src/components/arrivo/reservation-date-editor.tsx`: validate both draft pairs before any write; preserve complete/cleared behavior and focus, escape, labels and error announcement. Ensure trigger meets 44×44px and use project font scaling for affected date editor text.
- [x] `_bmad/custom/bmad-build.toml` and `AGENTS.md`: require each build plan's Verification section to contain a `Build-validator result` field and actual outcomes for lint, TypeScript, build, coverage and affected E2E, or explicit blocked reason, before built. Preserve validator ownership and existing config. Verify rendered configuration and document whether enforcement is instructional.
- [x] This plan's Implementation Notes: enumerate every deferred finding in 7.2, 7.3 and 7.5, recording fixed, already resolved, or retained with exact evidence and rationale. Audit other cascade kinds before concluding; name any residual gaps rather than claim universal coverage. Record disposition of other reservation row target/font findings without widening into unrelated UI or API changes.

- [x] Extend the colocated tests for the event, day, checklist, packing, and trip services, plus API feature and steps, to cover cascaded child IDs and rejection of a recreate attempt.
- [x] Record IDs for API resources removed by event, day, checklist, packing list, and trip deletion in each mutation transaction. Keep existing storage cleanup, preserved documents, authorization, and endpoint responses.

**Acceptance Criteria:**

- Given an incomplete date/time pair, when the date editor saves with another pair changed, then no partial update persists and the error remains visible.
- Given a reservation with a linked expense, when real HTTP requests are made by editor and viewer, then authorization, null clearing and expense visibility match the existing contract.
- Given all explicit deferred findings from stories 7.1–7.7, when the sweep is complete, then each has an evidence-backed disposition.
- Given a new build plan, when it reaches built status, then Verification records the required validator result or a specific blocker.

## Implementation Notes

- Branch `story/7-8-refactor-sweep`. PR base `feature/api-v1`.
- **7.2, incomplete date draft — fixed.** `reservation-date-editor.tsx` validates both pairs before constructing the PATCH and keeps the drafts and polite status message visible on failure. Both unit cases reproduced the partial write before the fix. The Reservations browser scenario checks both saved times after reload.
- **7.2, legacy date rows — retained.** `updateReservation` in `src/lib/services/reservations.ts` returns identical PATCHes early, then validates merged dates for effective changes. An unrelated effective edit can still fail on a legacy row with a required end missing, an end without a start, or reversed dates. Correcting dates in the same PATCH is supported where the merged dates satisfy the rules. The sweep preserves the accepted PATCH contract.
- **7.2, reservation row targets and font sizes — fixed within date editor; retained elsewhere.** The date trigger has 44×44px minimum dimensions and the trigger, labels and error follow `--font-scale`. The row's `size-8` delete target, compact confirmation/document/location/cost chips, and inline text targets remain outside the date editor. The row's 13px notes and shared inline placeholder styles also remain outside this change.
- **7.2, reservation HTTP coverage — fixed.** The Reservations feature already covered role-based visibility on the collection endpoint. The API feature now covers item GET for viewer and editor, viewer PATCH returning 403, editor PATCH with `endAt: null`, and a fresh GET that confirms the persisted clear while returning the linked expense.
- **7.3, cascade deletion records — already resolved for reservation, event, day and date-range expense removal.** `deleteReservation` records linked expenses and documents. `deleteEvent` and `deleteDay` record linked expenses. `applyTripDateChange` records expenses and documents removed with events and reservations, as well as the removed events, reservations, days, itinerary notes, checklists and checklist items. Packing section deletion and template deletion record their removed items in `packing.ts`, `packing-template-items.ts` and `packing-templates.ts`.
- **7.3, residual cascade gaps — fixed.** `deleteEvent` now records discarded documents, including rows without files. `deleteDay` now records events, event documents, itinerary notes, checklists and checklist items alongside existing expense records. `deleteChecklist` now records item IDs. `deletePackingList` records each deleted item. `deleteTrip` records its days, events, reservations, documents, expenses, itinerary notes, checklists, checklist items, trip notes, packing lists and packing items. Parent row locks prevent children from being attached after scanning, and all records commit with their delete.
- **7.3, indirect references — audited.** Trip deletion follows events linked by day even if the event has another trip ID, documents and expenses linked through trip, event or reservation, and packing items linked through trip or packing list. A packing item that survives because only its section was deleted has its label link cleared by the existing foreign key. Packing templates belong to users, and collaborators, invitations and activity rows have no deletion-record resource.
- **7.5, identical expense PATCH retry — retained.** `updateExpense` in `src/lib/services/expenses.ts` returns the existing row when there are no changed keys. The Budget tab's `recalculateExpenses` action calls `POST /api/v1/trips/:tripId/expenses/recalculate` for explicit retry.
- **7.5, old `deleteExpense` action — already resolved.** `place-row.tsx`, `reservation-cost-chip.tsx` and `trip-add-expense-modal.tsx` use the API contract. The item DELETE route calls `src/lib/services/expenses.ts`, which records the deletion in its mutation transaction. The server-action export is gone.
- **Verification requirement — instructional.** The rendered BMad workflow includes the persistent fact from `_bmad/custom/bmad-build.toml`, and `AGENTS.md` repeats the built-status requirement. The existing project validator still runs the checks. No plan parser enforces the Markdown field.

## Plan Change Log

- User expanded the sweep during review to fix the documented residual cascade deletion-record gaps. Keep the date editor, reservation HTTP coverage, and validator requirement. The earlier affected Playwright run verifies the pre-expansion scope.

## Review Triage Log

| Finding | Verdict | Route and evidence |
| --- | --- | --- |
| Contract change misses API feature (edge) | false | API entry already includes the contract via `src/lib/api/**`. |
| Expanded time inputs are 36px (blind) | low | Existing shared Input height. Deferred with expanded control styling. The scoped change covers the collapsed trigger. |
| Escape does not restore trigger focus (blind) | medium | Deferred. Existing Escape handling unmounts the controls without restoring focus. |
| Unedited seconds can be truncated (blind) | medium | Deferred. Existing ISO-to-draft conversion preserves only minutes, so blur can normalize a non-minute timestamp. |
| Reload can cancel unintended PATCH (blind) | medium | Patch browser check to observe requests before reload. |
| No recovery test after incomplete error (blind) | low | Rejected. Unit tests check both drafts survive and a separate complete-pair test verifies save. |
| Item document visibility untested (blind) | low | Rejected. The item scenario targets expense visibility and end clearance; existing collection scenario checks documents. |
| Validator result pending (blind) | false | The plan is in review and the validator runs before built status. |
| Trigger size and scaling unverified (verification gap) | medium | Patch browser test to check measured size and computed font. |
| Shared collection steps missing from affected map (verification gap) | medium | Patch Reservations mapping for API step dependency. |
| Stale Add dates font assertion (verification gap) | medium | Patch row test to expect the scaled style. |
| Requirement could imply parser enforcement (intent audit) | false | Approved plan explicitly calls for persistent workflow instructions and asks to document the enforcement mechanism. |

| Large cascades exceed bind limit (edge) | medium | Patch. Batch record upserts and use SQL parent subqueries. |
| Large cascades exceed bind limit (blind) | medium | Same root cause as edge finding. Batched records and SQL subqueries preserve transactional coverage. |
| Account deletion bypasses trip service (blind) | medium | Deferred. The account-deletion transaction performs independent cleanup outside the five expanded parent delete operations. |
| Cascaded expense IDs lack HTTP retries (blind) | medium | Patch. Retry event-linked and reservation-linked expense IDs under the surviving trip. |
| Cascade interleavings untested (blind) | medium | Deferred verification. Existing DB-backed outline covers sequential retries, including cross-trip references. |
| Cross-trip child creation can evade verification (verification gap) | medium | Deferred verification. A deterministic race test requires coordinating PostgreSQL transactions through scan and delete. |

## Verification

**Cascade expansion targeted results:** All 436 tests in the five changed Vitest suites passed. The Playwright outline passed for event, day, checklist, packing list and trip deletion, plus authentication setup. The HTTP retries returned 409 against surviving parents. The fixtures exercised indirect event, reservation, document, expense and packing relationships across trips.

**Commands:**

- Run targeted `npx vitest run src/components/arrivo/reservation-date-editor.test.tsx` and any additional changed colocated tests; run relevant feature-map check.
- Run affected API/reservation E2E before broad validation when practical. Inspect rendered build workflow to confirm the persistent field requirement.
- Run targeted Vitest for `events.test.ts`, `days.test.ts`, `checklists.test.ts`, `packing.test.ts` and `trips.test.ts`. Run focused Playwright for the cascade replay scenario outline.
- Invoke `build-validator` after targeted checks. Record all outcomes below.

**Targeted results:** Both incomplete-pair unit cases failed before the fix by making a partial PATCH. All 6 date editor tests and all 22 feature-map tests passed after the fix. Playwright passed the reservation item GET/PATCH scenario, the incomplete date draft scenario, the existing inline editing scenario, and authentication setup against a production E2E build. The rendered BMad workflow showed the required Verification field instruction.

**Review verification:** 79 ReservationRow and feature-map tests passed. Five focused Playwright checks passed, including the incomplete draft browser test and all three collection visibility roles. The draft test now measures the collapsed trigger, checks font scaling and observes matching PATCH requests before reload.

**Cascade review verification:** The new batching regression failed before the fix and passed with all 179 targeted deletion-record, day, and trip tests. Parent lookups use SQL subqueries to avoid one bind parameter per parent ID. The original pre-expansion Playwright run passed all 730 tests.

**Build-validator result:** PASS. ESLint, TypeScript, and production build passed. Coverage passed all 8,441 tests with 98.19% lines, 97.69% functions, and 94.29% branches. Affected Playwright passed all 920 tests across 17 features. The final focused cascade run also passed all five cases plus authentication.
