---
title: "Recent admin actions and failed logins"
type: "feature"
ticket: "5"
created: "2026-10-31"
status: "built"
baseline_revision: "beef94f0cda364769bcfb9e620a601bc8f08faf1"
route: "full"
route_source: "auto"
risk: "medium"
review: "quick"
review_source: "pinned"
lenses_ran: ["quick"]
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ["oversized"]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Overview lacks the last two CAP-10 signals: what admins recently did and how many sign-ins failed lately. Both live in Activity, which Overview does not read yet.

**Approach:** Add two Activity reads beside `readActivityPage` in `src/lib/activity-queries.ts`: latest-N rows of a type set, and a count of one type since an instant. Wrap them as Overview readers returning `Metric<T>`. Render a "Failed sign-ins (24 hours)" `MetricRow` and a read-only "Recent admin actions" row listing the latest 5 admin events.

## Boundaries & Constraints

**Always:**

- Admin action types are exactly: RetentionChanged, AccountCreated, SetupLinkGenerated, SetupLinkRegenerated, PendingAccountDeleted, RoleChanged, PasswordResetLinkGenerated, AdminRecoveryLinkGenerated, AccountDeletedByAdmin. Latest 5 by `endedAt desc, id desc`.
- Failed sign-ins = count of `sign_in_failed` rows with `endedAt >= checkedAt - 24h` (inclusive), real clock, not `getNow()`.
- Both reads go through `measureMetric`; a rejection gives `unavailable` for that row only, never `0` or an empty list.
- Recent rows use the existing `ActivityEventSummary` mapping (share it with `readActivityPage`, don't fork it), so any trip row carries only actor, action, time and trip ID. Entries show actor, action label (`EVENT_LABELS`), affected account username when recorded, and time. No IDs other than trip ID, no trip titles, no collaborator names, no links.
- Each Overview row keeps its own `Checked HH:MM:SS UTC` time. Colors via CSS variables; read-only, no interactive targets added.
- Register new component and feature-map paths so `scripts/feature-map.test.mjs` stays green.

**Never:**

- No Refresh/Retry/stale UI (5.6), no schema change, no new Activity event types, no separate failed-sign-in list or link to Activity.
- Do not change `readActivityPage` behaviour or its tests' expectations.

## I/O & Edge-Case Matrix

| Scenario        | Input / State                                                | Expected Output / Behavior                                              | Error Handling                         |
| --------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------- | -------------------------------------- |
| Happy           | 7 admin events, plus sign-ins and trip edits newer than them | Latest 5 admin events listed newest first; non-admin types never appear | No error expected                      |
| No admin events | Activity has none of the 9 types                             | Row reads "No admin actions recorded yet." with checked time            | No error expected                      |
| Window edge     | Failed sign-ins at exactly 24h ago, 23h ago, 25h ago         | Count includes the first two, excludes 25h                              | No error expected                      |
| No failures     | No failed sign-ins in window                                 | Count shows `0`                                                         | No error expected                      |
| Deleted target  | `AccountDeletedByAdmin` with target username                 | Shows the snapshot username; nothing else about the account             | No error expected                      |
| DB read fails   | Either query rejects                                         | That row shows Unavailable with checked time; other rows unaffected     | Reader returns `unavailable`, no throw |

</intent-contract>

## Code Map

- `src/lib/activity-queries.ts` -- `readActivityPage` row→`ActivityEventSummary` mapping (lines 112–127): extract into a shared helper; add `readRecentActivity(database, types, limit, now?)` and `countActivitySince(database, type, since)` using `ActivityReadDatabase`. No `isAppAdmin` recheck in these two: the Overview page's `requireAdmin()` guards, matching other Overview readers.
- `src/lib/activity-queries.test.ts` -- fake `database` with chained `select().from().where().orderBy().limit()`; `PgDialect().sqlToQuery` to assert WHERE text. Add new `describe` blocks with their own fakes; don't disturb the existing `selectCalls` parity fake.
- `src/lib/overview-readers.ts` -- `OverviewDb` + `defaultOverviewDb` (uses `appDb` singleton) and `measureMetric` readers. Add `recentAdminActions()` and `countFailedSignIns(since)` to `OverviewDb`; add `ADMIN_ACTION_TYPES`, `readRecentAdminActions(db?, now?)`, `readFailedSignIns(db?, now?)`.
- `src/lib/overview-readers.test.ts` -- mocks `@/db` (`execute`, `select().from`); extend for new defaults and readers.
- `src/components/arrivo/metric-row.tsx` -- shared row (`dl > div`, `dt` label, `dd` value + `<time>` "Checked … UTC"); reuse for the failed-sign-in count. Model the new list row on its markup.
- `src/lib/activity-dates.ts` `formatInstant(instant, "UTC")`, `src/lib/activity-labels.ts` `EVENT_LABELS` -- reuse for entry time and action text.
- `src/app/(app)/admin/overview/page.tsx` -- add both readers to `Promise.all`; render the two rows after Documents.
- `tests/e2e/activity-seed.ts` -- `seedActor`, `seedActivityEvents`, `removeSeededActivity` (scenario-owned rows). Check which `After` hook calls `removeSeededActivity` and make sure it runs for admin-overview scenarios.
- `tests/e2e/steps/admin-overview.steps.ts` -- `metricRow(page, label)`; existing steps assert `locator("time")` count 9 in two places and exactly one "Unavailable" on probe failure. New entry `<time>` elements would break the time counts, so scope those counts to checked times (`hasText: /^Checked /`) and update them to 11.
- `tests/e2e/feature-map.mjs` -- `admin-overview` entry (line 155): add the new component; `src/lib/activity-queries.ts` is under `app-activity` only, so add it to `admin-overview` too.

## Tasks & Acceptance

**Execution:**

- [x] `src/lib/activity-queries.test.ts`, `src/lib/activity-queries.ts` -- tests first: type-set filter, ordering, limit, summary shape; count WHERE uses type and `>=` since. Then the shared mapper and two reads -- Activity read service owns Activity queries
- [x] `src/lib/overview-readers.test.ts`, `src/lib/overview-readers.ts` -- tests first: the 9 types and limit 5 passed; `since` = now − 24h; rejection → unavailable; defaults hit `@/db`. Then readers -- Overview contract
- [x] `src/components/arrivo/recent-admin-actions.test.tsx`, `src/components/arrivo/recent-admin-actions.tsx` -- tests first: entries in order with actor/action/target/time, empty text, Unavailable, checked time, no trip ID or links. Then a non-interactive row component (no `"use client"`, like `metric-row.tsx`) with `RecentAdminActionsProps`
- [x] `src/app/(app)/admin/overview/page.tsx` -- wire readers and rows
- [x] `tests/e2e/features/admin-overview.feature`, `tests/e2e/steps/admin-overview.steps.ts`, `tests/e2e/feature-map.mjs` -- new scenario: seed 6 admin events (endedAt in the next hour so parallel scenarios' real events can't outrank them) plus a newer non-admin event, and failed sign-ins at 1h and 25h ago; assert the latest 5 admin entries in order, the non-admin and oldest absent, and the failed-sign-in count equals a DB count over the same window (retry with reload, since parallel scenarios add failures). Fix the time-count assertions; register paths

**Acceptance Criteria:**

- Given seeded admin events, when an admin opens Overview, then "Recent admin actions" lists the 5 newest admin events, newest first, each with actor, action, affected account and time.
- Given failed sign-ins inside and outside 24 hours, when Overview renders, then "Failed sign-ins (24 hours)" equals the number inside the window.
- Given Overview renders, then it shows no trip title, collaborator name or link, and the existing storage-failure scenario still shows exactly one Unavailable.

## Implementation Notes

- A null actor on an admin event renders "Unknown" (matching the Activity table's non-sign-in label), so the storage-failure scenario's single "Unavailable" stays unique.
- The affected account shows as the plain snapshot username, without the Activity table's "(Unknown account)" suffix.
- Seeded-row cleanup relies on the global `removeSeededActivity` After hook in `app-activity.steps.ts`.

## Plan Change Log

## Review Triage Log

### 2026-10-31 — Review pass

- verdicts: 1 findings — high 0, medium 0, low 1, false 0, maybe-false 0
- findings:
  - `[low]` `[patch]` Future-dated seeded rows in the admin-overview Given step sit on top of the unfiltered Activity first page (and the seeded `trip_updated` reads Ongoing) for parallel scenarios, contradicting the scoping rule in `tests/e2e/activity-seed.ts:22-23` — every Activity first-row and Ongoing assertion is scoped by actor filter or seeded name (`app-activity.steps.ts:805-816, 914, 1057`), so the remaining exposure is only reduced headroom (13 of 20 rows) for unfiltered own-row lookups; future dating is what keeps this scenario deterministic. Patched: the seed-helper comment now names the exception and why other scenarios must keep scoping.

## Auto Run Result

**Summary:** Overview now shows "Failed sign-ins (24 hours)" (count of `sign_in_failed` rows with `endedAt` within 24h of the check, real clock) and a read-only "Recent admin actions" row listing the latest 5 of the nine admin event types, each with actor, action, affected username and UTC time. Both read Activity through new `readRecentActivity` / `countActivitySince` beside `readActivityPage`, which now shares one row→summary mapper. Each read is its own `Metric`, so a failure shows Unavailable for that row only.

**Files changed:**

- `src/lib/activity-queries.ts` -- shared `toSummary` mapper and column set; `readRecentActivity`, `countActivitySince`.
- `src/lib/activity-queries.test.ts` -- type-set filter, order, limit, summary shape; count WHERE (`=` type, `>=` since).
- `src/lib/overview-readers.ts` -- `ADMIN_ACTION_TYPES`, limit and window constants; `readRecentAdminActions`, `readFailedSignIns`; `OverviewDb` defaults.
- `src/lib/overview-readers.test.ts` -- nine types, 24h window, 0 as ok, failure isolation, default DB wiring.
- `src/components/arrivo/recent-admin-actions.tsx` (+ `.test.tsx`) -- new read-only row: entries, empty text, Unavailable, checked time, no IDs or links.
- `src/app/(app)/admin/overview/page.tsx` -- wires both readers and rows.
- `tests/e2e/features/admin-overview.feature`, `tests/e2e/steps/admin-overview.steps.ts` -- new scenario; time-count assertions scoped to checked times (11).
- `tests/e2e/feature-map.mjs` -- `admin-overview` covers the new component and the Activity modules it reads.
- `tests/e2e/activity-seed.ts` -- comment names the future-dated seeding exception (review patch).

**Review findings:** 1 patched (low: seed-helper scoping comment). 0 deferred. 0 rejected.

**Follow-up review recommendation:** false — patched counts: high 0, medium 0, low 1.

**Verification:** targeted Vitest 65/65 pass; `tsc --noEmit` clean; ESLint 0 errors (1 pre-existing warning in untouched `src/lib/invitations.test.ts`); `npm run test:e2e:affected` 43/43 pass (twice, before and after the patch); build-validator PASS — lint, TSC, build, coverage 5693 tests (lines 97.38%, functions 96.92%, branches 92.73%), affected E2E 43/43.

**Residual risks:** while the recent-actions scenario runs, its seven future-dated rows take the top of the unfiltered Activity first page, leaving 13 slots for parallel scenarios that look for their own just-recorded row unfiltered.

## Design Notes

Recent actions is a list, so it can't use `MetricRow` (which takes `string | number`). Keep it as one `dl > div` row so the `metricRow` locator and the row rhythm still work:

```tsx
<div className="… border-b py-2" style={{ borderColor: "var(--line)" }}>
  <dt>Recent admin actions</dt>
  <dd>
    {/* <ol> of entries | empty text | Unavailable */}
    <time dateTime={checkedAt}>Checked 12:00:00 UTC</time>
  </dd>
</div>
```

## Verification

**Commands:**

- `npx vitest run src/lib/activity-queries.test.ts src/lib/overview-readers.test.ts src/components/arrivo/recent-admin-actions.test.tsx scripts/feature-map.test.mjs` -- expected: pass
- `npm run lint && npx tsc --noEmit` -- expected: no errors
- `npm run test:e2e:affected` -- expected: pass
