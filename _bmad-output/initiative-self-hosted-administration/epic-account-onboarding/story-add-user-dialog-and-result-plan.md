---
title: "Add User dialog and result"
type: feature
ticket: 4
created: "2026-10-28"
status: done
baseline_revision: "c439312b822c0dc59a8db04a9f80107ec0f05a7d"
route: full
route_source: auto
risk: medium
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context: [AGENTS.md]
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Admins have an Add User action but no UI to create accounts and share their setup links.

**Approach:** Add a Users section action opening one dialog that moves from username entry through creation to a one-time share result. Reconcile rejected requests against current account state before allowing another submission.

## Boundaries & Constraints

**Always:** Reuse existing `addUserAction`, username normalization/validation, shared Base UI Dialog, FieldGroup/Field, Input and Button. Every server reconciliation request calls `requireAdmin`. Keep setup URL only in dialog memory; clear on close, never persist/log it or include in Activity. Show selectable plain wrapping URL, Copy icon (strokeWidth 1.5, title and aria-label Copy link, 44px target), account identity and local-time expiry. Focus result heading; label Username and associate inline errors. Use theme tokens, client directive and explicit AddUserDialogProps interface. Keep dialog under 250 lines, keyboard open/dismiss with focus return, block dismissal during active creation/checking. Preserve framework control-flow errors with unstable_rethrow.

**Never:** Regenerate links, complete setup, alter schema or bootstrap, expose stored token, add email, auto-retry creation, or infer success from optimistic rows. Existing accounts during reconciliation prove only existence, not which request created them.

## I/O & Edge-Case Matrix

| Scenario | State | Visible outcome | Handling |
| --- | --- | --- | --- |
| Success | Valid free username | Creating… then Account created. Share this setup link.; username, expiry, selectable URL | Refresh Users; focus heading |
| Invalid/taken | Local invalid or action refusal | Associated inline username error, no duplicate | Keep form editable |
| Refused | Origin unavailable, retry, forbidden, unavailable instance | Safe inline error; actionable configured-origin message where supplied | Refresh on lost authority |
| Unknown | Creation rejects | Checking…; no create while checking | Authoritative admin read by normalized username |
| Found | Account exists after unknown result | Account exists; link unavailable, review Users | No resubmit for this name; never recover token |
| Absent | No account found | Explicit retry available | Unique service remains concurrency backstop |
| Check fails | Reconciliation rejects | Uncertain result with Check again | Never enable create until successful check |
| Copy fails | Clipboard absent/rejects | Selectable URL retained plus copy error | Manual selection fallback |
| Close/reopen | Result closed | URL absent; new blank form | Clear secret state on every permitted close |

</intent-contract>

## Code Map

- `src/app/(app)/admin/users/page.tsx` (26 lines): place AddUserDialog next to Users heading; preserve server auth/list fetching.
- `src/app/(app)/admin/users/actions.ts` (59 lines): existing addUserAction returns AddUserResult. Add `checkAddedUserAction(username)` returning boolean via `listInstanceUsers` after requireAdmin and normalization; contains no credential retrieval or mutations.
- `src/lib/instance-users.ts`: reuse existing safe summaries for reconciliation; no production changes required.
- `src/lib/username.ts`: normalizeUsername/validateUsername; keep policy unchanged.
- `src/components/arrivo/change-role-dialog.tsx`: Base UI trigger/render, transition and framework error pattern. `src/components/ui/{dialog,field,input,button}.tsx`: installed primitives.
- `tests/e2e/scenario-fixture.ts`: scenario.uniqueUsername, registerCleanup and materialize mothers. `tests/e2e/server-action.ts`: arm POST response before mutating gesture.

## Tasks & Acceptance

**Execution:**

- [x] First author `src/components/arrivo/add-user-dialog.test.tsx` covering matrix, heading focus, busy dismissal, copy success/failure, forbidden/framework signals, reconciliation found/absent/failure and no repeat create, close/reopen; expand `src/app/(app)/admin/users/actions.test.ts` for authorized normalized reconciliation and denied reads.
- [x] Create `tests/e2e/features/add-user-dialog.feature` and `tests/e2e/steps/add-user-dialog.steps.ts`: real creation and pending row persistence, invalid/taken username, desktop/mobile result and close/reopen, response-loss reconciliation before retry. Register scenario-created accounts for cleanup; no credential values in assertions/output. For response-loss use transport interception after actual POST commits and delay reconciliation to observe Checking state.
- [x] Add `src/components/arrivo/add-user-dialog.tsx`: implement matrix with local state; use ref/effect for result-heading focus, transition for async work, inline persistent feedback, copy status. Distinguish found account from confirmed creation. Clear result on close.
- [x] Update `src/app/(app)/admin/users/actions.ts` and `page.tsx` as mapped above. Guard read on every request, never expose credentials in reconciliation.
- [x] Update `tests/e2e/feature-map.mjs`: map dialog/page/actions to new feature, keeping existing feature mappings.
- [x] Run targeted Vitest and new feature E2E before handing completed code to parent. Parent owns build-validator after review. Workflow finalization commits reviewed changes; never push.

**Acceptance Criteria:**

- Given an admin on Users, when a valid free username is submitted, then one pending account appears and the same dialog shows its setup link, local expiry and focused result heading.
- Given invalid or taken usernames, when submitted, then associated errors appear without creating another account.
- Given a creation response is lost, when checking current state, then Checking disables resubmission and only an authoritative absence allows retry; an existing account exposes no recovered URL.
- Given a setup result, when copied or closed/reopened on desktop/mobile, then copy failure leaves selectable URL and closing removes URL from the reopened dialog and Users.

## Implementation Notes

Route full: estimated 200 component lines plus action, integration and tests exceeds 100 lines. Prior blocker was sandbox Git access; approved execution passed and approved ticket branch was created.

- Implemented dialog, guarded normalized existence action, Users heading trigger, colocated component/action tests, four BDD scenarios and feature mappings. Existing Section/Field primitives reused (Section imported as FieldGroup).
- Targeted Vitest: 43 tests passed after review patch. New browser scenarios: 4 passed plus auth setup, exit 0. New dialog coverage before patch: 100% lines/functions, 97.29% branches. ESLint and TypeScript passed in implementation verification.
- Browser scenarios exercise desktop/mobile result, pending row after reload, invalid/taken usernames, and a lost real POST response followed by delayed authoritative reconciliation. Matrix rows all have passing targeted tests.

## Plan Change Log

## Review Triage Log

### 2026-10-28 — Review pass

- verdicts: 1 finding — high 0, medium 1, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` Closing/reopening after failed reconciliation reset uncertain state and enabled create without authoritative absence. Verified changeOpen reset phase unconditionally. Fixed by retaining uncertain username/phase across close/reopen while clearing secret state; Cancel and Escape regression cases pass. Small direct correction to demonstrated existing state, no public surface added.

## Design Notes

Read-only reconciliation returns existence, never token. An absent read cannot prove an earlier request will never finish; username uniqueness and existing transactional duplicate refusal prevent a second account if a delayed request wins. Existing-account feedback avoids claiming this request created it.

## Verification

- `npx vitest run src/components/arrivo/add-user-dialog.test.tsx "src/app/(app)/admin/users/actions.test.ts"` — all matrix cases pass.
- `npx bddgen` then targeted Playwright `@feat:add-user-dialog` — new flow scenarios pass.
- Parent `build-validator` — lint, types, coverage, affected E2E and isolated build pass.


## Plan Review

Original request: ticket 3.4, Add User dialog and result, including uncertain creation reconciliation and one-time setup URL.

SCOPE: PASS — all tasks implement ticket behavior; regeneration remains out of scope.
ARCHITECTURE: PASS — existing service reused; reconciliation is authorized read without credential retrieval; client state stays local.
COMPONENT: PASS — page 26 lines, actions 59 lines; dialog planned below 250 with explicit props interface and client directive; installed primitives reused.
ACCESSIBILITY: PASS — label/error association, keyboard dismissal/focus return, heading focus, 44px targets, named copy icon and theme tokens specified.
TEST COVERAGE: PASS — dialog colocated tests, action tests, feature and step definitions cover each new surface; no covered existing library changes.
TOTAL: 0 BLOCKING | 0 WARNINGS.
## Auto Run Result

- Summary: Users now opens an Add User dialog with normalized username validation, Creating state, focused one-time setup-link result, local expiry, copy/manual-selection fallback and secret clearing on close. Lost creation responses reconcile authoritative account existence before retry; uncertain state survives Cancel/Escape and reopen.
- Files: `src/components/arrivo/add-user-dialog.tsx` adds UI; colocated `.test.tsx` covers matrix and review regression. `src/app/(app)/admin/users/actions.ts` adds guarded existence read; `actions.test.ts` tests authorization/normalization/failures; `page.tsx` adds section action. `tests/e2e/features/add-user-dialog.feature` and matching steps add four real browser scenarios; `tests/e2e/feature-map.mjs` registers source paths. This plan records scope and evidence.
- Review: quick lens, one medium patch applied; zero deferred/rejected findings. Patch preserves uncertain state across close/reopen and adds Cancel/Escape regressions. Patched counts: high 0, medium 1, low 0. Follow-up review recommended: false.
- Verification: targeted component/action Vitest 43 passed; full coverage 322 files / 5,134 tests passed, lines 97.24%, functions 96.89%, branches 92.26%. Initial coverage exposed premature enablement assertions in two refusal tests; fixed with waitFor and rerun passed. ESLint and TypeScript passed; final test-only patch also linted. Isolated `.next-validate` production build passed, 15 static pages generated.
- E2E: new feature 4 scenarios plus auth setup passed in targeted run and all four passed again in affected run. `npm run test:e2e:affected` selected full scope because feature-map changed: 401 passed, 7 existing scenarios failed. Native last-failed rerun passed four but retained Activity history and produced duplicate-identity options in three. Repository runner with grep and fresh database reset passed all seven plus auth setup (8/8, exit 0). No runtime code changed for these failures.
- Residual risks: broad E2E run exhibited transient existing failures in dashboard live sync, Activity, map and MFA; all passed clean targeted rerun. No unresolved ticket-specific failure. No schema, bootstrap or regeneration changes.
