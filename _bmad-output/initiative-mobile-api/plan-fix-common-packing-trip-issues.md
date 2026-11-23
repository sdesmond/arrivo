---
title: Fix common packing and trip update issues
type: bugfix
ticket: ""
created: "2026-11-22"
status: built
baseline_revision: "46ad1d1c39cc51d0c23ec50e796bc9be16564a20"
route: full
route_source: auto
risk: medium
review: ""
review_source: ""
lenses_ran: []
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

Fix three deferred issues affecting ordinary trip and packing workflows, and mark the uncommon deferred risks as not planned for this sprint.

## Boundaries & Constraints

**Always:** Preserve existing authorization, replay, error handling, and unrelated list behavior. Retain historic evidence when recording dispositions.

**Never:** Close external issues or mark unverified fixes complete. Do not expand into unrelated maintenance.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected behavior |
| --- | --- | --- |
| Template collision | Existing item matches template section, or vice versa | Preserve both kinds and put template children in correct section; same-kind duplicates remain skipped. |
| Unchanged dates | Effective date range equals stored range | Avoid day updates, trip write, and live change; still apply other requested changes. |
| Date confirmation | Resolution or confirmation present | Preserve validation and conflict handling; never silently accept stale confirmation. |
| Delete and reorder | Requests overlap for same list | Avoid stale membership order and spurious conflicts; retain independent lists and failure recovery. |

</frozen-after-approval>

## Code Map

- `src/lib/services/packing.ts` — template pull deduplicates section and item names in one set; labels map already tracks section IDs.
- `src/lib/services/trips.ts`, `src/app/(app)/trips/date-sync.ts` — update under trip lock and resolve effective date range; preserve confirmation semantics.
- `src/app/(app)/trips/[tripId]/use-packing-handlers.ts` — shared promise map queues item writes separately from list reorder; consider stale snapshots, section deletion, failure and remount.
- `_bmad-output/initiative-mobile-api/deferred-work.md` — record sprint dispositions, preserve external issue and prior evidence.

## Tasks & Acceptance

**Execution:**

- [x] First extend `src/lib/services/packing.test.ts` for collisions in both directions, existing section mapping, same-kind duplicates, and out-of-order children; fix template pull in `packing.ts`.
- [x] First extend `src/lib/services/trips.test.ts` for equal full/partial dates, null clearing, other fields, real changes, and confirmation; fix `trips.ts` under the existing lock.
- [x] First extend `src/app/(app)/trips/[tripId]/use-packing-handlers.test.tsx` for held delete/reorder in both orders, failure, section modes, independent lists and remount; fix coordination in the matching hook.
- [x] Extend appropriate `tests/e2e/features/packing-tab.feature` and `tests/e2e/steps/packing-tab.steps.ts` for applicable persisted user-facing packing behavior; use `tests/e2e/steps/api-trip-dates.steps.ts` for API date coverage if needed.
- [x] Mark uncommon user-facing deferrals not planned for this sprint; leave maintenance entries and external issue status untouched. Reconcile fixed entries only after verification.

**Acceptance Criteria:**

- Given a matching item and template section, when pulling the template, then both are retained and children belong to the section.
- Given unchanged trip dates, when the trip is saved, then its existing day data and change timestamp remain unchanged unless another requested field changes.
- Given overlapping deletion and reordering, when writes settle, then the intended surviving order persists without a stale-membership conflict.

## Implementation Notes

Targeted tests, lint, TypeScript, build, coverage (8,383 tests), and affected E2E (924 scenarios) passed.

## Plan Change Log

## Review Triage Log

## Verification

- Run matching Vitest files before broad validation; run applicable affected E2E scenarios.
- Invoke build-validator after implementation and targeted tests.

