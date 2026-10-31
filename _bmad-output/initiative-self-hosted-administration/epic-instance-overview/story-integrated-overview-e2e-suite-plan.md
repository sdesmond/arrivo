---
title: "Integrated Overview E2E suite"
type: feature
ticket: 8
created: "2026-10-31"
status: done
baseline_revision: "75e3d5e8f480b8ee202b4d375debbe54268f8818"
route: oneshot
route_source: auto
risk: low
review: "quick"
review_source: "pinned"
lenses_ran: [quick]
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent � do not modify unless human renegotiates">

## Intent

**Problem:** Ticket 5.8 asks for an integrated Overview browser suite. admin-overview.feature already proves landing, version/DB/user/trip/document rows, the storage fault with refresh/Retry, redacted recent actions, the failed sign-in count and member denial.

**Approach:** Add no new E2E. Per-row Refresh behavior for every metric is unit-covered (overview-metrics.test.tsx, refreshable-metric.test.tsx, overview/actions.test.ts). **Decision (user, 2026-10-31):** anything a unit test can cover must not become an extra E2E test. Verify the existing suite passes and close the ticket.

</frozen-after-approval>

## Implementation Notes

Oneshot. A refresh scenario was drafted and passed, then reverted on user direction: unit tests already cover per-row refresh. No code changed; existing admin-overview suite passed 5/5 with the draft present and 4/4 baseline scenarios are unchanged.

## Verification

- `npm run test:e2e:affected` (via build-validator) -- expected: admin-overview feature passes, including the new scenario.
- Acceptance: Given the Overview is open, when Activity gains a newer admin action and a failed sign-in and I Refresh each row, then Recent admin actions shows the new action first and the failed sign-in count rises by at least one, each with a later checked time. Other rows (Users, Trips) keep their original checked time and value.

## Review Triage Log

### 2026-10-31 — Review pass

- verdicts: 5 findings — medium 2, low 3
- [medium] [patch] +55 min admin-action seed could outrank the sibling scenario's +30..+35 rows under parallel workers. Fixed: scenario no longer seeds an admin action; Recent admin actions is refreshed on unchanged data and asserted by later checked time. (Deviates from the frozen Approach wording "seed ... Activity rows" for admin actions; the failed sign-in seed stays.)
- [medium] [patch] Recent admin actions had no checked-time assertion. Fixed with baseline snapshot and later-`checkedAt` check.
- [low] [patch] No cross-check between the two refreshed rows. Added: Failed sign-ins unchanged after the first refresh, Recent admin actions unchanged after the second.
- [low] [reject] One-shot Users/Trips reads: they run after the refresh response settles; non-refreshed rows have no pending update.
- [low] [reject] Possible double-match on "Users" label: same `metricRow` locator already used for exact labels and the scenario passed.
