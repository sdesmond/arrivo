---
title: "Select and remove a cover through the API"
type: feature
ticket: "5"
created: "2026-11-13"
status: built
baseline_revision: "b48922a8d7624c19ad107c9640e8cee99b7fcddc"
route: full
route_source: auto
risk: medium
review: thorough
review_source: auto
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 0
context:
  - "_bmad-output/initiative-mobile-api/AGENTS.md"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Cover selection/removal still use server actions and leave replaced stored covers orphaned.

**Approach:** Add PUT/DELETE `/api/v1/trips/:tripId/cover`, migrate hero controls, retire two actions. Branch: `story/3-5-cover-api`; PR base: `feature/api-v1`.

## Boundaries & Constraints

**Always:** Preserve existing picker flows (user decision): Search with attribution, HTTP(S) URL, Custom graphic, existing own stored-cover references and E2E stubs. Reuse existing image/photographer URL policy; validate supplied photographer URL, keep attribution optional. Validate input in service and contract. Require editor before and under trip lock; read current cover/name there. Update cover and queue replaced own trip-cover storage URL atomically. Delete files only after commit through existing cleanup helpers/fair retry drain. Use `runTripWrite` for idempotency and `afterTripWrite`. Return 204 for both writes; DELETE takes `{}`. Repeated identical state is a no-op.

**Never:** Upload/search migration (entries 6/7), schema changes, direct storage operations, new environment variables, unrelated action migration, CHANGELOG edits, remote publication without authorization.

## I/O & Edge-Case Matrix

| Scenario | Input/state | Behavior | Error |
| --- | --- | --- | --- |
| Select | Valid image and optional attribution | Replace all three cover fields | — |
| Remove | Photo/map/graphic | Derive graphic from locked current name; clear attribution | — |
| Cleanup | Previous matching trip-cover URL, including stored Mapbox tile | Queue in transaction; remove after commit | Durable retry on storage failure |
| External | Previous Unsplash, graphic, other scope/owner | Never queue that URL | — |
| Invalid | Unsafe/malformed image or photographer URL, foreign storage path, unknown body field | No write | 422 |
| Access | Viewer / stranger / role lost under lock | No mutation or cleanup | 403 / 404 |
| Replay | Same key/payload, including after later cover change | Original result; no write/effects/queue | Conflict for changed payload |
| Rollback | Update/queue/commit fails | Original cover/file retained; no effects | Mapped error |

</frozen-after-approval>

## Code Map

- `src/lib/api/contract/covers.ts` — client-safe endpoints; reuse URL policy, strict bodies, normalized UUIDs. Service validates storage ownership against trip params.
- `src/lib/services/covers.ts` — reuse `requireTripRole`, `lockTrip`, `runTripWrite`, `queueFileDeletions`, `removeQueuedFiles`, `parseOwnStorageUrl`; no new cleanup mechanism. Same URL with changed attribution must not delete current file.
- `src/app/api/v1/trips/[tripId]/cover/route.ts` — `apiRoute`, both `{ idempotent: {} }`.
- `src/app/(app)/trips/[tripId]/trip-detail-hero.tsx` — 355 lines; extract cover controls/state/dialogs; retain hero presentation.
- `src/components/arrivo/trip-cover-controls.tsx` — `"use client"`, `TripCoverControlsProps`; existing picker/dialog/menu and `useApiMutation`. Guard across PUT/DELETE, released on settled/auth loss. Preserve URL/Custom close behavior.
- Trip `actions.ts` — retire `setTripCoverWithAttribution`, `removeTripCover` and unused imports/helper; keep upload wrapper.

## Tasks & Acceptance

**Execution:**

- [ ] Tests first: `src/lib/api/contract/covers.test.ts`, `src/lib/services/covers.test.ts`, `src/app/api/v1/trips/[tripId]/cover/route.test.ts` — matrix, URL/graphic/stub compatibility, missing trip, lock-time current state/role, own-scope Mapbox cleanup, unchanged URL retention, rollback/after-commit ordering, failed cleanup retry, no-op and keyed replay/effects. Route tests prove actual 422/access mapping and replay forwarding.
- [ ] `src/components/arrivo/trip-cover-controls.test.tsx`, `src/app/(app)/trips/[tripId]/trip-detail-hero.test.tsx` — migrate cover cases; PUT/DELETE payload, success/error, refresh, pending duplicate guard, auth-loss recovery, viewer suppression, graphic/map/photo menus; retain hero presentation coverage.
- [ ] Implement after tests fail; both components below 250 lines. Remove retired cases in `src/app/(app)/trips/[tripId]/actions.test.ts`; search for dead symbols.
- [ ] `tests/e2e/features/api.feature`, `tests/e2e/steps/api-covers.steps.ts` — scenario-owned PUT/DELETE, invalid URLs, viewer/stranger/cross-site, keyed replay, stored cover removal after commit and rollback retention. Reuse mothers/materializers and existing API fixture conventions.
- [ ] `tests/e2e/features/trip-cover-overflow.feature`, `tests/e2e/steps/trip-cover-overflow.steps.ts` — select with attribution, reload and assert; remove, reload and assert graphic/menu state. Arm `waitForApiResponse` before PUT/DELETE gestures and await before returning; preserve upload cases. Run unchanged viewer-trip-access regression.
- [ ] `tests/e2e/feature-map.mjs` — register new files for API/cover/viewer; run map tests.

**Acceptance Criteria:**

- Given editor selecting an Unsplash cover, when reload completes, then selected image and photographer attribution persist.
- Given editor removing a photo or stored map cover, when reload completes, then graphic cover persists and remove/info actions disappear.
- Given migrated runtime, when searching definitions/imports, then neither retired action remains and cover writes use API.

## Implementation Notes

Plan-reviewer: scope, architecture, component, accessibility and tests PASS; zero blocking findings/warnings. Original request: build 3.5, preserving picker flows. Extraction resolves hero size; all covered files have named colocated tests and both writes have E2E coverage.

## Plan Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
| --- | --- | --- | --- |
| Dead `canEdit` branches in trip-cover-controls.tsx | low | patch | Early `return null` makes ternaries/guards unreachable; costs branch coverage. Removed. |
| Hover feedback lost on trigger | low | patch | Original had `hover:bg-black/45`; restored with `size-11`. |
| Photographer name unbounded or empty string | low | defer | Removed action had the same laxness; guard adds behavior. |
| Failed-PUT uploads orphaned; two cleanup paths | low | defer | Upload migration is entry 6 (Never list). |
| Generic error toast | false | reject | `useApiMutation` toasts server `error.message`; fallback only for non-API errors. |
| DELETE without body gets 400 | false | reject | Spec: DELETE takes `{}`; client sends it. |
| Persist-after-reload asserts DB only | false | reject | Attribution dialog step follows reload in same scenario. |
| Remove scenario lacks reload | false | reject | Scenario reloads and re-asserts menu. |
| Dropped validation tests | false | reject | Rules pinned in url-policy.test.ts and contract/service tests. |
| After-commit effects unasserted at service level | low | reject | Real `runTripWrite` effects covered by trip-write tests; fix adds tests only. |
| Storage-failure retry untested | low | reject | Behavior lives in shared `removeQueuedFiles`, already tested there. |
| Unbounded/duplicated validation, circular owner check | false | reject | Service enforces tripId ownership by design. |
| Own-storage URL existence check | maybe-false | reject | Pre-existing policy; would be low. |
| Photographer URL without name | low | reject | Pre-existing semantics; guard adds complexity. |
| `afterTripWrite` throwing skips cleanup | low | reject | Shared pattern across services; queued rows drain later. |
| Rollback E2E DDL/raw SQL | low | reject | Unique trigger/function names, `WHEN` scoped to one URL, server-generated value. |
| Missing DELETE viewer/401/conflict E2E | low | reject | Covered by unit/route tests; fix adds scenarios only. |
| Test shim `TripDetailHero`, dead mocks | low | reject | Dev-only naming; rename is churn. |
| Hero whitespace churn | low | reject | Cosmetic; reverting is churn. |
| Toast/style/refresh differences from intent audit | false | reject | Descriptive only; none violate intent. |

## Design Notes

Preserve CSS tokens, fonts, Lucide strokes, titled icons, 44px targets, Base UI keyboard opening/Escape/focus return and picker labels. Extraction addresses oversized hero. No redesign.

## Verification

- Named Vitest files and `node --test scripts/feature-map.test.mjs` pass before broad gate.
- Run focused cover API/UI Playwright scenarios first, including viewer controls regression.
- Parent invokes build-validator: lint/types/build, coverage alone, affected E2E alone. Next.js route docs inspected. No automatic full E2E.
