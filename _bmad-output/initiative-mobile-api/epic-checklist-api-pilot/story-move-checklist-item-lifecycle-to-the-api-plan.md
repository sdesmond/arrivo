---
title: "Move checklist item lifecycle to the API"
type: feature
ticket: 6
created: "2026-11-09"
status: done
baseline_revision: "975cdd1e266c4cd48add500a3a5a8536a5bc3800"
route: full
route_source: auto
risk: medium
review: 'thorough'
review_source: 'auto'
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 0
context: [_bmad-output/initiative-mobile-api/AGENTS.md]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Checklist item creation, content editing and deletion still call server actions; API PATCH supports checked state only.

**Approach:** Complete services/contracts/routes and migrate callers through checklist handlers; preserve checked intent and refresh continuity.

## Boundaries & Constraints

**Always:** Branch `story/1-6-checklist-item-api`; PR base `feature/api-v1`. Tests first. Reuse actor-explicit services, mappers, locks, atomic replay and effects. Recheck access/ancestry under lock before replay/collision handling. Preserve keyboard/focus, labels, completion and 44×44 controls.

**Never:** Add ordering storage, migrations/env, unrelated refactors or changelog edits. Leave packing-source/action retirement to 1.7/1.8. No unauthorized push. Return to integration branch after PR; pull before next story.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Create | POST `/api/v1/checklists/:checklistId/items`, `{id?, content}` | 200 mapped item; normalized UUID; matching retry returns row | Invalid 422; incompatible UUID 409; inaccessible collision concealed |
| Update | PATCH `/api/v1/checklist-items/:itemId`, `{content?, isChecked?}` | 200; preserve omitted fields; empty patch no-op; absolute checked | Invalid/unknown fields 422; malformed envelope 400 |
| Delete | DELETE item route, `{tripId}` | 204/no-store; authorized missing row succeeds | Wrong-trip ancestry 404 |
| Replay/access | Mutation with optional key | Atomic original response; no duplicate effects | 401 unauthenticated; 403 viewer; 404 stranger/missing parent; 409 key conflict; reauthorize replay |
| Rapid writes | Edit/check/delete same item | Ordered through refresh; independent items concurrent | Rollback, queue recovery and auth redirects |

</frozen-after-approval>

## Code Map

- `src/lib/services/checklists.ts`: reuse ancestry, `withIdempotency`, mapper/effects. Share `checklist-item:<UUID>` lock namespace/order with first-item creation; retain createdAt ordering.
- `src/lib/api/contract/checklists.ts`: reuse content schema; lifecycle DELETE supplies trip-context/204 precedent.
- `src/app/(app)/trips/[tripId]/use-checklist-handlers.ts`: extend optimism/refresh waiters. Separate mutation hooks have separate queues; coordinate item writes.
- Same folder `use-trip-detail-handlers.ts`: replace three action calls; retain signatures and action exports.
- `tests/e2e/api-response.ts`: exact method/path waits; existing map globs cover routes.

## Tasks & Acceptance

**Execution:** Named tests first. Read bundled Next.js route-handlers/use-router docs. Change exceeds 100 lines: full route.

- [ ] `src/lib/api/contract/checklists.test.ts` then matching source: create/delete contracts and partial PATCH; UUID normalization, trimmed content/caps, strict fields, omitted fields and empty patch.
- [ ] `src/lib/services/checklists.test.ts` then source: matrix; UUID retry/collision including concurrent cross-trip and first-item creates; rollback; locked access/ancestry changes; no effects on replay/no-op/failure; insertion order.
- [ ] `src/app/api/v1/checklists/[checklistId]/items/route.test.ts` then new route; `src/app/api/v1/checklist-items/[itemId]/route.test.ts` then existing route: wrapped POST/PATCH/DELETE, exact contracts, actor/body/replay forwarding and 204 declaration.
- [ ] `src/app/(app)/trips/[tripId]/use-checklist-handlers.test.tsx` then source: add/edit/delete payloads, sequencing, rapid checks, delayed refresh, independent items, rollback/recovery and auth failure.
- [ ] Same folder `use-trip-detail-handlers.test.tsx` then source: delegate item callbacks. Extend `page-client.test.tsx`, `trip-detail-tab-body.test.tsx`, `trip-itinerary-view.test.tsx`: add/edit/delete forwarding.
- [ ] `src/components/arrivo/checklist-item.test.tsx`, `checklist-item-row.test.tsx`: callback payloads, keyboard save/cancel, absolute true/false. No presentation edits.
- [ ] `tests/e2e/features/day-planning.feature` and `tests/e2e/steps/day-planning.steps.ts`: add/edit/check/uncheck/delete with reload; delayed mixed writes and recovery. Replace item-create wait; preserve unmigrated waits.
- [ ] `tests/e2e/features/api.feature` and `tests/e2e/steps/api.steps.ts`: scenario-owned fixtures; UUID/key retries/conflicts, partial preservation, duplicate delete, roles/revocation. Arm API waits before gesture; await before reload.
- [ ] `scripts/feature-map.test.mjs`: assert item runtime ownership; update `tests/e2e/feature-map.mjs` only for missing reached-feature registrations. Run wrapper-coverage regression too.

**Acceptance Criteria:**

- Given editable checklist, when user adds, edits, checks/unchecks and deletes items, then each change survives reload through `/api/v1` and remaining item content/order stays intact.
- Given delayed writes and refresh, when edit/check/delete overlap, then final persisted state matches intent order without checked-state snapback or blocking independent items.
- Given conflicting retries or revoked access, when item request repeats, then no unauthorized response, duplicate row or partial write occurs.

## Implementation Notes

## Plan Change Log

## Review Triage Log

| Finding (lens) | Verdict | Route | Evidence |
| --- | --- | --- | --- |
| UI sends no client UUID on item create (blind, edge) | low | defer | Same gap as retired action; recorded in deferred-work.md. |
| Rejected write strands delete via `pending.then` (blind) | false | rejected | `useApiMutation.mutate` wraps run() in try/catch/finally; its promise never rejects. |
| Untrimmed content never matches refreshed value (blind) | low | rejected | Only editor paths call it and both trim first (`checklist-item-row.tsx:28`, `checklist-item.tsx:90`); fix adds a branch. |
| Mixed `getNow()`/`clock_timestamp()` createdAt (blind, edge) | low | rejected | First-item `getNow()` predates this change; real time equals mock outside dev picker; old action used DB `now()`. |
| No per-checklist item cap (blind) | false | rejected | Retired `createChecklistItem` action had no cap. |
| Old server actions remain (blind, gap) | low | rejected | Frozen Never block leaves action retirement to 1.7/1.8. |
| Duplicate test in `checklist-item.test.tsx` (blind, gap, edge) | low | patch | Removed; behavior already covered by "forwards absolute false for an already checked row". |
| Row test task not done (edge) | false | rejected | `checklist-item-row.test.tsx` already covers Enter save, Escape cancel and payloads; no production change. |
| Queued delete refires after auth loss (edge) | low | rejected | Second 401 only repeats the sign-in redirect; fix adds a guard. |
| Checklist delete ignores pending item delete (edge) | low | rejected | Item delete on a vanished row succeeds by contract. |
| Empty-valued patch keys (edge) | false | rejected | Unreachable over JSON; contract strips undefined. |
| Empty patch not side-effect free (edge) | false | rejected | Matrix says no-op write; locks, role check and key record are intended. |
| Update-path denial scenario missing (blind) | low | rejected | Covered by service unit tests and existing check scenarios. |
| DELETE body required (blind) | false | rejected | Matrix-specified; mirrors `deleteChecklist`. |
| Vacuous negative e2e assertion (blind) | low | rejected | Final per-item request order assertion proves sequencing. |
| Feature-map coverage unshown (blind) | false | rejected | Globs exist; feature-map test passed. |
| Test plumbing nits (blind) | low | rejected | Cosmetic. |
| No create failure UX (blind) | low | rejected | Same toast behavior as before; unchanged. |
| PR/changelog note (blind) | false | rejected | PR description concern, handled at present. |
| Intent alignment audit | n/a | none | Diff implements handler-layer migration; no divergence needing action. |

## Verification

Run named Vitest files plus `src/lib/api/handler-coverage.test.ts`; focused API/day-planning E2E; project-owned build-validator: lint/types/build, coverage alone, affected E2E alone. No automatic full suite. Source scope expansion requires matching tests first.

## Plan Review

All five plan-reviewer checks PASS; zero blockers/warnings. Scope matches 1.6; architecture reuses existing boundaries. Modified sources contain no JSX (service 291 lines, contract 37, hooks 200/305, route 8); no presentation split needed. Accessibility preserved. Every source/flow has named tests.
