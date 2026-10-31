---
title: "Per-metric Refresh, Retry and stale states"
type: "feature"
ticket: "6"
created: "2026-10-31"
status: "built"
baseline_revision: "ef00776940302979841ae6d74e59eaa58ad593e2"
route: "full"
route_source: "auto"
risk: "medium"
review: "quick"
review_source: "pinned"
lenses_ran: ["quick"]
review_loop_iteration: 0
followup_review_recommended: false
context: ["AGENTS.md"]
warnings: ["oversized"]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Overview measurements have freshness timestamps but no independent Refresh or Retry controls.

**Approach:** Wrap existing readers in admin-guarded server actions returning the existing Metric contract. Give each displayed metric independent client refresh state, preserving successful values and original checked times after failed refreshes.

## Boundaries & Constraints

**Always:** Recheck current admin authority on every action before reading; authorization failures must escape measurement error handling. Keep existing Metric contract, server page guard and connection(), independent measurements, live real-clock freshness, privacy restrictions and settings-style definition list. Users/Admins/Pending setup refresh independently even though the existing reader shares one query: select just requested result. All 11 displayed metrics, including recent actions, need controls. Each row owns pending/error state, disables duplicate requests while pending, announces progress/result politely and provides metric-specific accessible control names. Refresh succeeds by replacing that row's value/time only. Unavailable initial measurement has Retry; failed refresh retains previous successful value/time with explicit Stale and Retry. Repeated failures retain last success. Recovery clears Stale and restores Refresh. Transport failures use same stale/unavailable behavior without exposing errors. Controls use existing Button, 44px targets, visible focus and CSS variable colors; preserve keyboard focus and wrapping at 320px/200% text.

**Never:** No router.refresh or path revalidation for these reads, page-wide refresh, new metric domain contract, persisted metrics/cache, new probes/providers, schema changes, unrelated refactors, CHANGELOG edits or direct private data reads. Do not swallow authorization errors server-side. Do not commit or push; parent handles final delivery gates. Do not invoke build-validator from implementation workflow; parent invokes it once after final code and targeted checks.

## I/O & Edge-Case Matrix

| Scenario | State/action | Expected result | Error handling |
| --- | --- | --- | --- |
| Successful refresh | Refresh one healthy metric | Only selected value/time changes; other rows unchanged | No error |
| Initial failure | Metric unavailable at page load | Unavailable, checked time and Retry | No fabricated zero/Healthy |
| Refresh failure | Prior successful value, reader unavailable or transport rejects | Prior value/time retained, Stale and Retry | Fixed text, no error details |
| Repeated failure/recovery | Retry fails then succeeds | Keep last success until recovery; new value/time, no Stale after success | Per-row isolation |
| Pending | One slow refresh, duplicate activation | Selected control pending/disabled; other controls usable | No duplicate request |
| Lost authority | Member or demoted admin invokes action | Server denies before reader runs | Never return privileged data |

</intent-contract>

## Code Map

- `src/app/(app)/admin/overview/page.tsx` — guarded server fanout of 9 readers producing 11 rows; pass initial results to client composition.
- `src/lib/overview-readers.ts` — reuse unchanged: readVersion, readDatabaseHealth, readStorageHealth, readUploadStorageBytes, readUserCounts, readTripCount, readDocumentCount, readFailedSignIns, readRecentAdminActions. count reader returns users/admins/pending; wrappers select one result. Existing real clock is deliberate.
- `src/lib/overview-metric.ts` — existing client-safe Metric union; do not replace it or persist stale state here.
- `src/components/arrivo/metric-row.tsx` (62 lines), `recent-admin-actions.tsx` (58 lines) — reuse row rendering, byte formatting and redacted list. Optional controls/stale slots can preserve existing call sites and selectors.
- `src/components/ui/button.tsx` — installed Base UI Button; use ghost/outline and h-11 override. Read bundled Next.js use-server docs before coding actions.
- `tests/e2e/steps/admin-overview.steps.ts` — metricRow helper, probe marker and unconditional After cleanup. Extend existing storage scenario for fault/retry to avoid two scenarios racing same marker; timestamp assertions must target checked times, not recent event times.
- `tests/e2e/feature-map.mjs` — map any new arrivo component and Overview actions to admin-overview.

## Tasks & Acceptance

**Execution:**

- [x] Tests first: `src/app/(app)/admin/overview/actions.test.ts` for every wrapper's admin guard, correct reader/result, denial before read and uncaught authorization failure. Then create `actions.ts` with separate async exported actions, no route revalidation.
- [x] Tests first: `src/components/arrivo/refreshable-metric.test.tsx` for matrix state transitions, zero/empty successes, rejected promises, repeated failure, recovery, pending and duplicate suppression; then implement `refreshable-metric.tsx` as small generic client controller used by all 11 rows. Explicit RefreshableMetricProps interface. Render callback is defined inside client composition, never passed across server/client boundary.
- [x] `src/components/arrivo/metric-row.test.tsx`, `recent-admin-actions.test.tsx` first: stale labeling, preserved time/value, optional controls, list privacy. Then add optional controls/stale props to matching components without changing existing rendering contracts.
- [x] Tests first: `src/components/arrivo/overview-metrics.test.tsx` verifies all 11 labels/action connections and independent user-count refresh; then `overview-metrics.tsx` client composition with explicit OverviewMetricsProps, using controller and existing rows. Keep UI files under 250 lines. If component design can avoid an extra abstraction while preserving these tests, record choice.
- [x] `tests/e2e/features/admin-overview.feature`, `tests/e2e/steps/admin-overview.steps.ts` — extend current storage scenario to assert initial Refresh, keyboard activation, unchanged other checked times, forced failed refresh retaining Healthy/time with Stale+Retry, repeated failure, recovery via Retry. Verify reload under active fault gives initial Unavailable+Retry and subsequent recovery. Await action completion before reload. Check target dimensions, pending announcement, 320px wrapping as practical without introducing shared fixtures. Reuse existing scenario-owned uploads and marker cleanup.
- [x] `src/app/(app)/admin/overview/page.tsx`, `tests/e2e/feature-map.mjs` — wire initial results and map new paths. Preserve member-denial scenario. Run targeted tests and affected E2E before parent final validator.

**Acceptance Criteria:**

- Given admin sees Overview, when refreshing any metric, then only selected row changes checked time while all other checked times remain unchanged.
- Given successful storage health, when probe fails during Refresh, then browser retains Healthy and original checked time labeled Stale with Retry; successful Retry clears Stale and advances time.
- Given initial probe failure, when Overview loads, then storage is Unavailable with Retry and no fabricated healthy result.
- Given keyboard use and narrow viewport, when operating Refresh/Retry, then controls have metric-specific names, visible focus, 44px minimum targets and readable wrapped content.
- Given member or lost admin authority, when invoking refresh actions, then no reader executes and no privileged value is returned.

## Implementation Notes

Full route: expected cross-layer change exceeds 100 lines and five files. Branch confirmed and created from feature integration branch. Baseline captured directly from git. Repository overrides workflow: parent alone runs final build-validator after review and targeted checks.

Implemented 11 guarded actions and independent refresh controllers, including count picks and redacted recent actions. Existing Metric/readers unchanged. Optional controls/Stale slots preserve rendering, bytes and timestamps. Base UI focusableWhenDisabled retains keyboard focus while suppressing pending activation. Browser fault flow uses existing marker ownership/cleanup and waits for action POSTs before reload.

83 targeted tests passed, including all matrix rows; TypeScript and touched-file lint passed. Initial affected E2E passed 12/12. Parent repeated targeted tests: 83/83. Quick review: no findings. Initial final validator lint/TypeScript/build passed; default-worker coverage had three failures in untouched dialog/MFA files (5740 passing), all 44 tests in those files passed in isolation. Initial final E2E passed 11/12, failing untouched account-menu Travel History role-navigation scenario. Retrying isolated coverage with four workers and affected E2E to assess reproducibility.

Final checks passed: coverage with four workers 5743/5743 (359 files), lines 97.4%, functions 96.93%, branches 92.72%; affected E2E 12/12. A second browser run had two untouched account-menu timing failures and the expanded Overview scenario exceeded its default 30-second total budget. Set only that long multi-cycle scenario to 60 seconds; no assertion waits, ordering, worker count, fixture sharing or runtime code changed. Full affected rerun passed. Final TypeScript and touched-step lint also passed. Production build generated 16 static pages; Overview remains dynamic. Next.js emitted no bundle-size totals.

## Plan Change Log

## Review Triage Log

Plan-reviewer (original request: implement ticket 5.6): scope PASS, architecture PASS, component PASS, accessibility PASS, test coverage PASS; 0 blocking, 0 warnings. All covered source edits have explicit colocated tests; browser flow extends existing probe scenario to avoid marker contention. Existing UI files are below 250 lines. Generic controller immediately serves all 11 rows, preserving reader contract and client/server boundary. Ready-for-development gate passed before setting in-progress.

### 2026-10-31 — Review pass

- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none. No patches, deferrals or rejections. Follow-up review recommendation: false.

## Verification

- `npx vitest run src/app/(app)/admin/overview/actions.test.ts src/components/arrivo/refreshable-metric.test.tsx src/components/arrivo/overview-metrics.test.tsx src/components/arrivo/metric-row.test.tsx src/components/arrivo/recent-admin-actions.test.tsx scripts/feature-map.test.mjs` (quote route path for shell) — pass, all matrix rows covered.
- `npm run test:e2e:affected` — affected suite passes. Never automatically run full E2E.
- Parent applies build-validator after final review fixes, with coverage and affected E2E separately, after lint/TypeScript/build.

## Auto Run Result

- Summary: all 11 Overview rows refresh independently through current-admin-guarded server actions. Initial failures offer Retry; failed refreshes preserve last successful value/time with Stale; successful Retry clears stale state. Pending activation is suppressed with focus retained and polite announcements.
- Files: Overview actions and their tests; Overview server page wiring; new OverviewMetrics and RefreshableMetric components with colocated tests; optional controls/stale rendering in MetricRow and RecentAdminActions with tests; admin-overview browser feature/steps; feature map; this plan.
- Review: quick lens, 0 findings, 0 patches/deferred/rejected findings. Follow-up recommendation false. Parent inspected final scenario-budget adjustment.
- Verification: 83 targeted tests, 44 isolated existing tests, full 5743-test coverage, lint, TypeScript, production build and 12 affected browser scenarios passed. Browser coverage proves independent timestamps, keyboard/focus/44px controls, pending state, 320px/200% text, repeated stale failures, initial Unavailable and Retry recovery. Action tests prove authorization denial before reading for every wrapper.
- Residual risk: existing dialog/MFA and account-menu timing failures appeared under default load and passed reruns. No runtime data model or reader contract changes. No push performed.
