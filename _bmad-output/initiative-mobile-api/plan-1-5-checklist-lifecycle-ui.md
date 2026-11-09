---
title: "Complete checklist lifecycle UI migration"
type: feature
ticket: 5
created: "2026-11-08"
status: built
baseline_revision: "a3e2fca0ee2319e2f79f07a365dfa6b8cec3d164"
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

**Problem:** Story 1.5 backend is built, but web checklist creation, title editing and deletion still use duplicate server actions.

**Approach:** Move those callers onto existing lifecycle API contracts, support empty DELETE responses in API client, and retire four migrated actions. Preserve current draft, expansion, refresh and error behavior.

## Boundaries & Constraints

**Always:** Current branch `story/1-5-checklist-lifecycle-services`, per earlier user choice; PR base `feature/api-v1`. Preserve reads, checked-state behavior, props, focus, labels and keyboard behavior. Reuse contracts, mutation hook, types and drafts. Tests first; affected E2E only.

**Never:** Migrate item CRUD/packing sources; change schema, backend/shared mutation semantics, styling or changelog; push without authorization.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Empty create | Valid day/position | POST trip checklist contract; refresh canonical days | Reject failed creation; retain draft |
| First-item create | Draft content and position | One POST with firstItem; mapped ID drives expanded new checklist until refreshed props arrive | API/network/auth failure rejects; retry remains possible where authorized |
| Title | String or cleared undefined | PATCH title; clear sends explicit null | Existing API toast/auth redirect; no uncaught promise |
| Delete | Checklist ID and current trip | DELETE with tripId; empty 204 succeeds and refreshes | JSON API errors remain errors |
| Client result | Declared 204 endpoint | Resolve serializable null without parsing empty body | Preserve JSON success/error handling for other contracts |

</frozen-after-approval>

## Code Map

- `src/app/(app)/trips/[tripId]/use-checklist-handlers.ts`: extend lifecycle handlers; retain checked-state FIFO/refresh.
- `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts`: supply trip and packing's new-ID setter to checklist hook.
- `src/lib/api/client.ts`: currently parses every success as JSON. `deleteChecklist` contract declares status 204 and result null.
- `src/lib/api/use-api-mutation.ts`: resolves even on failure. Bridge callbacks to reject creation; reuse toast/redirect.
- `src/components/arrivo/use-day-draft.ts`: retains draft until props arrive; reuse unchanged.
- `src/app/(app)/trips/[tripId]/actions.ts`: retire createChecklist, createChecklistWithItem, updateChecklistTitle and deleteChecklist; retain shared helpers.
- `tests/e2e/api-response.ts`: arm method/path waits before gesture; await before reload.

## Tasks & Acceptance

**Execution:** Tests first. Read bundled Next.js use-router docs before handler edits.

- [x] `src/lib/api/client.test.ts` then `client.ts`: declared DELETE204 resolves null without parsing; unexpected 204 fails for JSON contracts; retain JSON/error regressions.
- [ ] `src/app/(app)/trips/[tripId]/use-checklist-handlers.test.tsx` then matching source: exact lifecycle contract/body, optional first item, missing day, explicit null title, delete trip context, create rejection on network/API/auth failure, no false expansion, delayed refreshed props; retain checked-state tests.
- [ ] `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.test.tsx` then source: API delegation, create Promise/rejection, expansion ID lifetime, unchanged packing.
- [ ] `src/app/(app)/trips/[tripId]/actions.test.ts` then source: remove retired cases/imports, verify no consumers remain; retain remaining authorization/validation/effect tests.
- [x] `tests/e2e/features/day-planning.feature`, `tests/e2e/steps/day-planning.steps.ts`: expanded first-item creation; rename/clear/delete persistence; failed draft retry; mixed timeline insertion/order after reload. Use fresh fixtures and exact POST/PATCH/DELETE waits.
- [x] `tests/e2e/feature-map.mjs`, `scripts/feature-map.test.mjs`: update reached features; preserve shared-file ownership.
- [x] Record completion in `deferred-work.md` and this plan; preserve history. No ticket completion before acceptance passes.

**Acceptance Criteria:**

- Given mixed timeline content, when user creates first-item checklist at a gap, then exactly one expanded checklist appears at intended position and survives reload.
- Given existing checklist, when user renames, clears title and deletes it through web controls, then each completed API write persists after reload without transport errors.
- Given failed creation, when response fails then user retries, then draft remains usable and successful retry creates one checklist.

## Implementation Notes

- `client.ts`: declared 204 resolves null; unexpected 204 on JSON contracts throws `server_error`.
- `use-checklist-handlers.ts` takes `{ tripId, setNewlyCreatedChecklistId }`; create is unkeyed so it resolves right after success and cannot hang on refresh; failure/auth loss reject so `use-day-draft` keeps the draft. Title/delete use per-checklist keys on separate hooks, so rename-then-delete is not ordered across hooks.
- Retired createChecklist, createChecklistWithItem, updateChecklistTitle, deleteChecklist from `actions.ts`/tests; no consumers remain.
- E2E: three scenarios added to `day-planning.feature`; delete step now awaits the DELETE. `feature-map.mjs` already covers these sources, so no edit or `scripts/feature-map.test.mjs` change was needed.
- Focused E2E passes. build-validator PASS: lint, tsc, build, coverage (6854 tests; lines 97.64%, branches 93.25%), affected E2E 100 passed.

## Plan Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
| --- | --- | --- | --- |
| feature-map.mjs not updated | false | rejected | `api` and `day-planning` entries already map `src/lib/api/**` and both hooks; feature-map tests pass. |
| Error toast skipped when onError supplied | false | rejected | `use-api-mutation.ts` toasts before calling `onError`; trip-detail test asserts the toast. |
| Blank/whitespace title or empty first item | false | rejected | `checklist-item.tsx` trims and sends undefined; `use-day-draft` passes `content \|\| undefined`. |
| Stray blank line in test | false | rejected | Prettier ran on the file. |
| Create sends no client id, so a lost response or double submit can duplicate | medium | defer | Old server action had no idempotency either, and the plan reuses drafts unchanged; logged in deferred-work.md. |
| Same gap: E2E mocks the 500 so the server never commits | medium | defer | Same root cause as above. |
| Rename then delete race across separate mutation hooks | medium | patch | Delete now waits for the pending title write; unit test added. |
| Mixed-order E2E only compares before/after | medium | patch | Step now asserts the checklist is last and event precedes note. |
| "resolves after the refresh" test name; no-id day branch untested | low | patch | Renamed; idless day case added. |
| Persistent `mockResolvedValue(null)` leaks between tests | low | patch | Replaced with three `Once` values. |
| Declared 204 returning a JSON 200; 205 empty body | low | rejected | Unlikely contract drift; fix adds branches. |
| Item toggle queued then checklist deleted | low | rejected | Same behavior as the retired path. |
| Create unkeyed resolves before refresh | low | rejected | `use-day-draft` tolerates it; E2E proves the draft is replaced. |
| mock routing by method/path; brittle E2E copy selectors; auth-loss message; 200-char title test removed | low | rejected | Cosmetic or covered by contract/service tests. |

## Design Notes

Hooks contain no JSX; no presentation edits needed. Set expansion ID from mapped result before refresh; existing packing hook clears it when canonical days catch up.

## Verification

Run named Vitest files plus `src/components/arrivo/day-card-body.test.tsx`, `src/components/arrivo/use-day-draft.test.ts` and feature-map tests. Run focused lifecycle E2E, then build-validator: lint/types/build, coverage alone, affected E2E alone.

## Plan Review

Scope PASS: all tasks complete requested slice.
Architecture PASS: existing contracts/hooks reused.
Component PASS: hooks 103/343 lines, actions 1016, client 59; no JSX or new components.
Accessibility PASS: existing controls/focus preserved.
Tests PASS: matching tests and E2E named, including failure/auth and refresh.
Total: zero blocking findings, zero warnings.
