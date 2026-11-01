---
title: "Activity filters and reader states"
type: "feature"
ticket: "7"
created: "2026-10-26"
status: done
baseline_revision: "0bd8d659871801fa013903ea47aad67f33573859"
route: "full"
route_source: "auto"
risk: "medium"
review: "quick"
review_source: "pinned"
lenses_ran: ["quick"]
review_loop_iteration: 0
followup_review_recommended: false
context:
  - "{project-root}/AGENTS.md"
  - "{project-root}/_bmad-output/initiative-self-hosted-administration/epic-activity-and-retention/epic-activity-and-retention.md"
  - "{project-root}/_bmad-output/initiative-self-hosted-administration/epic-activity-and-retention/activity-producer-inventory.md"
warnings: [oversized]
deferred:
  - summary: >-
      Read-service SQL (keyset, overlap, actor grouping) has no real-Postgres Vitest; the repo's real-DB coverage is Playwright.
    evidence: |-
      Unit test fakes the select builder; seeded Playwright scenarios exercise equal-timestamp paging, overlap and actor filters against arrivo_e2e.
    location: >-
      src/lib/activity-queries.test.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** `/admin/activity` shows only the newest 100 rows in UTC with no filters, paging, ongoing-summary cue, refresh or failure states, so an admin cannot audit history.

**Approach:** Replace the fixed list with a keyset-paged, filterable read service and a client viewer that loads through an admin-rechecking server action, with local-timezone times, Refresh, and loading/empty/error/stale/lost-authority states.

## Boundaries & Constraints

**Always:** Recheck current DB admin authority on every read (page and action). Order by `endedAt desc, id desc`; cursor is the last row's `(endedAt, id)`, opaque and validated. Date filter selects rows whose `[startedAt, endedAt]` overlaps the selected range (inclusive). Actor filter matches stable `actorId`, labelled by the latest snapshot username, so renamed and deleted accounts stay filterable. Ongoing = batched type with real-clock `now - endedAt < BATCH_GAP_MS` (not `getNow()`). Rows expose only existing safe fields plus `startedAt`/`ongoing`; account IDs appear only as actor-filter option values. Errors, ARIA text and DOM carry no private trip content, secrets or raw error text. Interactive targets at least 44px; labeled fields; existing shadcn Select/Button/Table/Input; keyboard-scrollable labeled table overflow stays.

**Never:** Retention, cleanup or settings UI (2.8); new columns or migrations; live feed, row expansion, sorting controls, bulk selection; new producers; `any`; second DB client; changing batching, recording or the sign-in/trip contracts.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Pagination across ties | More than one page, equal `endedAt` on page boundary | Every row once, none repeated or skipped, ID tie-break | Malformed cursor: reads first page |
| Date overlap | Batch 09:50-10:05, range 10:00-11:00, and 11:00-12:00 | Row appears in both ranges; rows fully outside excluded | Invalid or inverted range: no rows shown, field error text |
| Actor filter | Account renamed, or deleted | Rows under the old and new snapshot match one option; deleted still listed | Unknown actor ID: empty result |
| Type filter | One action chosen | Only that action's rows | Unknown value ignored as no filter |
| Ongoing | Trip-updated row ended under 10 min ago | Range start to latest plus visible "Ongoing" text | n/a |
| Identity | Null actor or unrecorded target | "Unknown" / "Unavailable" as today, never fabricated | n/a |
| Refresh fails | Prior page loaded; action throws or offline | Prior rows remain, `role="alert"` stale notice with loaded-at time and Retry | Generic text only |
| Authority lost | Action finds viewer no longer admin | Rows and filters removed; "You no longer have administrator access." | No content leaked |
| Filters change | New filters/page | Loading status (`aria-busy`), previous rows not shown as current; URL keeps filters and cursor | See stale row |
| No data | No rows ever / none match filters | "No activity recorded yet." / "No activity matches these filters." with Clear filters | n/a |

</intent-contract>

## Code Map

- `src/lib/activity-queries.ts` -- `listRecentActivity` (limit 100, used only by `admin/activity/page.tsx` and its test). Replace with `readActivityPage(database, viewerId, query, now?)` returning `{status:"forbidden"} | {status:"ok", events, nextCursor?, actors, loadedAt}`. Take an injected `Pick<typeof db,"select">` like `activity-batches.ts` so real-Postgres tests bind an isolated schema. Keep the `KNOWN_TYPES` filter and the target-ID privacy rule. Actor options: distinct `actorId` with latest username, most recent first, bounded (200).
- `src/db/schema.ts:577` -- `activityEvents`; indexes `(endedAt desc, id desc)`, `actorId`, `type` already support the query. Do not change.
- `src/lib/activity-batches.ts` -- `BATCH_GAP_MS`, `BATCHED_TYPES`: reuse for ongoing.
- `src/data/types.ts:56-117` -- add `ActivityQuery`, `ActivityPage`, `ActivityActorOption`; extend `ActivityEventSummary` with optional `startedAt`, `ongoing`.
- `src/components/arrivo/instance-activity.tsx` -- local `EVENT_LABELS`, `formatUtc`, table. Move labels to client-safe `src/lib/activity-labels.ts` (filter options reuse it). Table takes `timeZone`; batched rows show start-end range and Ongoing text.
- `src/app/(app)/admin/activity/page.tsx` -- server page: `requireAdmin()`, parse `searchParams` (`actor`, `type`, `from`, `to` as UTC ISO instants, `cursor`), SSR first read, `notFound()` on forbidden, render the viewer.
- `src/app/(app)/admin/activity/actions.ts` (new) -- `loadActivityPage(query)`: `requireUser()`, read service, return `forbidden`/`unavailable` statuses instead of throwing; catch errors, no message passthrough.
- `src/components/arrivo/instance-activity-viewer.tsx` (new, client) -- owns result/loading/stale state, Refresh, Older/Newer/Newest, updates URL with `window.history.replaceState`. `activity-filters.tsx` (new, client) -- actor and action Selects, From/To `Input type="date"`, Clear filters. Times via `useSyncExternalStore` (server snapshot "UTC", client `Intl` zone) and filter form keyed on zone so date defaults match local days; From = local start-of-day instant, To = local end-of-day instant.
- `src/components/ui/{select,input,button,table}.tsx` -- reuse. `tests/e2e/feature-map.mjs` (`instance-activity` entry ~39-66) -- register new sources/helpers. `tests/e2e/steps/instance-activity.steps.ts`, `activity-batch-fixture.ts` -- fixture patterns; "the viewport is 375 by 812" step exists in `day-planning.steps.ts`.
- Read `node_modules/next/dist/docs/` guidance on server actions and `useSearchParams`/history integration before writing Next code.

## Tasks & Acceptance

**Execution:**

- [ ] `src/lib/activity-queries.test.ts`, `src/lib/activity-labels.test.ts`, `src/components/arrivo/instance-activity.test.tsx`, `instance-activity-viewer.test.tsx`, `activity-filters.test.tsx`, `src/app/(app)/admin/activity/actions.test.ts` -- write first -- cover matrix rows (cursor, overlap bounds, actor/type, ongoing, forbidden, unavailable, stale, loading, empty, Clear filters, keyboard operation of selects, focus kept after load)
- [ ] `src/lib/activity-queries.ts` (+ real-Postgres test beside `activity-batches.test.ts` pattern) -- keyset read, filters, actors, ongoing -- equal timestamps and overlapping batches proven against real rows
- [ ] `src/data/types.ts`, `src/lib/activity-labels.ts` -- shared contract types and labels
- [ ] `src/app/(app)/admin/activity/{page.tsx,actions.ts}` -- SSR from URL; action with authority recheck and safe failure statuses
- [ ] `src/components/arrivo/{instance-activity,instance-activity-viewer,activity-filters}.tsx` -- table timezone/range/ongoing; viewer states; filter form; 44px targets, labels, `aria-live`/`role` on states
- [ ] `tests/e2e/features/instance-activity.feature`, `tests/e2e/steps/instance-activity.steps.ts`, scenario-owned seed helper `tests/e2e/activity-seed.ts`, `tests/e2e/feature-map.mjs` -- desktop and 375px scenarios: equal-timestamp pagination, filters preserved across reload/page, overlap, renamed/deleted identity, unknown/unavailable text, keyboard-scrollable narrow table, no private text in DOM; await action POST before reload where mutating

**Acceptance Criteria:**

- Given more rows than one page share timestamps, when an admin pages Older and Newer, then each row appears exactly once in latest-first order and filters persist after reload.
- Given an ongoing batch overlapping the chosen dates, when filtered and refreshed, then its range, Ongoing text and order update.
- Given a refresh fails or admin authority is removed, when the viewer updates, then stale labeled rows or the no-access state show with no private data.
- Given a narrow viewport, when the table overflows, then it scrolls by keyboard inside its labeled region without page-level horizontal scroll.

## Implementation Notes

## Plan Change Log

## Review Triage Log

### 2026-10-26 — Review pass

- verdicts: 8 findings — high 0, medium 1, low 3, false 4, maybe-false 0
- findings:
  - `[medium]` `patch` Retry/Refresh after failed Older/Newer replayed the new query with the old cursor stack — `requestedNewerCursors` now travels with `requested`; regression test added.
  - `[low]` `reject` Filters show the unapplied query after a failed filter change — Retry replays that query and the stale alert names the old load time; fix would add state.
  - `[low]` `defer` No real-Postgres Vitest for the read service — E2E covers the SQL against a real DB; deferred.
  - `[false]` `reject` Actor options cap of 200 — the plan specifies the bound; out-of-cap URL actors still filter.
  - `[false]` `reject` Empty-string actorId handling — reviewer found no bug.
  - `[low]` `reject` SSR DB failure reaches the error boundary — plan scopes the unavailable state to action loads; default Next behavior.
  - `[false]` `reject` Shared After hook / random seed minute — no-op without seeding; no collision shown.
  - `[false]` `reject` Line-ending churn in activity-batches files — `git diff` shows no content change.

## Design Notes

Cursor: base64url of `endedAt.toISOString()|id`; predicate `endedAt < c OR (endedAt = c AND id < cid)`; fetch page size + 1 to learn whether Older exists. Newer uses a client-held cursor stack; after a reload only Newest is offered. Postgres timestamps written by JS are millisecond precision, so ISO round-trips exactly. Rows extended by batching between page loads may move; Refresh re-reads from the current cursor.

## Verification

**Commands:**

- `npx vitest run src/lib/activity-queries src/lib/activity-labels src/components/arrivo/instance-activity src/components/arrivo/activity-filters "src/app/(app)/admin/activity"` -- expected: pass
- `npm run test:e2e:affected -- --grep=@feat:instance-activity` -- expected: filters, paging, mobile scenarios and existing Activity scenarios pass
- Parent final `build-validator` after review; no schema change, so `npm run db:generate` shows no drift

## Auto Run Result

- Summary: `/admin/activity` now has keyset paging, actor/action/date filters with interval overlap, local-timezone times, ongoing-summary text, Refresh, and loading/empty/stale/lost-authority states.
- Files changed: `src/lib/activity-queries.ts`, `activity-labels.ts`, `activity-dates.ts`, `src/data/types.ts`, `admin/activity/{page,actions}.ts`, `instance-activity.tsx`, new `activity-filters.tsx` and `instance-activity-viewer.tsx`, their tests, `tests/e2e/activity-seed.ts`, instance-activity feature/steps, feature map, producer inventory.
- Review: patches applied 1 (medium); deferred 1; rejected 6 (reasons in triage log). Follow-up review recommended: false.
- Verification: ESLint, tsc PASS; coverage PASS (307 files, 4,931 tests; lines 97.1%, functions 96.87%, branches 91.92%); affected E2E PASS (342); production build PASS.
- Residual risks: actor dropdown capped at 200 recent accounts; Newer unavailable after reload (Newest only); no migrations or operator steps.
