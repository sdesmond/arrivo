---
title: "Sign-in to Activity tracer"
type: "feature"
ticket: "1"
created: "2026-10-25"
status: done
baseline_revision: "fdc4f02d90873b54668b594b903333bd63a8e3f1"
route: "full"
route_source: "auto"
risk: "high"
review: "quick"
review_source: "pinned"
lenses_ran: ["quick"]
review_loop_iteration: 0
context:
  - "{project-root}/_bmad-output/initiative-self-hosted-administration/epic-activity-and-retention/epic-activity-and-retention.md"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Admins cannot see what users do. No Activity storage, recording API or viewer exists, and later stories need shared names and contracts.

**Approach:** Thin end-to-end slice: Activity table + migration, safe event contracts, bounded caught post-response recorder, admin-only read service, `/admin/activity` table with nav entry, and one completed sign-in event from the credentials gate. Publish a producer inventory for stories 2.3–2.6.

## Boundaries & Constraints

**Always:** No FKs or cascades on Activity; store stable actor ID plus event-time username snapshot. Occurrence time from an injectable real server clock (not `getNow()`). Recording is never inside a primary transaction, never awaited on the response path, schedules via `after()` only after the sign-in succeeded, catches scheduling and persistence failures, bounded by a timeout, no retries. Read service rechecks current DB admin authority; denied → `notFound()`. Event domain types in `src/data/types.ts`. Stored data, UI, ARIA text, errors carry no IP, tokens, URLs, credentials.

**Never:** Event for MFA challenge alone, failed sign-in, logout or other producers (2.3+); batching (2.2); filters, pagination, reader states, local-timezone (2.7); retention (2.8). No raw `fs`, no second DB client, no `any`.

## I/O & Edge-Case Matrix

| Scenario                 | Input / State                                | Expected Output / Behavior              | Error Handling                 |
| ------------------------ | -------------------------------------------- | --------------------------------------- | ------------------------------ |
| Password sign-in, no MFA | valid credentials                            | one `sign_in` row after response        | n/a                            |
| MFA account              | password step                                | no row; MFA challenge only              | n/a                            |
| MFA account              | valid code                                   | one `sign_in` row                       | n/a                            |
| Recorder failure         | `after()` throws or insert rejects/times out | sign-in still succeeds                  | caught, logged without secrets |
| Deleted account          | actor row later deleted                      | row still listed with snapshot username | n/a                            |
| Non-admin read           | member requests `/admin/activity` or service | `notFound()`                            | n/a                            |

</frozen-after-approval>

## Code Map

- `src/db/schema.ts` -- add `activityEvents` (id uuid, startedAt, endedAt timestamptz, type text, actorId uuid?, actorUsername text?, targetId?, targetUsername?, tripId uuid?); indexes on (endedAt desc, id desc), actorId, type. Generate `drizzle/0005_*.sql` via `npm run db:generate`.
- `src/data/types.ts` -- `ActivityEventType` const (`SignIn: "sign_in"`), `ActivityEventInput`, `ActivityEventSummary` (safe read shape).
- `src/lib/authorize-credentials.ts` -- `completeSignIn` is the single success point for password and MFA paths; add `username` to `userColumns`/`UserRow`; call recorder after cookie set. Mirror in `authorize-credentials.test.ts` mocks.
- `src/lib/instance-roles.ts` `isInstanceAdmin`, `src/lib/auth-helpers.ts` `requireAdmin` -- reuse for authority.
- `src/lib/instance-users.ts` -- pattern for server-only list service.
- `src/app/(app)/admin/{layout,users/page}.tsx` -- admin shell and page pattern to copy.
- `src/components/arrivo/admin-section-nav.tsx` -- hardcoded Users link with static `aria-current`; make path-aware, add Activity.
- `src/components/ui/` -- no `table.tsx`; add via shadcn.
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md` -- `after` allowed in server actions and route handlers.
- `tests/e2e/feature-map.mjs` -- register new feature + sources; `tests/e2e/steps/mfa.steps.ts` for MFA fixtures.

## Tasks & Acceptance

**Execution:**

- [ ] `src/lib/activity.test.ts`, `src/lib/activity-queries.test.ts`, `src/components/arrivo/instance-activity.test.tsx`, `src/components/arrivo/admin-section-nav.test.tsx`, `src/lib/authorize-credentials.test.ts` -- write/extend first -- cover matrix rows
- [ ] `src/data/types.ts`, `src/db/schema.ts`, `drizzle/` -- types, table, generated migration (review SQL) -- storage contract
- [ ] `src/lib/activity.ts` -- `recordActivity(input)`: capture time via `setActivityClock`-injectable clock, `after()` in try/catch, insert with timeout, catch all -- failure isolation
- [ ] `src/lib/activity-queries.ts` -- `listRecentActivity(viewerId)`: recheck admin, newest first (endedAt desc, id desc), fixed limit, safe shape -- admin-only read
- [ ] `src/lib/authorize-credentials.ts` -- record sign-in in `completeSignIn` -- tracer producer
- [ ] `src/components/ui/table.tsx` (shadcn), `src/components/arrivo/instance-activity.tsx`, `src/app/(app)/admin/activity/page.tsx` -- server component `InstanceActivity` with `InstanceActivityProps`; page owns `requireAdmin()` + read; h2 "Activity" under layout h1, `<caption>`, table columns Username | Type | Action | Time | Trip ID (`scope="col"`), UTC times labeled as UTC, "—" for no trip, labeled keyboard-scrollable overflow (`tabIndex=0`, `role="region"`, `aria-label`), empty state, no color-only state
- [ ] `src/components/arrivo/admin-section-nav.tsx` -- Users + Activity links, `aria-current` from `usePathname()` (use the global `next/navigation` mock from `vitest.setup.mts`; no per-file re-mock), 44px targets
- [ ] `_bmad-output/initiative-self-hosted-administration/epic-activity-and-retention/activity-producer-inventory.md` -- list actual mutation owners (auth, profile, admin/users, lifecycle libs, trips actions, invitations) for 2.3–2.6, plus shared names
- [ ] `tests/e2e/features/instance-activity.feature`, `tests/e2e/steps/instance-activity.steps.ts`, `tests/e2e/feature-map.mjs` -- scenarios: admin sees own sign-in after refresh; MFA password step alone adds none; member gets not-found. Run `npm run db:migrate:e2e`.

**Acceptance Criteria:**

- Given an admin signs in, when they open `/admin/activity` and refresh, then a Sign-in row with their username appears.
- Given an MFA-enabled user submits only the password, when the challenge shows, then no sign-in row exists.
- Given recording throws or times out, when a user signs in, then sign-in succeeds unchanged.
- Given the actor account is deleted, when an admin views Activity, then the row remains with its snapshot username.

## Implementation Notes

## Plan Change Log

## Review Triage Log

- medium / patch: deleted-actor AC untested beyond mocked rows -- added E2E scenario deleting the actor row (fixed).
- false: nav test spyOn breaks global mock -- coverage run passed; spyOn on mocked module works.
- false: `user.id!` in activity page -- identical to admin/users/page.tsx.
- low / rejected: table.tsx classes and "use client" -- match other src/components/ui primitives.
- low / rejected: nav not mapped to instance-activity -- account-menu already covers it and its step asserts Activity link.
- low / rejected: "Users-only shell" step name stale -- cosmetic.
- low / rejected: trusted-device sign-in untested -- behaves per plan (records sign-in).
- false: page-level non-admin test missing -- E2E member scenario covers it.

## Design Notes

Recorder shape: `recordActivity({ type, actor: { id, username } })` returns void synchronously; all failure handling internal. Names chosen here (`activityEvents`, `ActivityEventType`, `recordActivity`, `listRecentActivity`, `/admin/activity`) are the shared contract for 2.2–2.10.

## Verification

**Commands:**

- `npx vitest run src/lib/activity src/lib/authorize-credentials src/components/arrivo/instance-activity src/components/arrivo/admin-section-nav` -- expected: pass
- `npm run db:generate` -- expected: no drift after migration committed
- `npm run test:e2e:affected` -- expected: instance-activity, auth, mfa, account-menu pass
