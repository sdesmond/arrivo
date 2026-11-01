---
title: "CLI recovery completion and cutover"
type: "feature"
ticket: 5
created: "2026-10-29"
status: done
baseline_revision: "c0d93b1f865554f70c8603c04dfeafc6c83a3b20"
route: "full"
route_source: "auto"
risk: "high"
review: "thorough"
review_source: "pinned"
lenses_ran: ["blind-hunter", "edge-case-hunter", "verification-gap", "intent-alignment"]
review_loop_iteration: 0
context: ["_bmad-output/initiative-self-hosted-administration/architecture-self-hosted-administration/architecture-self-hosted-administration.md"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** CLI-issued recovery links (4.4) cannot be completed, and the shipped `mfa-reset` command still clears MFA immediately without recovering anything.

**Approach:** Add an isolated `/account-recovery` browser flow that, under account lock, atomically replaces password and MFA from a verified authorization-scoped secret, then shows new recovery codes once. Package an issuance CLI and delete `mfa-reset` and its docs (CAP-7, AD-5, AD-6).

## Boundaries & Constraints

**Always:** Mirror the reset flow's token exchange: scrub token, `no-store`, `no-referrer`, HttpOnly path-scoped cookie, CSRF, throttling, generic unavailable state. Pending TOTP secret is encrypted and stored on the recovery authorization, never `users.totp_pending_secret`. Completion verifies the code, rechecks completed-admin authority and authorization under account lock, then in one transaction replaces password, TOTP secret and recovery codes, bumps `session_version`, deletes trusted devices, and invalidates sibling reset/recovery authorizations. Return to fresh sign-in; no auto sign-in. Codes are shown once with acknowledgment; revocation does not wait for it. Activity is a best-effort `AdminRecoveryCompleted` after commit, secret-free. CLI needs only `DATABASE_URL`, owns and closes one connection.

**Never:** Change credentials, sessions or devices on issuance, open or abandoned/expired attempts. Keep `mfa-reset` or any immediate-clear command. Edit applied migrations or `CHANGELOG.md`. Persist or log tokens, secrets or codes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Complete | Valid context, matching new password, valid TOTP of pending secret | Credentials replaced, codes shown once, all sessions/devices/sibling links revoked | Activity failure ignored |
| Abandon | Link opened or expired, no submit | Credentials, MFA, sessions unchanged | Generic unavailable |
| Bad input | Weak password, wrong code, bad CSRF, throttled | Nothing changes; pending secret kept | Accessible field error |
| Stale | Replaced or competing link, consumed, demoted/deleted admin | Refused, no detail | Generic unavailable |
| Race | Two completions or other credential change | One commits | Loser unavailable/retry |

</frozen-after-approval>

## Code Map

- `src/lib/password-reset.ts`, `src/lib/password-reset-session.ts`, `src/app/account-reset/**` -- template; context is hard-wired to Reset, so add parallel recovery modules.
- `src/lib/credential-authorizations.ts` -- `consumeCredentialAuthorization` locks, rechecks, invalidates reset/recovery siblings; reuse. `validateCredentialAuthorization` for context.
- `src/db/schema.ts` + `drizzle/` -- add nullable encrypted `pending_totp_secret` on `credential_authorizations`; `npm run db:generate`.
- `src/app/(app)/profile/security-actions.ts` (`startMfaEnrollment`), `src/lib/mfa.ts`, `src/lib/mfa-store.ts` (`replaceRecoveryCodes`), `mfa-enrollment.tsx`, `recovery-codes-dialog.tsx` -- reuse TOTP/QR/code primitives and dialog; do not alter profile behavior.
- `src/proxy.ts` (PUBLIC_PATHS, headers) -- add `/account-recovery`.
- `src/lib/admin-recovery-issuance.ts`, `src/db/mfa-reset-cli.ts`, `src/db/migrate-cli.ts`, `Dockerfile`, `scripts/docker-config.test.mjs`, `docs/self-hosting.md` -- CLI model, packaging, removal targets.
- `src/data/types.ts`, `src/lib/activity-labels.ts` -- add event/label.
- `tests/e2e/feature-map.mjs`, `credential-authorization-fixture.ts` -- register and extend.

## Tasks & Acceptance

**Execution:**

- [ ] `src/lib/admin-recovery-completion.test.ts`, `src/lib/admin-recovery-session.test.ts`, `src/app/account-recovery/**/*.test.ts(x)`, `src/db/admin-recovery-cli.test.ts`, `src/proxy.test.ts`, `src/lib/activity-labels.test.ts`, `scripts/docker-config.test.mjs` -- tests first for matrix, rollback, races, CLI args/close and packaging.
- [ ] `src/db/schema.ts`, `drizzle/` -- add pending-secret column and generated migration.
- [ ] `src/lib/admin-recovery-completion.ts`, `src/lib/admin-recovery-session.ts`, `src/data/types.ts` (all new result/input types and the event live here), `src/lib/activity-labels.ts` -- start/verify pending secret, atomic completion via consume, context resolution with throttling.
- [ ] `src/app/account-recovery/**`, `src/proxy.ts` -- open route, page, form (password + QR/code), codes step with Copy/Download/acknowledge then `/sign-in`; client components get `"use client"` and explicit `…Props` interfaces; labeled fields, errors as text with `role="alert"`, QR `alt` text plus copyable secret, 44px targets, theme tokens only. Focus moves to the codes heading on success and to the first invalid field on error; acknowledge button is keyboard-reachable; Escape is not a dismissal path for the codes step.
- [ ] `src/db/admin-recovery-cli.ts`, `Dockerfile`, `docs/self-hosting.md` -- CLI over own `postgres(max:1)` calling `issueAdminRecovery`; bundle `dist/admin-recovery.mjs`; document usage.
- [ ] Delete `src/db/mfa-reset*.ts`, its Dockerfile lines and doc references (self-hosting lines ~98-100, ~160).
- [ ] `tests/e2e/features/admin-recovery-completion.feature`, steps, fixture, `feature-map.mjs` -- scenarios: complete with codes and fresh sign-in, abandoned/expired unchanged, replaced/competing contexts refused, operator Activity; old command absent.

**Acceptance Criteria:**

- Given a valid recovery link, when new password and correct replacement code are submitted, then old password, MFA, sessions, devices and sibling links stop working and new codes show once before fresh sign-in.
- Given abandoned, expired, replaced or competing contexts, when used, then credentials stay unchanged and no detail is revealed.
- Given the built image, when the operator runs the CLI, then it prints a link, and no `mfa-reset` file, command or doc remains.

## Implementation Notes

## Plan Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
| --- | --- | --- | --- |
| MFA throttle `mfa:<userId>` not cleared on completion | medium | patch | Deleted `mfa-reset.ts` line 17 cleared it; admin throttled at MFA sign-in stays locked after recovery. |
| `pending_totp_secret` persists after consume | low | patch | Encrypted copy of live TOTP secret stays on consumed row; null it in the completion transaction. |
| CLI entry `admin-recovery-main.ts` and default `connectOwnConnection` never exercised | medium | patch | Only injected-`connect` test exists; AC3 unverified by any test. |
| Whitespace in code not normalized | false | none | `verifyTotp` strips whitespace itself (`mfa.ts:40`). |
| `recordActivity` unawaited/uncaught | false | none | Sync `void`, try/catch inside (`activity.ts:53-60`). |
| Per-link budget burned by honest retries | false | none | Mirrors reset flow (`password-reset-session.ts:92-93`); reset/setup budget is 10. |
| `revokeObjectURL` right after click | false | none | Same pattern as profile `recovery-codes-dialog.tsx`. |
| Double-submit loses codes | false | none | `AuthSubmitButton` is the reset flow's pending-aware button. |
| Token in `?token=` URL before `/open` | false | none | Intent says mirror the reset token exchange. |
| Open writes `pending_totp_secret` | false | none | Authorization row only; Design Notes specify it; credentials untouched. |
| No recovery for non-admin members | false | none | Intent removes `mfa-reset` and scopes recovery to completed admins. |
| E2E "old command gone" is filesystem check | false | none | Plan task prescribes the scenario. |
| CHANGELOG still mentions `mfa-reset` | false | none | Intent forbids editing `CHANGELOG.md`. |
| Plan artifact checkboxes/logs, fixture not extended | low | rejected | Fix edits the plan or adds no behavior. |
| `decryptField` throws after key change | low | rejected | Unlikely; fix adds guards. |
| Missing `DATA_ENCRYPTION_KEY` not caught at CLI | low | rejected | Page shows `needs-key`; fix adds branches. |
| CLI base URL default, error detail, close-throw, arg trim | low | rejected | Scope expansion or negligible. |
| Codes lost on leaving page, no `beforeunload` | low | rejected | Inherent to show-once design in the plan. |
| Form inputs reset after error, a11y/UX polish | low | rejected | Mirrors reset form; fix adds complexity. |
| Race tests mocked/sequential | low | rejected | Lock/race behavior lives in the lifecycle's tests from 4.x; matrix row covered at unit and E2E competing-reset. |
| Unused `AdminRecoveryEnrollmentView` type | low | patch | Dead export; delete. |

## Design Notes

Pending secret is created once per authorization via a conditional update (null-only), so reloads show the same QR. Codes are returned by the completion action only; reload cannot redisplay them.

## Verification

**Commands:**

- `npx vitest run` on the new/changed test files -- pass.
- `npm run db:migrate:e2e && npm run test:e2e:affected` -- affected scenarios pass.
- build-validator after targeted tests.

## Completion verification — 2026-10-30

Marked done at the user's request after checking implementation, tests and subsequent verification records. Evidence and fresh check results are recorded in the [ticket status audit](../status-audit-2026-10-30.md). Historical execution results above remain unchanged.
