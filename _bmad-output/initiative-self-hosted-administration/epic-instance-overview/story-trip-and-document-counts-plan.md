---
title: "Trip and document counts"
type: "feature"
ticket: "4"
created: "2026-10-31"
status: "built"
baseline_revision: "26dba38e247fdb4940985ac866e5de2bc9b03768"
route: "full"
route_source: "auto"
risk: "low"
review: "quick"
review_source: "pinned"
lenses_ran: [quick]
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Overview lacks trip/document totals required by CAP-10.

**Approach:** Add Trips and Documents rows through independent DB-backed readers, reusing MetricRow and its checked-time/failure contract.

## Boundaries & Constraints

**Always:** Count all persisted `trips` and `documents` rows instance-wide, including reservation/event documents. Zero is successful. Each query has its own measurement boundary and checked time; failures never suppress other metrics. Preserve server-only readers, DB singleton, page-level admin guard and live rendering. Show aggregates only, without private identities, URLs or links.

**Never:** No schema changes, stored counters, trip joins/membership filters, filesystem access, new infrastructure or dashboard cards. No Refresh/Retry/stale controls (5.6), Activity (5.5), shared styling changes or CHANGELOG edits.

## I/O & Edge-Case Matrix

| State | Result | Failure handling |
| --- | --- | --- |
| Multiple owners and attachment types | Exact instance totals, each timestamped | No error expected |
| Empty table | Successful 0 | Never Unavailable |
| Either query rejects | Failed count Unavailable; other retains value/time | Separate measureMetric boundaries |
| Both queries reject | Both Unavailable | No exception details or fabricated zero |

</frozen-after-approval>

## Code Map

- `src/lib/overview-readers.ts` — extend OverviewDb/defaultOverviewDb with separate count operations; add readers using measureMetric. Keep user-count behavior unchanged.
- `src/lib/overview-readers.test.ts` — fakeDb and mocked `.select().from()` support injected and default reader tests.
- `src/db/schema.ts` — no soft deletes; documents.tripId nullable for reservation attachments. Read only.
- `src/app/(app)/admin/overview/page.tsx` — guarded/live server page, Promise.all reader fanout, semantic MetricRow list; currently 44 lines.
- `src/components/arrivo/metric-row.tsx` and test — already handle zero, Unavailable and time; reuse unchanged.
- `tests/e2e/steps/admin-overview.steps.ts` — metricRow locator and stable-before/after reload retry pattern; two timestamp assertions currently expect seven rows.
- `tests/e2e/e2e-seed-data.ts`, `scenario-fixture.ts` — trip mothers/materializer support multiple owners, documents, reservations and cleanup.
- `tests/e2e/e2e-db.ts` — withE2EDb for authoritative totals. Existing feature-map covers changed runtime paths.

## Tasks & Acceptance

**Execution:**

- [x] `src/lib/overview-readers.test.ts` — first add failing tests for positive/zero values, independent timestamps, either/both query failures and default DB delegation to correct tables, including zero aggregate rows. Extend fakeDb.
- [x] `tests/e2e/features/admin-overview.feature`, `tests/e2e/steps/admin-overview.steps.ts` — extend admin scenario with scenario-owned admin/member trips and documents, including reservation attachment. Assert DB totals, checked times and absence of private fixture names/URLs. Update seven-row assertions to nine; preserve member denial/storage checks.
- [x] `src/lib/overview-readers.ts` — separate trip/document aggregate queries and exported readers, each using measureMetric; select counts only.
- [x] `src/app/(app)/admin/overview/page.tsx` — fan out both readers and append Trips/Documents MetricRows. Preserve existing guard/layout; bundled Next.js connection docs confirm runtime rendering.
- [x] Run targeted tests, review and final project validation; fix failures before completion.

**Acceptance Criteria:**

- Given admin and persisted data from multiple accounts, when Overview loads, then both totals match DB counts including reservation documents, each with checked time.
- Given empty tables, when readers run, then each returns successful zero, rendered through existing MetricRow semantics.
- Given either query rejects, when measurements run, then only that count is Unavailable and other count retains value/time.
- Given private fixture names/URLs, when Overview renders, then those details are absent from Overview markup.
- Given member, when requesting Overview, then existing not-found protection applies.

## Implementation Notes

Added independent count aggregates and measured readers; reused existing MetricRow display. Targeted tests: 45 passed. Affected E2E: 11 passed. Matrix audit: all four rows covered by passing reader/default-query tests and browser totals scenario.

## Plan Change Log

## Review Triage Log

Quick review: no findings; nothing deferred.

## Design Notes

Browser scenarios share mutable DB totals. Compare source counts before/after reload, retry until stable, then compare UI; never delete unrelated rows to force zero. Reader/default-query tests prove empty-table semantics; existing MetricRow tests prove zero rendering. Browser coverage proves real SQL totals. Injected failures prove isolation without a new DB fault hook.

## Verification

- `npx vitest run src/lib/overview-readers.test.ts src/components/arrivo/metric-row.test.tsx scripts/feature-map.test.mjs` — pass.
- `npm run test:e2e:affected` — affected browser scenarios pass.
- `build-validator` — final lint, TypeScript, build, coverage and affected E2E; coverage/E2E separately in required order.

Final validation: lint, TypeScript and isolated production build passed (16 static pages; Overview dynamic). Coverage: 5,660 tests passed, lines 97.38%, functions 96.9%, branches 92.7%. Final affected E2E: 11 passed. Build output does not report bundle sizes.
