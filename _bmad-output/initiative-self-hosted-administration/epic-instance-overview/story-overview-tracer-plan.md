---
title: "Overview tracer"
type: "feature"
ticket: "1"
created: "2026-10-30"
status: done
baseline_revision: "138a174a2fa80f6ab96b658d907bd585728c415b"
route: "full"
route_source: "auto"
risk: "medium"
review: "quick"
review_source: "pinned"
lenses_ran: ["quick"]
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Admins have no at-a-glance view of the app: `/admin` redirects to Users, and no Overview exists. Later CAP-10 metrics need one reader contract and one display component to reuse.

**Approach:** Add an admin-only Overview at `/admin/overview` that `/admin` redirects to. It shows version, database health and user/admin/pending counts as read-only rows. Each row comes from a plain reader returning `{ status, value, checkedAt }`, where a failed measurement is `unavailable`, never zero or healthy.

## Boundaries & Constraints

**Always:**

- Readers are plain functions in `src/lib`, each in its own try/catch, so one failure leaves the others intact.
- Pure contract types and helpers sit in a client-safe module. DB readers are `server-only` and use the `src/db` singleton.
- Every request rechecks admin (`requireAdmin()` in the page as well as the layout). Non-admins get 404.
- Layout is settings-width read-only rows, max 768px, no dashboard cards or metric links. Colors via CSS variables, targets at least 44px, `strokeWidth={1.5}` on icons.
- `checkedAt` uses the real clock, not `getNow()`, like Activity's `loadedAt`, and the page calls `await connection()` so it is never prerendered.
- Version is the `package.json` version injected at build via `next.config.ts` `env`. No Dockerfile change.
- Pending setup means `passwordHash is null`. Admins counts completed admins only.

**Never:**

- No per-metric Refresh, Retry or stale states (5.6), storage, trip/document counts or Activity panels (5.3–5.5).
- Do not rename the "Manage app" heading. Do not touch `src/db/schema.ts`.
- Do not redirect `/admin` to Users any more, and do not use `NEXT_PUBLIC_*` for the version.

## I/O & Edge-Case Matrix

| Scenario         | Input / State                  | Expected Output / Behavior                                                      | Error Handling                                   |
| ---------------- | ------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------ |
| Admin visits     | `/admin`                       | Redirect to `/admin/overview`; rows show version, DB Healthy, counts, with time | No error expected                                |
| Empty counts     | No pending accounts            | Pending setup shows `0` as a valid count                                        | No error expected                                |
| DB down          | Count and ping queries reject  | Those rows read Unavailable with their checked time; version still shows        | Reader returns `unavailable`, no throw to page   |
| Non-admin        | Member or signed out requests  | 404 (member) per `requireAdmin()`                                               | `notFound()` not caught                          |
| Current section  | On `/admin/overview`           | Nav lists Overview, Users, Activity; Overview has `aria-current="page"`         | No error expected                                |

</frozen-after-approval>

## Code Map

- `src/app/(app)/admin/page.tsx` -- redirect target changes to `/admin/overview`.
- `src/app/(app)/admin/layout.tsx` -- keep "Manage app" heading; no change expected.
- `src/app/(app)/admin/users/page.tsx` -- model for a server page: `requireAdmin()`, section with `--line`/`--surface`, `h2` with `aria-labelledby`.
- `src/components/arrivo/admin-section-nav.tsx` (+ `.test.tsx`) -- add Overview first in `SECTIONS`; test currently asserts 2 links and no Overview.
- `src/lib/health.ts`, `src/app/api/health/route.ts` -- `select 1` probe pattern via `db.execute(sql\`select 1\`)`; reuse the probe, not `checkHealth`.
- `src/lib/app-users.ts` -- Users page's `passwordHash is not null` definition of setup complete; reuse the definition in new count SQL.
- `next.config.ts` -- add `env: { APP_VERSION }` from `package.json` (`resolveJsonModule` is on).
- `tests/e2e/feature-map.mjs`, `scripts/feature-map.test.mjs` -- new component and feature must be registered or the build fails.
- `tests/e2e/steps/account-menu.steps.ts:103-111`, `account-menu.feature` -- step "Users-only app management shell" asserts landing on `/admin/users`; must now expect Overview. `app-activity.feature` and steps -- model for admin scenarios (`scenario.ensureCurrentUser({ user: { role: "admin" } })`).

## Tasks & Acceptance

**Execution:**

- [ ] `src/lib/overview-metric.test.ts`, `src/lib/overview-metric.ts` -- tests first, then `Metric<T>` (`ok | unavailable`, `checkedAt` ISO) with `measureMetric(read, now)` that catches rejections -- the shared contract
- [ ] `src/lib/overview-readers.test.ts`, `src/lib/overview-readers.ts` -- tests first, then `readVersion`, `readDatabaseHealth`, `readUserCounts` with injectable DB -- plain readers later entries reuse
- [ ] `next.config.ts` -- inject `APP_VERSION` -- version reaches the running app with no Dockerfile change
- [ ] `src/components/arrivo/metric-row.test.tsx`, `src/components/arrivo/metric-row.tsx` -- tests first, then a read-only row: label, value or "Unavailable", `<time>` "Checked" text -- shared by 5.3-5.5
- [ ] `src/app/(app)/admin/overview/page.tsx` -- server page calling readers, rendering settings-width panel with rows
- [ ] `src/app/(app)/admin/page.tsx`, `src/components/arrivo/admin-section-nav.tsx` and test -- redirect and Overview entry
- [ ] `tests/e2e/features/admin-overview.feature`, `steps/admin-overview.steps.ts`, `feature-map.mjs` -- `@feat:admin-overview` scenarios: admin sees rows and version equals `package.json`; member gets 404; update the account-menu landing step

**Acceptance Criteria:**

- Given an admin, when they open Manage app, then Overview shows version, DB Healthy, Users, Admins and Pending setup, each with a checked time.
- Given database queries fail, when Overview renders, then those rows say Unavailable, never 0 or Healthy.
- Given a member, when they request `/admin/overview`, then they get 404.
- Given the running build, when Overview renders, then its version equals `package.json`.

## Implementation Notes

## Design Notes

The mockup says "no dashboard cards", so the shared piece is a read-only row, not a card. The entry's "metric-card" means this row.

`type Metric<T> = { status: "ok"; value: T; checkedAt: string } | { status: "unavailable"; checkedAt: string }`

## Verification

**Commands:**

- `npx vitest run src/lib/overview-metric.test.ts src/lib/overview-readers.test.ts src/components/arrivo/metric-row.test.tsx src/components/arrivo/admin-section-nav.test.tsx scripts/feature-map.test.mjs` -- expected: pass
- `npm run test:e2e:affected` -- expected: pass
- `npm run lint && npx tsc --noEmit` -- expected: no errors

## Review Triage Log

| Finding | Verdict | Route | Evidence |
| --- | --- | --- | --- |
| `next.config.ts` mapped to `admin-overview` | medium | patch | FEATURE_MAP is checked before SHARED_GLOBS (`next.config.*`, feature-map.mjs:574); config changes would skip the full suite. Removed. |
| `defaultOverviewDb` never executed in unit tests | medium | patch | `src/lib/**` is in coverage include; ping/countUsers uncovered. Added mocked-`@/db` tests. |
| No E2E for DB-down page; Admins/Pending values unasserted | low | rejected | Reader and row unit tests cover Unavailable; DB-down E2E impractical; fix is added complexity. |
| Checked time `slice(11,19)` UTC, no date | low | rejected | Plan does not define format; cosmetic. |
| `checkedAt` taken at measurement start | low | rejected | Plan matrix only needs a checked time; negligible. |
| Shared count query makes all three counts unavailable together | low | rejected | Matrix row "DB down" expects those rows Unavailable; fix would edit plan notes. |
| Remaining items (demotion scenario, page width, next.config env) | false | rejected | Reviewer itself reported no defect. |
