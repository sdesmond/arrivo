---
title: "Setup completion"
type: feature
ticket: 5
created: "2026-10-28"
status: done
baseline_revision: "96aed98ea7ff7fd3e9ca90148f766825755a42e2"
route: full
route_source: auto
risk: high
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context:
  - AGENTS.md
  - _bmad-output/initiative-self-hosted-administration/architecture-self-hosted-administration/architecture-self-hosted-administration.md
  - _bmad-output/initiative-self-hosted-administration/ux-self-hosted-administration/EXPERIENCE.md
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** The setup dialog is a stub: a recipient of a setup link cannot choose a name or password, so a pending account can never become usable.

**Approach:** Replace the stub body with a Name / Password / Confirm password form (username read-only). A server action revalidates the limited cookie, hashes the password, and in one `consumeCredentialAuthorization` transaction saves name and hash and consumes the link; it then clears the cookie, records Activity and signs in only that account.

## Boundaries & Constraints

**Always:** Password policy (resolves the ticket's open question): the existing rules shared by sign-up and profile change, minimum 8 characters, confirmation must match, bcrypt cost 10; centralise in `src/lib/password-policy.ts` with the sign-up messages. Name is required and trimmed. Completion runs only for a `ready` context from `resolveAccountSetupContext` (generic unavailable otherwise, no bcrypt before that), and the DB write is `update users set name, password_hash where id = ? and password_hash is null` inside the consume callback, so a concurrent or repeated completion yields one success and every other attempt the unavailable page. Link expiry is never extended; reopening before completion shows the same dialog. After commit: clear `arrivo_account_setup`, `recordActivity` (new type `setup_completed`, actor = the account), then `signIn("credentials", …)` with the just-chosen password, `keepSignedIn` true, `redirectTo` `/trips` (as `setupAdminAction`). If sign-in is refused after commit, redirect to `/sign-in`. Dialog keeps its non-dismissable shell; errors in `role="alert"`, focus the relevant field, safe input retained; all targets at least 44px.

**Never:** Regeneration, wrong-signed-in-account flow, delete, Add User changes, username editing. Do not touch `isInstanceSetupOpen`, `/setup`, `/sign-up`, `requireUser`, or the proxy. No token, URL or password in logs, Activity or errors. No change to the credential-authorization module.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Complete | Held cookie, name, matching 8+ char passwords | Name and hash saved, link consumed, signed in, lands on Trips | No error expected |
| Validation | Blank name, short or mismatched password | Inline error, input kept, link untouched | No DB write, no bcrypt |
| Resume | Dialog closed or reloaded before completing | Same dialog, original expiry | None |
| Dead link | Replaced, expired, consumed or deleted account | Redirect to unavailable page, cookie cleared | Generic, no account hint |
| Race | Two completions with one link | Exactly one succeeds | Loser sees unavailable |

</intent-contract>

## Code Map

- `src/lib/credential-authorizations.ts` -- `consumeCredentialAuthorization(db, {token, purpose}, complete, clock)`; reuse, do not change.
- `src/lib/account-setup-session.ts` -- `resolveAccountSetupContext`, `ACCOUNT_SETUP_COOKIE`, `clearedAccountSetupCookie`; reuse.
- `src/app/(auth)/actions.ts` -- `setupAdminAction` shows bcrypt, `signIn` and `recordActivity` pattern; switch its password checks to the shared policy.
- `src/app/(app)/admin/users/actions.ts` -- `recordActivity` after commit with identities only.
- `src/data/types.ts`, `src/lib/activity-labels.ts` -- `ActivityEventType`, `EVENT_LABELS` (Record over every type).
- `src/components/arrivo/account-setup-dialog.tsx` + `.test.tsx` -- stub to replace; `auth-forms.tsx` for field markup.
- `src/app/account-setup/page.tsx` -- unchanged; stale cookie hops via `/account-setup/open`.
- `tests/e2e/features/account-setup.feature`, `steps/account-setup.steps.ts`, `feature-map.mjs` -- extend; `e2e-db.ts` `withE2EDb`.

## Tasks & Acceptance

**Execution:**

- [ ] `src/lib/password-policy.ts` + `.test.ts` -- `PASSWORD_MIN_LENGTH`, `validateNewPassword(password, confirmation)` -- single shared policy
- [ ] `src/data/types.ts`, `src/lib/activity-labels.ts` + `.test.ts` (and `instance-activity.test.tsx` if it enumerates types) -- add `SetupCompleted: "setup_completed"`, label Accounts / "Completed account setup"
- [ ] `src/lib/account-setup-completion.ts` + `.test.ts` -- `completeAccountSetup(database, {token, name, passwordHash}, clock)` over `consumeCredentialAuthorization`; guarded update; maps any non-success to unavailable; tests incl. repeat and password-already-set
- [ ] `src/app/account-setup/actions.ts` + `actions.test.ts` -- `completeAccountSetupAction(prev, formData)`: validate, resolve context, hash, complete, clear cookie, Activity, sign in; redirect to `/account-setup` when unavailable
- [ ] `src/app/(auth)/actions.ts` -- use `validateNewPassword`; existing tests stay green, messages unchanged
- [ ] `src/components/arrivo/account-setup-dialog.tsx` + `.test.tsx` -- form, pending state, alert errors, no close button, Escape and backdrop ignored
- [ ] `tests/e2e/features/account-setup.feature`, `tests/e2e/steps/account-setup.steps.ts`, `tests/e2e/feature-map.mjs` -- scenarios per ACs; register `account-setup-completion.ts`, `password-policy.ts`, `actions.ts` under `account-setup`
- [ ] Run targeted Vitest and `npm run test:e2e:affected`; record in Implementation Notes. No build-validator here.

**Acceptance Criteria:**

- Given a held setup context, when valid Name and matching passwords are submitted, then the user lands on Trips signed in as that account only, and the same link cannot be used again.
- Given a half-finished setup, when the dialog is reloaded or reopened from the link, then it shows again and the link expiry is unchanged.
- Given a link replaced, expired or its account deleted, when the form is submitted, then nothing is saved and the unavailable page shows.
- Given two simultaneous completions of one link, then exactly one succeeds and the account has one name and hash.
- Given a completed setup, then Activity holds `setup_completed` with no token or password, and the user can sign in with the new password.

## Implementation Notes

## Plan Change Log

## Review Triage Log

### 2026-10-28 — Review pass

- verdicts: 5 findings — high 0, medium 1, low 1, false 0, maybe-false 0 (3 low-value rejected)
- findings:
  - `[medium]` `[patch]` Retryable consume conflict cleared the cookie and showed "unavailable" — fixed: `completeAccountSetup` returns `retry`, action returns an inline try-again error and keeps cookie/link.
  - `[low]` `[reject]` Blank name has no E2E row — covered by action unit test; E2E adds no new risk.
  - `[low]` `[reject]` Expired/deleted submit not E2E — dead-link path is the same code as the replaced case; consume states covered by story 1 tests.
  - `[low]` `[patch]` `aria-live="polite"` on role=alert — removed.
  - `[low]` `[reject]` Username not label-associated — static text, not a control; unlikely to matter.

## Design Notes

Validation runs before the DB or bcrypt so a bad form costs nothing; the guarded `password_hash is null` update plus the consume under the AD-2 lock make the race safe. Sign-in follows commit because Auth.js cannot join the transaction; a refused sign-in leaves a finished account and routes to `/sign-in`. Review pinned `authority-locking`.

## Verification

**Commands:**

- `npx vitest run src/lib/password-policy.test.ts src/lib/account-setup-completion.test.ts src/lib/activity-labels.test.ts src/app/account-setup "src/app/(auth)" src/components/arrivo/account-setup-dialog.test.tsx` -- expected: pass
- `npm run test:e2e:affected` -- expected: account-setup scenarios pass

## Auto Run Result

- Summary: setup dialog now completes account setup (name + password saved atomically, link consumed, Activity `setup_completed`, signed in as that account only).
- Files: shared `password-policy.ts`; `account-setup-completion.ts`; `src/app/account-setup/actions.ts`; dialog form; new activity type/label; E2E scenarios and feature-map entries; tests for each.
- Review: 2 patches applied, 0 deferred, 3 low rejected (reasons in triage log).
- Verification: targeted Vitest pass (84 + 35 after patch), tsc clean; affected E2E (ran full suite) 414 pass before patch; patch not re-run in E2E.
- Residual risk: retry-path patch covered by unit tests only. Profile changePassword wording left untouched.
