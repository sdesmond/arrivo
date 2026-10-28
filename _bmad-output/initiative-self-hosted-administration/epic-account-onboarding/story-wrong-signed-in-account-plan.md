---
title: "Wrong signed-in account"
type: feature
ticket: 8
created: "2026-10-28"
status: built
baseline_revision: "6780010ad11e9708f723ac620103aa6f49c6dd1f"
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

**Problem:** Opening another account's setup link currently exposes its setup form to a signed-in user and permits silently switching accounts on completion.

**Approach:** Require explicit “Sign out and continue” before showing that form, retaining the setup cookie across sign-out and resolving it again after redirect. Guard the completion action independently.

## Boundaries & Constraints

**Always:** Validate setup context before exposing identity or offering sign-out. Compare authenticated account ID to setup account ID on page and completion action; another signed-in account redirects to setup before hashing or writing. Preserve the setup cookie and original expiry through sign-out. Explicit POST action uses Auth.js signOut with redirect false, then redirects to query-free `/account-setup`, whose page revalidates the cookie. Invalidated context before confirmation redirects through existing unavailable cleanup without signing out. Invalidation during sign-out is caught by the destination page. Sign-out failure returns an actionable alert with retry, retaining context. Successful sign-out records existing SignOut Activity with identities only, following existing auth action semantics. No raw tokens in props, form fields, redirects, logs, or Activity.

**Never:** Change schema, authorization service, proxy, first-run setup, Add User, or ordinary sign-out behavior. Never automatically sign out on GET or silently switch accounts. Do not run full E2E suite.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Other account | Valid link and other authenticated account | Sign-out prompt, no password dialog; existing session stays active | Explicit POST only |
| Continue | Valid held context and explicit confirmation | Session cleared, original setup dialog opens | Cookie and expiry retained |
| Stale context | Replaced, expired or deleted link before/during confirmation | Generic unavailable page, no setup form or credential write | Existing cookie cleanup |
| Sign-out failure | Auth.js rejects sign-out | Alert and retry control | No successful logout event |
| Direct submit | Another account invokes completion action | Return to prompt before bcrypt/DB mutation | Keep setup cookie |

</intent-contract>

## Code Map

- `src/app/account-setup/page.tsx` — Server Component resolves context; add auth-ID comparison before rendering dialog. Existing stale-cookie redirect through `/account-setup/open` remains.
- `src/app/account-setup/actions.ts` — completion action; add auth guard and dedicated sign-out/continue action. Reuse existing unavailable/clearSetupCookie helpers and currentIdentity/Activity pattern from auth actions.
- `src/lib/account-setup-session.ts` — existing resolver and cookie definitions; reuse unchanged. Context contains `account.userId`.
- `src/components/arrivo/auth-submit-button.tsx` — existing pending submit control; reuse for new sign-out prompt.
- `src/data/types.ts` — reuse existing action-state type if suitable; any new domain action state belongs here.
- `tests/e2e/steps/account-setup.steps.ts` — scenario-owned pending link and invalidation helpers; use `scenario.signIn(page)` for a separate completed account after creating the pending link.
- `tests/e2e/feature-map.mjs` — account-setup route glob already mapped; add new domain component explicitly.

## Tasks & Acceptance

**Execution:**

- [x] Tests first: extend `src/app/account-setup/actions.test.ts` for mismatch blocking, anonymous completion, explicit logout, missing/invalid context, preserved cookie, logout failure, Activity, and redirect rethrow. Add `src/app/account-setup/page.test.tsx` for anonymous/same-account dialog, mismatch prompt and stale context.
- [x] Add `src/components/arrivo/account-setup-sign-out.test.tsx` for prompt copy, submit, pending and accessible error/retry. Add corresponding `account-setup-sign-out.tsx` client component with explicit `AccountSetupSignOutProps` interface, useActionState and AuthSubmitButton. Reuse existing action state or add minimal domain state in `src/data/types.ts`. Heading h1, no dialog while signed in, semantic error color and role alert, all targets >=44px, keyboard form submission supported.
- [x] Update `src/app/account-setup/actions.ts` and `page.tsx` per boundaries. Keep each file under 250 lines; no new shared utilities.
- [x] Extend `tests/e2e/features/account-setup.feature` and `tests/e2e/steps/account-setup.steps.ts`: wrong account sees prompt while session works, explicit sign-out reaches pending dialog with no regular session and original expiry; replaced/expired/deleted held links refuse setup after confirmation; signed-in opening of already invalid link stays generic. Arm/await `waitForServerActionResponse` for sign-out POST. Use scenario-owned completed user and pending fixture; never mutate baseline account.
- [x] Update `tests/e2e/feature-map.mjs` for new component. Run targeted Vitest and affected E2E before validator.

**Acceptance Criteria:**

- Given another signed-in account and a valid setup link, when opened, then “Sign out to continue setup.” and “Sign out and continue” appear, the setup form is absent and current session still accesses Trips.
- Given that prompt, when explicitly confirmed, then the current session ends and the pending account's setup dialog appears with original link expiry and no token in address.
- Given a held prompt whose link is replaced, expired or account deleted, when confirmed, then generic unavailable state appears with no credential change.
- Given a signed-in other account, when completion action is submitted directly, then no password is hashed, credentials changed or account silently switched.

## Implementation Notes

Tests-first implementation: initial expanded suites failed for missing behavior; 39 targeted tests now pass. Added page/action guards, sign-out prompt, preserved cookie and canonical SignOut Activity. Existing concurrent-completion browsers now explicitly start without inherited sessions. Added optional expectedStatus to existing action-response helper for successful 303 redirects, default 2xx behavior unchanged. No domain types changed.

Matrix audit: Other account and Continue covered by page/action/component tests and explicit sign-out E2E; Stale context by unavailable tests and replaced/expired/deleted E2E; Sign-out failure by action/component retry tests; Direct submit by mismatch completion test. All covering tests ran and passed.

Route full: expected >100 lines including tests across multiple files. Branch `ticket/wrong-signed-in-account` from epic integration branch.

## Plan Change Log

## Review Triage Log

### 2026-10-28 — Review pass

- verdicts: 1 findings — high 0, medium 0, low 1, false 0, maybe-false 0
- findings:
  - [low] [patch] Helper tests were outside their source directory, violating test colocation — moved to tests/e2e/server-action.test.ts and registered exact Vitest inclusion; three regression tests pass. No items deferred or rejected. Patched counts: high 0, medium 0, low 1.

## Design Notes

Keep token solely in existing HttpOnly cookie; Auth.js signOut only clears its own cookies. Redirect after logout revalidates database state rather than trusting pre-logout validation. Completion guard protects stale forms independently of page UI.

## Verification

- `npx vitest run src/app/account-setup src/components/arrivo/account-setup-sign-out.test.tsx` — all targeted cases pass.
- `npm run test:e2e:affected` — affected account-setup feature passes.
- Root invokes build-validator after implementation/review patches and targeted checks pass.


## Plan Review

Original request: build ticket 3.8, explicit sign-out before another account's setup and link revalidation.

SCOPE PASS: all items address requested account switch flow; no issues found.
ARCHITECTURE PASS: server authority checks and existing resolver reused; no issues found.
COMPONENT PASS: actions 79 lines, page 28 lines; new small domain client has explicit props interface and reuses submit control; no issues found.
ACCESSIBILITY PASS: heading, keyboard submit, 44px control and alert planned; no issues found.
TEST COVERAGE PASS: new domain component has colocated test; route/action and feature/step cases identified; no issues found.

TOTAL: 0 BLOCKING | 0 WARNINGS.

## Auto Run Result

- Status: built. Wrong signed-in account must explicitly sign out before setup; cookie and original expiry persist and destination revalidates current authorization. Direct completion action blocks another signed-in account.
- Files: account-setup actions/page add server guards and explicit logout; new account-setup-sign-out component provides prompt, pending and retry alert; colocated action/page/component tests cover branches; account-setup feature/steps cover valid and invalidated flows; feature-map registers component; existing server-action helper accepts opt-in expected redirect status, with colocated test and Vitest registration.
- Review: quick lens, one low patch (test placement); zero medium/high patches, zero deferred or rejected findings. Follow-up review recommended: false.
- Verification: 39 targeted unit/component/helper tests pass. Full validator: ESLint and TypeScript pass, 332 test files / 5263 tests pass; lines 97.27%, functions 96.94%, branches 92.4%; production build passes. Affected account-setup E2E: 28 pass. Full E2E not run: feature-map/config edits trigger full fallback, so explicit --grep=@feat:account-setup preserves repository's agent subset rule.
- Residual risks: broader E2E suite remains user-initiated. No migration or operator configuration required.
