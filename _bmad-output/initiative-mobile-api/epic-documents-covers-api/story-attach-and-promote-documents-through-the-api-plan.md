---
title: "Attach and promote documents through the API"
type: feature
ticket: "4"
created: "2026-11-12"
status: built
baseline_revision: "49a3721b7a392ae378d9c983877458afdec9c324"
route: full
route_source: auto
risk: medium
review: 'thorough'
review_source: 'auto'
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 0
context:
  - "_bmad-output/initiative-mobile-api/AGENTS.md"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Document attachment and promotion still use server actions. They can leave both scope links set; reservation changes lack live sync.

**Approach:** Extend PATCH `/api/v1/documents/:documentId` with absolute scope changes, migrate both pickers and both promotion controls, retire four actions. Actual branch: `story/3-4-attach-and-promote-documents-through-the-api`; PR base: `feature/api-v1`.

## Boundaries & Constraints

**Always:** Validate contract in service. Resolve legacy trip, check editor before/under trip lock, recheck document/target there. Preserve idempotency, mapped responses and `runTripWrite` effects. A document has one scope. Explicit target clears opposite link; either null field promotes by clearing both. Persist resolved tripId when changing legacy rows. Normalize dual-linked rows on first effective change, without backfill; rename preserves mapper's reservation precedence. Empty PATCH and unchanged rename remain no-ops. Normalized repeated attachment emits no write/effects.

**Never:** Migrations, backfill, cover changes, upload behavior changes, unrelated action migration, direct storage operations, new environment variables, CHANGELOG edits.

## I/O & Edge-Case Matrix

| Scenario | Input/state | Behavior | Error |
| --- | --- | --- | --- |
| Attach | eventId or reservationId UUID | Set target, clear other, return scope | — |
| Promote | Either scope field null | Clear both; retain resolved trip | — |
| Retry | Same normalized attachment | Return row, no effects | — |
| Cross-scope | Reservation doc → event | Reservation link cleared | — |
| Legacy | Dual links; effective rename/scope change | Normalize once; no orphan | — |
| Invalid | Both scope fields present, including null; linked-*; malformed UUID | No write | 422 |
| Target | Missing or different trip, even if editor owns both | No write | 404 |
| Access | Viewer / stranger / role lost under lock | No write | 403 / 404 |
| Combined | Valid name and target | Atomic update of both | — |

</frozen-after-approval>

## Code Map

- `src/lib/services/documents.ts` — expand `renameDocument` to `updateDocument`; reuse ancestry/target readers, `lockTrip`, `runTripWrite`; compare normalized values.
- `src/lib/api/contract/documents.ts` — strict nullable UUID fields; retain name schema.
- `src/app/api/v1/documents/[documentId]/route.ts` — expanded service; keep idempotent wrapper.
- `src/components/arrivo/{add-doc-dialog,add-reservation-doc-dialog}.tsx` — keyed `useApiMutation(updateDocument)` for pick; retain upload.
- `src/components/arrivo/{event-doc-row,reservation-doc-row}.tsx` — existing keyed PATCH mutation for promotion; preserve rename/delete guards.
- `src/app/(app)/trips/[tripId]/actions.ts` — retire event attach/promote. Delete emptied `reservations/reservation-document-actions.ts`.

## Tasks & Acceptance

**Execution:**

- [x] Tests first: `src/lib/api/contract/documents.test.ts`, `src/lib/services/documents.test.ts`, `src/app/api/v1/documents/[documentId]/route.test.ts` — matrix cases, legacy event-only/reservation-only promotion, dual-link normalization, atomic rename+scope, target disappearance/movement under lock, role recheck, replay, and reservation attach/promote live-sync payload. Assert stored columns, not only response scope.
- [x] `src/components/arrivo/add-doc-dialog.test.tsx`, `add-reservation-doc-dialog.test.tsx`, `event-doc-row.test.tsx`, `reservation-doc-row.test.tsx` — PATCH payload/key, success, pending/double click, error retry, auth loss; retain upload and rename/delete tests. Picker stays open on error and closes on success/auth loss.
- [x] Implement service/contract/route and four callers after expanded tests fail. Retire four actions and obsolete cases/imports in `src/app/(app)/trips/[tripId]/actions.test.ts`; delete emptied `reservations/reservation-document-actions.test.ts`.
- [x] Extract duplicated confirmation markup into `src/components/arrivo/document-delete-dialog.tsx` with explicit `DocumentDeleteDialogProps`, keeping both rows below 250 lines; add `document-delete-dialog.test.tsx` for labels, pending controls, error, cancel/confirm and Escape/focus.
- [x] `tests/e2e/features/api.feature`, `tests/e2e/steps/api-documents.steps.ts` — scenario-owned attach/promote cases for both targets, repeated attach, cross-scope stored columns, foreign/missing targets, both-fields/linked-id 422, viewer/stranger/cross-site rejection and keyed replay.
- [x] `tests/e2e/features/event-docs.feature`, `reservations.feature`, `tests/e2e/steps/event-docs.steps.ts`, `reservations.steps.ts` — round trip: pick trip document, reload and prove attached/absent from Documents, promote, reload and prove returned to Documents. Arm and await document PATCH via `waitForApiResponse` before every migrated gesture.
- [x] `tests/e2e/feature-map.mjs` — remove dead path, register extracted dialog for event-docs/reservations; run `scripts/feature-map.test.mjs`.

**Acceptance Criteria:**

- Given a trip document, when editor attaches then promotes through either UI and reloads after each, then it leaves and returns to Documents and attachment persists.
- Given reservation document mutations, when attach or promote commits, then activity, revalidation and live sync occur once; no-op retries emit none.
- Given retired actions, when searching definitions and callers, then none remain.

## Implementation Notes

Plan reviewer: scope PASS; architecture PASS; component PASS (planned extraction addresses existing row sizes); accessibility PASS; test coverage PASS. All five checks: no issues found. Original request: build ticket 3.4 on current story branch. No blocking findings or warnings.

Implementation verification: initial nine-file targeted suite passed 229 tests; post-review service/row suite passed 140 tests; feature-map passed 21 tests. Targeted API/UI E2E cases passed after replacing the reservation immediate-toggle assertion with required reload persistence round trip. Scope response id/scope and keyed replay equality also passed five focused API scenarios. Next.js route-handler reference read before route edits.

Matrix audit: attachment/combined changes, legacy promotion through either null field, no-op retries, reverse/cross-scope movement, dual-link normalization, invalid input, missing/foreign targets and access loss under lock all have executed passing service/contract tests. API E2E independently checks stored links, response DTO, keyed replay and refusal status; both UI round trips persist after reload. Retired action symbols absent from src.

Review patches: fixed promotion pending state on repeated auth loss; added explicit opposite-field/dual-link promotion, atomic rejection, lock-time scope authorization, repeated promotion and reverse movement assertions. No frozen intent changes.

## Plan Change Log

## Review Triage Log
- B1 — medium; patch. Both rows set pending before mutate; hook authLost early return calls onAuthLost but skips onSettled. Second click can leave row disabled. Reset both flags on auth loss and assert recovery.
- B2 — medium; defer (pre-existing). documentTripId already preferred event ancestry before this change, while mapper preferred reservation. A corrupt legacy row spanning different trips can therefore be authorized through inconsistent ancestry; persist-on-normalization exposes the same existing mismatch. Follow-up must validate retained legacy ancestry consistently.
- B3 — high; defer (pre-existing). reservations/actions.ts deleteReservation reads document URLs and deletes storage before deleting reservation, without trip lock. Former promoteReservationDocToTrip already raced that same sequence. File loss remains possible for concurrent deletion/promotion; coordinate reservation deletion separately.
- B2/B3 continuation — resolved in the same story by `../plan-3-4-document-scope-integrity.md` (ancestry resolver; trip-locked, queued reservation deletion; surviving-document download). The findings above stay as the review record.
- B4 — low; patch in part. Valid name plus missing/foreign target is already covered by rejects missing or foreign tests with name New and no effects. Invalid name plus valid target lacks direct combined-payload assertion; add that case.
- B5 — low; patch. Shared authorization path already rechecks role before every mutation; current direct under-lock test sends rename only. Extend same test to attach and promote payloads to pin scope behavior.
- B6 — low; patch. Current normalized repeat coverage attaches only. Add already-trip promotion no-op test asserting no writes/effects.
- B7 — low; patch. Existing dual-link attachment matrix tests clearing event link when reservation selected; add direct normalized event-only to reservation fixture to make reverse movement explicit.
- B8 — low; reject. Additional two-browser live-sync scenario would require new browser lifecycle/setup and exceeds direct test correction. Required service evidence asserts exact ItineraryChanged publication on reservation attach and promote; shared subscriber refresh has dedicated tests in use-trip-live-refresh.test.ts. No defect in delivery was demonstrated.
- B9 — low; patch in part. Document DTO has no target identifier by design; requested target identifier assertion is false. Service tests already assert mapped response scope and combined name. Add id/scope response assertions to successful API scope steps for direct end-to-end mapping evidence.
- B10 — false. New event round-trip fixture has no other document on selected E2E Event; reload helper must find that event's Show attached documents control before page-wide name assertion. Attaching elsewhere leaves requested event without toggle and fails. Helper itself predates this change.
- G1 — medium; patch. Accept pre-verified gap: same-field-only promotion fixtures could miss null clearing opposite field or dual links. Expand service fixture matrix; same root cause as promotion test gaps above.
- I1 — low; reject. Intent auditor's live-sync surface distinction matches B8; exact server publication plus shared subscriber tests cover changed responsibility. Browser delivery was not changed or shown broken.
- I2 — false. Global cleanup reading conflicts with explicit frozen requirement to normalize on first effective change without backfill and leave empty/unchanged patches untouched. Incremental scope invariant matches intended contract.
- I3 — false. Cross-scope and malformed/foreign target cases are API behaviors; picker exposes trip documents only. Testing API instead of unavailable picker inputs matches intended consumers.
- I4 — false. Delete-dialog extraction keeps touched oversized rows under component limit while preserving existing behavior; plan explicitly requires it. No unrelated deletion behavior added.
- Edge-case-hunter — no findings.

## Design Notes

Preserve client boundaries, typed props, CSS tokens, 44px targets and titled icon controls. Keep Base UI Dialog keyboard opening, Escape dismissal, initial focus and focus return. Rows: 273/262 lines; extract identical deletion markup to bound size. Pickers: 230/236 lines.

Read Next.js route-handler docs before edits. Parent owns build-validator after targeted success: coverage then affected E2E separately.

## Verification

- Run named Vitest tests with `npx vitest run`, plus `scripts/feature-map.test.mjs`; all pass before broad validation.
- `build-validator` — lint, types, build, coverage and affected E2E pass.







Final validation: ESLint PASS (zero errors; existing warnings); TypeScript PASS; production build PASS (19 static pages, bundle sizes not printed by Next.js); coverage PASS (449 files, 7,660 tests; lines 97.97%, functions 97.57%, branches 93.82%); affected E2E PASS (571 tests, zero failures). Four independent review lenses completed; accepted patches verified; two pre-existing issues deferred. No remote operations.

Local implementation commit: 2c64ee192e70bb2821590b4e34363c22ee69f610
Local E2E commit: ec11f587b82350c080e72ad6e8c4f7d2a8b55e31
