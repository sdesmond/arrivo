---
title: "Verify collaboration API end to end"
type: chore
ticket: "7"
created: "2026-11-18"
status: built
baseline_revision: "5dc2b2d18ede4c709ef4b6b7b1a893c31f0eca19"
route: full
route_source: auto
risk: high
review: 'thorough'
review_source: 'auto'
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 0
context: [_bmad-output/initiative-mobile-api/AGENTS.md]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Stories 4.1–4.6 migrated every sharing, invitation and leave flow, but epic completion needs integrated production-build evidence. `api.feature` has no anonymous 401 or cross-origin 403 case on the nine collaboration routes, no cached-replay denial after manager demotion for resend, rescind and dismiss, and no viewer/stranger denial matrix for those three.

**Approach:** Close those gaps tests first; audit S1–S8 and Done-when 1–3; run `api`, `trip-sharing`, `pending-invitations` and `leave-trip` under `next start` on `arrivo_e2e` following the pilot 1.10 procedure; fix only acceptance failures; run `build-validator` after targeted checks pass.

## Boundaries & Constraints

**Always:** Actual branch `story/4-7-verify-collaboration-api-e2e` from latest `feature/api-v1`; PR base `feature/api-v1`; return to `feature/api-v1` after an authorized PR. Scenario-owned mothers and materializers; cookie-free `apiClient` for anonymous calls; name colocated tests before any runtime fix; register new test files in `feature-map.mjs` under `api`. Record full canonical revisions.

**Never:** New capabilities, broad cleanup, findings not reproduced as acceptance failures, migrations, new environment variables, `CHANGELOG.md`, automatic full-suite E2E, ticket edits/mark/pull, unauthorized push or PR.

## I/O & Edge-Case Matrix

| Given | When | Then |
| --- | --- | --- |
| No session | Each collaboration route (2 GET, invite, batch, accept, decline, resend, rescind, dismiss, leave) is called | 401 `unauthenticated`; no row, membership or replay record changes |
| Signed in, foreign `Origin` | Each write route is called | 403 `forbidden`; state unchanged |
| Successful keyed resend, rescind or dismiss | Demote caller to editor/viewer or remove membership; replay exact request | 403 `forbidden` / 404 `not_found`; no cached success; invitation unchanged |
| Viewer or stranger | Calls resend, rescind or dismiss on a pending invitation | 403 / 404; invitation unchanged |
| Production server | Share dialog, pending invitations, leave flows and API features run | All pass and persist after reload |

</frozen-after-approval>

## Code Map

- `tests/e2e/features/api.feature` (sharing from ~1990; lifecycle ~2229; leave ~2266): add scenarios after line 2328. Reuse the "Sharing API cached replay rechecks current manager access" pattern (line 2023) and `my checklist API role is "<role>"`.
- `tests/e2e/steps/api-invitation-lifecycle.steps.ts` (`state`, request builder lines 56–74), `api-invitation-decisions.steps.ts`, `api-contributor-batch.steps.ts`, `api-leave-trip.steps.ts`, `api.steps.ts` (sharing helpers ~3469; `sendSharing`): copy header/path building. `tests/e2e/anonymous-api.ts` (`markAnonymousApiRole`, `apiClient`) for 401; `api.steps.ts:135` anonymous role.
- `src/lib/api/{route,endpoint,idempotency}.ts`, `src/lib/services/sharing.ts`, `src/lib/api/contract/sharing.ts`, nine `src/app/api/v1/{invitations,trips/*/invitations,trips/*/collaborators,users/invitable}/**/route.ts`: evidence for S1–S8; fix sites only if a row fails.
- `tests/e2e/feature-map.mjs` (api entry ~68–79; trip-sharing ~520; pending-invitations ~700): register any new steps file.
- Retired names (recovered at `4cb7de67`): `listInvitableUsers`, `inviteContributor`, `acceptInvitation`, `declineInvitation`, `rescindInvitation`, `dismissInvitation`, `saveContributorChanges`, `leaveTrip` (trips/actions.ts); `getShareDialogData`, `resendShareInvitation`, `rescindShareInvitation`, `dismissShareInvitation`, `saveContributorChanges` (trips/[tripId]/actions.ts). 4.6 audit found none left as action exports; remaining same-named hits are `services/sharing.ts` and contract exports.
- Pilot `epic-checklist-api-pilot/story-verify-checklist-pilot-end-to-end-plan.md` and `epic-documents-covers-api/story-verify-documents-and-covers-end-to-end-plan.md`: production-run procedure (`NEXT_DISTDIR=.next-prod`, `next start -p 3001`, `scripts/run-e2e.mjs --server=reuse --grep`).

## Tasks & Acceptance

**Execution:**

- [ ] `tests/e2e/features/api.feature` then new `tests/e2e/steps/api-collaboration-guards.steps.ts` -- outline per route: anonymous 401 and cross-origin 403 with unchanged snapshots -- fill rows one and two
- [ ] Same files -- cached replay denial after demotion for keyed resend/rescind/dismiss; viewer/stranger denial matrix -- fill rows three and four
- [ ] `tests/e2e/feature-map.mjs` -- register the new steps file under `api`; run `scripts/feature-map.test.mjs`
- [ ] This plan -- evidence map S1–S8 and Done-when 1–3; enumerate retired actions via `git grep -w` over `src`, `tests`, `scripts` and confirm zero action callers
- [ ] Production run -- `NEXT_DISTDIR=.next-prod npm run build`; `next start -p 3001` on `arrivo_e2e` with `AUTH_TRUST_HOST=true`; run `--server=reuse` over `@feat:api|trip-sharing|pending-invitations|leave-trip`; record counts; fix failures tests first; stop server; remove `.next-prod`
- [ ] Invoke `build-validator` after targeted checks pass: lint/types/build, coverage alone, affected E2E alone

**Acceptance Criteria:**

- Given an unauthenticated caller, when any collaboration route is called, then 401 and nothing changes.
- Given a cross-origin write, when sent with a valid session, then 403 and nothing changes.
- Given a successful keyed lifecycle write, when manager access is lost, then the exact retry denies without cached payload or change.
- Given the production build on `arrivo_e2e`, when the four features run, then they pass and prove Done-when 1–3 with no migration or environment variable.
- Given the final tree, when the audit runs, then retired-action callers number zero and every validation gate passes.

## Implementation Notes

Branch `story/4-7-verify-collaboration-api-e2e` (pre-existing at `5dc2b2d18ede4c709ef4b6b7b1a893c31f0eca19`, the latest `feature/api-v1`); PR base `feature/api-v1`. No runtime fix was needed: every new scenario passed against existing code.

Tests added (tests first, no production change): `tests/e2e/features/api.feature` (tag `@collaboration-guards-api`, after the leave scenarios) and `tests/e2e/steps/api-collaboration-guards.steps.ts`, registered under `api` in `tests/e2e/feature-map.mjs`.

- Anonymous 401 on all ten operations (2 GET, invite, batch, accept, decline, resend, rescind, dismiss, leave), snapshot of invitations, collaborators and replay rows unchanged (10 scenarios).
- Cross-origin 403 `forbidden` on the eight writes with a valid session, state unchanged (8).
- Keyed resend, rescind (pending) and dismiss (declined) succeed, caller demoted to editor/viewer or removed, exact retry returns 403/403/404 with the invitation and replay row unchanged (9).
- Viewer 403 / stranger 404 on resend, rescind, dismiss, invitation unchanged (6).

Evidence map (epic S1-S8 and Done-when 1-3):

- S1 `GET /trips/:id/collaborators`, `GET /users/invitable`: `trip-sharing` "manager sharing API and picker", `api.feature` sharing-api; anonymous 401 added here.
- S2 invite: `api.feature` sharing-api scenarios (picker exclusions, role validation, expiry, replay); cross-origin 403 and anonymous 401 added here.
- S3 resend/rescind/dismiss: invitation-lifecycle-api scenarios; replay denial and viewer/stranger matrix added here.
- S4 accept/decline: invitation-decisions scenarios plus `pending-invitations.feature`.
- S5 batch: contributor-batch scenarios (limit 50, duplicates, stale `fromRole`, creator, self); 401/403 origin added here.
- S6 leave: `leave-trip-api` scenarios and `leave-trip.feature`; 401/403 origin added here.
- S7 transactional auth, lock order, live events: `src/lib/services/sharing.ts` and `trip-sharing`/`leave-trip` live-refresh scenarios.
- S8 retired actions: `git grep -w` over `src`, `tests`, `scripts` for `listInvitableUsers`, `inviteContributor`, `acceptInvitation`, `declineInvitation`, `rescindInvitation`, `dismissInvitation`, `saveContributorChanges`, `leaveTrip`, `getShareDialogData`, `resendShareInvitation`, `rescindShareInvitation`, `dismissShareInvitation`. Every remaining hit is a contract/service export, a route file, a client `api(contract...)` call, or a comment. Zero server-action callers and zero action exports.
- Done-when 1-3: production run below; no migration, no new environment variable.

Production run: `NEXT_DISTDIR=.next-prod npm run build` (pass); `next start -p 3001` on `arrivo_e2e` with `AUTH_TRUST_HOST=true`, `STORAGE_LOCAL_ROOT_DIR=.e2e-storage`; `/api/v1/meta` 200. A first run used a different storage root and 33 document-storage scenarios failed (launcher mismatch, not a product defect); after restarting with the harness storage root, `node scripts/run-e2e.mjs --server=reuse "--grep=@feat:api|@feat:trip-sharing|@feat:pending-invitations|@feat:leave-trip"`: 633 passed, 0 failed (8.6m). Server stopped, `.next-prod` removed.

## Plan Change Log

## Review Triage Log

| Lens | Finding | Verdict | Route | Evidence |
| --- | --- | --- | --- | --- |
| blind | `And` role step after `When` may not resolve (Given-registered) | false | rejected | Replay scenarios (9 rows) ran and passed in the production run with this exact ordering. |
| blind | No fresh-call coverage for invite/batch/collaborators/invitable/editor/accept/decline/leave variants | low | rejected | Intent limits the matrix to resend/rescind/dismiss; fix is new scenarios, not a correction. |
| blind | Replay not covered for invite/batch; no differing-body replay | low | rejected | Intent names resend, rescind, dismiss only. |
| blind | No same-origin/absent-Origin positive control | false | rejected | Every replay scenario's first keyed write succeeds (200) through the same guard with the page origin. |
| blind | Weak assertions (status + code only) | low | rejected | Matches the plan's matrix; envelope shape is covered by existing contract tests. |
| blind | `Date.now()`, unvalidated state/role strings, non-null assertions | low | rejected | Fixture-only; a typo fails the scenario loudly; no named harm. |
| blind | Snapshot flakiness / `like '%key%'` ignores user scope | low | rejected | Key is a per-scenario UUID; 33 scenarios stable across two runs. |
| edge | `page.url()` could be `about:blank` | false | rejected | `apiClient`/page is navigated by the shared fixtures; all scenarios passed. |
| edge | Unvalidated operation/state strings | low | rejected | Same as blind fixture finding. |
| edge | Role step could match zero rows | false | rejected | A silent no-op leaves the caller a manager, so the 403/404 assertion would fail, not pass. |
| edge | Dismiss only tested on declined, not pending (x2) | false | rejected | `dismissInvitationInTransaction` deletes only `status <> 'pending'`; declined is the only dismissible state. |
| edge | Replay omits accept/decline/invite/batch/leave | low | rejected | Intent scope, as above. |
| edge | Origin variants (null, port, absent) | low | rejected | New coverage beyond the intent's gap list. |
| edge | Replay snapshot filtered by key only | low | rejected | See blind snapshot row. |
| edge | First keyed request asserted exactly 200 | false | rejected | Routes return 200; scenarios passed. |
| intent | 9 vs 10 routes; replay baseline taken after demotion | none | n/a | Descriptive. Plan table lists ten operations; re-baselining is required because demotion legitimately changes the collaborator row. |
| gap | No gaps found | none | n/a | Pre-verified by lens. |

No patch, defer, or loopback entries.

## Verification

**Commands:**

- `npx vitest run src/lib/services/sharing.test.ts src/lib/api src/app/api/v1 scripts/feature-map.test.mjs` -- expected: pass
- `node scripts/run-e2e.mjs --server=kill "--grep=<new scenario names>"` -- expected: new cases pass
- Production run above -- expected: all selected scenarios pass
- `build-validator` -- expected: PASS
