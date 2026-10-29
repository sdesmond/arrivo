---
title: "Setup-only context tracer"
type: feature
ticket: 2
created: "2026-10-27"
status: in-progress
baseline_revision: "97fbaa06ee959b2f0a2fa51e4f6c83a2a9f01c28"
route: full
route_source: auto
risk: high
review: ""
review_source: ""
lenses_ran: [adversarial, edge-case-hunter, verification-gap]
review_loop_iteration: 0
followup_review_recommended: false
context:
  - AGENTS.md
  - _bmad-output/initiative-self-hosted-administration/architecture-self-hosted-administration/architecture-self-hosted-administration.md
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Recipients of an account setup link need setup-only access that never reaches app data, yet no route, cookie or throttle exists for it, and `/setup` is reserved for first-run admin creation.

**Approach:** Add a public `/account-setup` route outside the app layout: a GET exchange validates the link without consuming it, sets a limited HttpOnly cookie, and redirects to a token-free URL; the page revalidates the cookie against the database on every request and renders a non-dismissable stub dialog.

## Boundaries & Constraints

**Always:** Token via `validateCredentialAuthorization` (purpose Setup) only; exchange and page never consume or extend the link. Limited cookie `arrivo_account_setup` is HttpOnly, SameSite=Lax, Secure per `isHttpsRequest`, Max-Age no later than link expiry, and is not an Auth.js session. Exchange and page responses send `Cache-Control: no-store` and `Referrer-Policy: no-referrer`; the redirect target has no query. Invalid, expired, replaced, consumed, deleted or throttled all give one generic unavailable result. Throttle through `src/lib/auth-throttle.ts`: per-IP failures for invalid tokens, per-account attempts for valid ones. Proxy gets its own `/account-setup` allowlist entry; `/setup` and `/sign-up` stay closed.

**Never:** Password/name form, completion, Add User, regeneration, wrong-account sign-out flow, Activity events. Touch `isInstanceSetupOpen`. Store or log the raw token. Cookie accepted by `requireUser`, app layout, storage route or events routes.

## I/O & Edge-Case Matrix

| Scenario            | Input / State                                                  | Expected Output / Behavior                                                       | Error Handling                       |
| ------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------ |
| Open link           | Valid setup token, initialized instance                        | 303 to `/account-setup`, cookie set, stub dialog with username; link still valid | No error expected                    |
| Reopen              | Same link or cookie again before expiry                        | Dialog again; expiry unchanged                                                   | No error expected                    |
| Bad link            | Malformed, wrong-purpose, expired, replaced, consumed, deleted | Generic "Setup link unavailable" page, no cookie                                 | Invalid-token failure counted per IP |
| Revoked mid-session | Cookie held, link replaced or account deleted                  | Next request shows unavailable, cookie cleared                                   | Revalidated in DB each request       |
| Throttled           | Limit exceeded                                                 | Same generic unavailable page                                                    | No hint of account existence         |
| App isolation       | Only limited cookie                                            | `/trips`, `/api/storage/*`, `/api/users/me/events` redirect to sign-in           | Proxy + `requireUser` refuse         |

</intent-contract>

## Code Map

- `src/proxy.ts` -- `PUBLIC_PATHS`; add `/account-setup` (`/setup` prefix does not match it).
- `src/lib/credential-authorizations.ts` -- `validateCredentialAuthorization(db, {token, purpose})`; reuse, do not change.
- `src/lib/auth-throttle.ts` -- `checkThrottle`/`recordFailure`/`accountTarget`/`IP_POLICY`/`clientIpFromHeaders`/`lockoutMessage`; add `"setup"` to `accountTarget` kinds.
- `src/lib/request-origin.ts` -- `isHttpsRequest`, `browserUrl` for cookie and redirect.
- `src/lib/trusted-devices.ts` -- cookie constant and read pattern to mirror, not import.
- `src/app/(auth)/setup/page.tsx`, `src/app/(auth)/layout.tsx` -- layout/page shape to mirror; new route lives at `src/app/account-setup/` outside `(app)`.
- `src/app/api/storage/[...path]/route.ts`, `src/lib/auth-helpers.ts` -- `requireUser` is the refusal under test; unchanged.
- `tests/e2e/instance-state.ts`, `tests/e2e/steps/instance-bootstrap.steps.ts`, `tests/e2e/e2e-db.ts` -- initialized state, `withE2EDb`, `registerCleanup({entity:"user"})`.
- `tests/e2e/feature-map.mjs` -- register new entry.

## Tasks & Acceptance

**Execution:**

- [ ] `src/lib/account-setup-session.ts` + `.test.ts` -- cookie name/options/readers and `resolveAccountSetupContext(cookieToken, db, clock)` (throttle check, DB revalidation, generic result) -- shared by route, page, tests
- [ ] `src/lib/auth-throttle.ts` + `.test.ts` -- add `"setup"` account kind -- per-account throttle
- [ ] `src/proxy.test.ts`, `src/proxy.ts` -- test then allowlist `/account-setup`, assert `/trips` still redirects -- public entry
- [ ] `src/app/account-setup/route.ts` + `route.test.ts` -- GET exchange: validate, throttle, set cookie, 303 clean URL with no-store/no-referrer -- never consumes
- [ ] `src/app/account-setup/page.tsx`, `layout.tsx`, `src/components/arrivo/account-setup-dialog.tsx` + `.test.tsx` -- dynamic page, headers, stub non-dismissable dialog (username, no Close, Escape/backdrop ignored), unavailable state; 44px targets -- surface
- [ ] `tests/e2e/features/account-setup.feature`, `tests/e2e/steps/account-setup.steps.ts` (`@feat:account-setup`), `tests/e2e/feature-map.mjs` -- scenarios per ACs, pending user plus link created per scenario via `issueCredentialAuthorization`, no URL in fixtures logs -- register globs for new files
- [ ] Run targeted Vitest and `npm run test:e2e:affected`; record commands in Implementation Notes. No build-validator here.

**Acceptance Criteria:**

- Given an initialized instance and valid setup link, when opened twice, then the stub dialog shows both times, the URL has no token, and the link still validates with unchanged expiry.
- Given only the limited cookie, when requesting `/trips`, `/api/storage/x.jpg` and `/api/users/me/events`, then each redirects to sign-in.
- Given a held cookie, when the link is replaced or the account deleted, then the next request shows unavailable.
- Given the initialized instance, when visiting `/setup` and `/sign-up`, then both redirect to sign-in.
- Given exchange and page responses, then both carry no-store and no-referrer.

## Implementation Notes

## Plan Change Log

## Review Triage Log

### 2026-10-28 — Review pass (retrospective follow-up A1)

Run after the ticket merged (PR #353), over `97fbaa06..bfe44407` (src, tests), with `authority-locking` as the focus area. `authority-locking` is not an installed `bmad-review` lens, so the adversarial, edge-case-hunter and verification-gap lenses ran inline with that focus.

- Authority and locking result: no state change in this ticket needs a lock. The throttle writes serialize (`recordFailure` inserts then `SELECT ... FOR UPDATE`, `src/lib/auth-throttle.ts:131-145`). A setup-only cookie reaches no app surface: protected paths still require an Auth.js session in `src/proxy.ts`, and E2E covers `/trips`, storage and the events feed (`account-setup.feature:22-32`).
- findings: 5 — high 0, medium 1, low 4
  - `[medium]` `[defer]` Cookie is set with `Path=/` (`account-setup-session.ts:39`), so the raw token rides on every same-origin request, including app routes and API handlers and their logs. Only `/account-setup` and its server actions need it. Narrow to `Path=/account-setup`.
  - `[low]` `[defer]` Each valid exchange spends the account's 10-per-window budget (`account-setup-session.ts:96`), so link scanners or prefetchers can use it up. Once locked, the page treats the held cookie as unavailable and clears it (`page.tsx` redirect to `/open`), so a person mid-setup loses their context until the window ends.
  - `[low]` `[defer]` Per-IP throttle is skipped when no forwarded IP header exists (`ipTargets` returns `[]`, `account-setup-session.ts:65-68`). Guessing a token stays impractical, but the throttle fails open.
  - `[low]` `[accept]` The setup link carries the token in the query string, so a reverse-proxy access log can record it before the exchange redirect. Inherent to a GET link; operators should know.
  - `[low]` `[patch]` `readAccountSetupToken` (`account-setup-session.ts:30`) is exported and used only by tests; the page and action read the cookie through `cookies()`. Dead production code.
  - `[low]` `[defer]` `PUBLIC_PATHS` matches by `startsWith`, so any future `/account-setup*` sibling route is public (`src/proxy.ts`). Match the path or `path + "/"`.

Nothing here changes the Done-when 1 verdict. The medium finding is worth a follow-up ticket; the rest are recorded so later runs stop re-flagging them.

## Design Notes

Cookie holds the raw token so every request revalidates by digest; replacement, expiry and deletion revoke instantly with no cookie-side state. Per-account throttle counts valid exchanges (10 per 15 minutes); per-IP counts invalid ones. Review pinned `authority-locking`.

## Verification

**Commands:**

- `npx vitest run src/lib/account-setup-session.test.ts src/lib/auth-throttle.test.ts src/proxy.test.ts src/app/account-setup` -- expected: pass
- `npm run test:e2e:affected` -- expected: account-setup and auth scenarios pass
