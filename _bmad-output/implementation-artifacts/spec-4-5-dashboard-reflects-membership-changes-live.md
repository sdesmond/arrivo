---
title: "Dashboard Reflects Membership Changes Live"
type: "feature"
created: "2026-09-05"
status: "done"
review_loop_iteration: 1
context: []
baseline_commit: "12d5eb4c375a6bd0dba343bc44db8197f39464b0"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The dashboard trip list is a one-shot server fetch passed as `initialEntries`; a contributor role change or removal only reflects after a manual reload. The personal SSE channel (`/api/users/me/events`) already delivers `membership-changed`/`membership-removed`, but the only dashboard-side consumer is the 4.4 revocation modal, which reacts solely to self-removal.

**Approach:** Add a dashboard live-refresh consumer on the shared personal channel that calls `router.refresh()` on `membership-changed` (re-running `listTripsForUser`, so roles, budget visibility, and the trip set come back fresh together). Extend `saveContributorChanges` so a role change reaches the role-changed user's personal channel — closing the "dashboard without the trip page open" gap for role changes.

## Boundaries & Constraints

**Always:**
- New `src/lib/use-dashboard-live-refresh.ts` (`"use client"`): calls `useLiveSync()` with the default personal-channel URL. Triggers `router.refresh()` exactly like `use-trip-live-refresh.ts` does — microtask-deferred monotonic generation guard (burst collapse + unmount invalidation), first Connected swallowed, each subsequent Connected triggers one refresh (reconnect resync). Refresh map = `LiveSyncEventType.MembershipChanged` only.
- Mount the hook once at the top of `TripsPageClient` (`src/app/(app)/trips/page-client.tsx`) — one mount covers desktop and mobile layouts.
- `saveContributorChanges` (`src/app/(app)/trips/actions.ts`): in the batch loop, record the `userId` of each role-changed target (`type: "role"`, `target.userId` non-null). After the existing removed-user block, call `publishUserEvent(userId, { type: LiveSyncEventType.MembershipChanged, tripId })` for each role-changed user. Leave removed-user `membership-removed` + `removeTripSubscribersForUser` + trip-channel `membership-changed` untouched.
- Tests-first: new `src/lib/use-dashboard-live-refresh.test.ts`; extend `src/app/(app)/trips/actions.test.ts` (saveContributorChanges personal-publish assertions); extend `src/app/(app)/trips/page-client.component.test.tsx` (hook is mounted). E2E: new `tests/e2e/features/dashboard-live-sync.feature` + step file, tag `@feat:dashboard-live-sync`, registered in `tests/e2e/feature-map.mjs` mapping `src/lib/use-dashboard-live-refresh.ts`.
- The hook joins the existing ref-counted personal EventSource (same default URL as `SyncStatusIndicator`/`ContributorRevocationModal`) — no new connection, per the 4.4 connection-cap lesson.

**Ask First:**
- None anticipated; if a producer/consumer seam differs from the Code Map during execution, HALT.

**Never:**
- No dashboard reaction to `membership-removed` — the 4.4 app-shell revocation modal owns the removal UX (sole surface → OK → push+refresh).
- No `trip-deleted` handling on the dashboard and no `deleteTrip` producer change — deletions stay `revalidatePath`-driven (contributors see a deleted trip drop on their next reload). Epic 4.5 covers role/removal only.
- No invitation-surface changes (`inviteContributor`/`rescindInvitation`/`dismissInvitation` still publish nothing; pending-invitations stays server-action/revalidate-driven).
- No changes to `use-live-sync.ts` internals, SSE route wire format, pub-sub API, or `use-trip-live-refresh.ts`.
- No client-side trip-list store or `accessRole` mutation — refresh re-runs the authoritative server query.

## I/O & Edge-Case Matrix

| Scenario   | Input / State | Expected Output / Behavior | Error Handling |
| ---------- | ------------- | -------------------------- | -------------- |
| ROLE_CHANGE | `membership-changed {tripId}` on personal channel while contributor is on the dashboard | exactly one `router.refresh()`; card menu gates re-render for the new role (Edit/Delete per `trip.accessRole`; viewer budget already stripped server-side) | N/A |
| REMOVED_SELF | `membership-removed` naming the user | hook ignores it (4.4 modal owns removal); after modal OK → push+refresh → trip gone | N/A |
| BURST | two membership events land in one tick, or an event during reconnect | single `router.refresh()` (generation guard) | N/A |
| OTHER_EVENT | `itinerary-changed`, `membership-removed`, heartbeat, unknown type | ignored — no refresh | N/A |
| RECONNECT | channel drops then reconnects | second Connected triggers one refresh (missed-event recovery) | N/A |
| OWN_ACTION | I change roles via my own session | my server action already revalidates; the event-driven refresh collapses harmlessly | N/A |

</frozen-after-approval>

## Code Map

- `src/lib/use-trip-live-refresh.ts:9-65` -- the exact pattern to clone (refresh map L9-12, generation guard L33-40, reconnect resync L57-65); the new hook drops the `tripId` plumbing, uses the default URL, and reacts to `membership-changed` only.
- `src/lib/use-live-sync.ts:127` -- `useLiveSync(url = "/api/users/me/events", onLiveSyncEvent?)`; shared per-URL registry L40-119 (read-only) so the dashboard joins the channel already held by the app shell.
- `src/app/(app)/trips/page-client.tsx:39-40` -- mount `useDashboardLiveRefresh()` at the top of `TripsPageClient` alongside `useTripsPageHandlers`.
- `src/app/(app)/trips/actions.ts:983-1026` -- `saveContributorChanges` batch loop: role branch L1011-1020 (`target.userId` guard pattern at L1023); add role-changed collection here. Publish block L1035-1049 (removed-user `membership-removed` + force-unsubscribe) — add the role-changed `publishUserEvent` loop after it, before the trip-channel publish L1054.
- `src/lib/trip-events.ts:53` -- `publishUserEvent` (read-only). `src/data/types.ts:678-704` -- event union: `membership-changed {tripId}` (read-only, unchanged).
- `src/lib/queries.ts:129-251` -- `listTripsForUser` (read-only; the refetch source that re-derives `accessRole` and strips viewer budget via `db-mappers.ts:61-86`).
- `src/components/packt/trip-card.tsx:27-28,75,87` + `trips-desktop-layout.tsx:173,185` + `now-card.tsx:44-45` -- role-gated menu surfaces the E2E asserts flip after refresh.
- Tests to mirror: `src/lib/use-trip-live-refresh.test.ts` (MockEventSource, generation/reconnect); `src/app/(app)/trips/actions.test.ts:285-421` (saveContributorChanges publishes — role-only, remove-only, mixed batches); `src/app/(app)/trips/page-client.component.test.tsx:145+`.
- E2E reuse: `tests/e2e/live-sync.ts:5-10` (`waitForLiveSyncResponse`), `tests/e2e/steps/revocation-modal.steps.ts:72-123` (`seedCollaborator` + `openSecondSession`), `tests/e2e/steps/trip-live-refresh.steps.ts:60-93,112` (contributor seed + demote UI + assertion). New `dashboard-live-sync` entry in `tests/e2e/feature-map.mjs` (FEATURE_MAP, ~L188-194 neighborhood) mapping `src/lib/use-dashboard-live-refresh.ts`; `trips/actions.ts` + `page-client.tsx` are already SHARED (L254-255).

## Tasks & Acceptance

**Execution:**

- [x] `src/lib/use-dashboard-live-refresh.ts` + `src/lib/use-dashboard-live-refresh.test.ts` -- NEW hook: refresh on `membership-changed`, ignore `membership-removed`/`itinerary-changed`/heartbeat, generation-guard bursts, reconnect resync, unmount invalidation, joins default personal URL -- the client half (I/O rows 1,3-6).
- [x] `src/app/(app)/trips/page-client.tsx` -- mount `useDashboardLiveRefresh()` -- wiring.
- [x] `src/app/(app)/trips/actions.ts` -- `saveContributorChanges` personal `membership-changed` for role-changed users -- the producer half (I/O row 1).
- [x] `src/app/(app)/trips/actions.test.ts` -- extend `saveContributorChanges` suite: role-only batch publishes `membership-changed` to the role-changed user's personal channel; remove-only batch publishes `membership-removed` only; mixed batch does both -- producer coverage.
- [x] `src/app/(app)/trips/page-client.component.test.tsx` -- "mounts dashboard live refresh" (mirror the trip-page `useTripLiveRefresh` mounting test) -- wiring coverage.
- [x] `tests/e2e/features/dashboard-live-sync.feature` + `tests/e2e/steps/dashboard-live-sync.steps.ts` + `feature-map.mjs` entry -- Scenario A: contributor's dashboard loses the Edit menu live when a manager demotes editor→viewer. Scenario B: contributor on the dashboard is removed → 4.4 revocation modal → OK → trip absent -- user-facing ACs + the 4.4 "removal while not on a trip page" gap.

**Acceptance Criteria:**

- Given a contributor's dashboard is open with the personal channel connected, when a manager changes that contributor's role, then the dashboard reflects the new role's gates with no reload (card menu and viewer budget visibility come from the refreshed server fetch).
- Given the same state, when a manager removes the contributor, then the 4.4 revocation modal appears and after OK the trip is gone from the dashboard.
- Given any `itinerary-changed`, `membership-removed`, or heartbeat frame, when it arrives on the personal channel, then no dashboard refresh fires.
- Given a burst of membership events, when they arrive in one tick, then exactly one `router.refresh()` fires; a reconnect after a drop triggers one further refresh.

### Review Findings

- [x] [Review][Patch] Extract a shared `useLiveRefresh(url, shouldRefresh)` and rewrite both hooks over it [src/lib/use-dashboard-live-refresh.ts, src/lib/use-trip-live-refresh.ts] — `use-dashboard-live-refresh.ts` duplicates the generation counter, `triggerRefresh`, `hasConnectedOnceRef`, the unmount-invalidation effect and the same eslint-disable from `use-trip-live-refresh.ts:28-65`; only the URL and the event predicate differ, and the trip hook's `tripId`-reset branch is already a divergence. **Decision (Spencer, 2026-09-05): extract now** — this knowingly overrides the spec's "No changes to `use-trip-live-refresh.ts`" Never entry; see Spec Change Log.
- [x] [Review][Patch] E2E Scenario A's decisive assertion is a false green — passes without any live refresh [tests/e2e/steps/dashboard-live-sync.steps.ts:78-91] — the `toPass` body clicks "Trip options" then immediately asserts `getByRole("menuitem", { name: "Edit trip" }).toHaveCount(0)`. `toHaveCount(0)` is satisfied before the dropdown portal mounts, so attempt 1 always passes — and for a viewer the open menu has no items at all (`trip-card.tsx:75-99`), so the assertion can never distinguish "menu not open yet" from "menu open, Edit gone". 4.3's analogue is only safe because the Budget tab is persistently rendered (`trip-live-refresh.steps.ts:109-115`). This is the sole E2E proof of AC1. Fix: wait for the open menu (`getByRole("menu")` visible) before asserting the item's absence.
- [x] [Review][Patch] Feature-map entry demotes a `page-client`-mounted `src/lib` hook out of the full-suite tier [tests/e2e/feature-map.mjs:188] — FEATURE_MAP is matched before SHARED_GLOBS, so a hook-only edit now runs two dashboard scenarios instead of the full suite `src/lib/**` would force. `feature-map.mjs:120-124` documents exactly this hazard and deliberately leaves `use-bfcache-refresh.ts` unmapped for the same reason (mounted in a page-client, can move every feature on that route). Every scenario lands on `/trips`, so this hook is on every scenario's path. Fix: `entry("dashboard-live-sync", [])` — the entry stays (required by `scripts/feature-map.test.mjs`) and auto-covers its own feature/step files, while the hook stays SHARED. Also resolves the entry's odd placement between `trip-delete` and `trip-live-refresh`.
- [x] [Review][Patch] The "no new connection — joins the shared personal channel" constraint has no test [src/lib/use-dashboard-live-refresh.test.ts:47-52] — the suite asserts `MockEventSource.instances` has length 1 with only this hook mounted, which holds equally if the hook opened its own dedicated EventSource. The 4.4 connection-cap lesson is the spec's explicit Always constraint and is the one behavior left unasserted. Fix: mount a second personal-channel consumer (`useLiveSync()`) first, then the hook, and assert one instance plus no refresh when adopting an already-Connected channel.
- [x] [Review][Patch] Hook ships without the doc comment that explains its own machinery [src/lib/use-dashboard-live-refresh.ts:1-45] — `use-trip-live-refresh.ts:14-27` carries the rationale for the microtask deferral and monotonic generation counter, and the clone kept the `eslint-disable` comment that points at reasoning no longer present anywhere in the file. Nothing records why `membership-removed` / `trip-deleted` are deliberately not handled (the 4.4 modal owns removal) — the next reader reads the omission as an oversight.
- [x] [Review][Patch] Role-change branch with an unlinked collaborator (`target.userId === null`) is untested [src/app/(app)/trips/actions.test.ts:422-446] — the existing null-`userId` test covers only the *removal* path. Nothing asserts a role change on an invited-but-unregistered row skips `publishUserEvent`. `src/app/**` is coverage-excluded, so no threshold catches it.
- [x] [Review][Defer] `MockEventSource` / `currentSource` / `flushMicrotasks` copied into a fourth test file [src/lib/use-dashboard-live-refresh.test.ts:15-51] — deferred, pre-existing duplication (also in `use-trip-live-refresh.test.ts`, `use-live-sync.test.ts`, `contributor-revocation-modal.test.tsx`).
- [x] [Review][Defer] E2E step helpers re-implemented rather than extracted per the Code Map [tests/e2e/steps/dashboard-live-sync.steps.ts:33-85] — deferred, pre-existing; `seedCollaborator` / `openSecondSession` / sign-in-second-context are module-local in two other step files, so sharing them is a three-file extraction beyond this story.
- [x] [Review][Defer] `15_000` repeated as a bare assertion timeout in three steps [tests/e2e/steps/dashboard-live-sync.steps.ts:88,111,124] — deferred, pre-existing; `tests/e2e/live-sync.ts` already owns `LIVE_SYNC_READY_TIMEOUT_MS` and should gain an assertion-timeout constant.
- [x] [Review][Defer] `saveContributorChanges` still revalidates only `/trips/${tripId}`, unlike `acceptInvitation`/`declineInvitation` [src/app/(app)/trips/actions.ts:1067] — deferred, pre-existing; verified no staleness consequence (no `unstable_cache`/`force-cache` under `src/`, and `/trips` is dynamic via `cookies()`), so this is asymmetry only.
- [x] [Review][Defer] Trip edit sheet can stay open with `trip=null` after a refresh drops its entry [src/app/(app)/trips/page-client.tsx:70-74] — deferred, pre-existing shape (`open` keys off `editingTrip`, `trip` off `editingEntry`). Only reachable on removal/deletion, and removal is already behind the blocking 4.4 modal.

## Spec Change Log

- 2026-09-05 (code review, approved by Spencer): the Never entry "No changes to `use-live-sync.ts` internals, SSE route wire format, pub-sub API, or `use-trip-live-refresh.ts`" is relaxed for `use-trip-live-refresh.ts` only. Both refresh hooks are rewritten over a new shared `useLiveRefresh(url, shouldRefresh)` in `src/lib/`, to stop the clone drifting (the trip hook's `tripId`-reset branch already has no counterpart in the copy). `use-live-sync.ts`, the SSE routes and the pub-sub API remain untouched.

## Design Notes

- **Why the refresh map excludes `membership-removed`:** the 4.4 modal is the removal UX wherever it fires, including on the dashboard; refreshing on arrival would only repaint a list hidden behind the modal and double-refresh on OK. The dashboard client reacts to `membership-changed` only; `membership-removed` keeps flowing only to the modal.
- **Why the producer fan-out is needed:** 4.3's `membership-changed` publish is trip-channel-only (`saveContributorChanges` L1054), which only helps sessions that have the trip page open. A contributor parked on the dashboard needs the event on their personal channel to learn about a role change — that is the "dashboard reflects membership changes live without the trip page open" contract (epic AD-3).
- **No new connection:** the new hook joins the ref-counted personal EventSource (same default URL), staying inside the 4.4 connection-cap constraint.

## Verification

**Commands:**

- `npx vitest run src/lib/use-dashboard-live-refresh.test.ts src/app/(app)/trips/actions.test.ts "src/app/(app)/trips/page-client.component.test.tsx"` -- expected: pass.
- `npm run test:coverage` -- expected: ≥95% lines/functions, ≥90% branches (new `src/lib` file included; `src/app/**` excluded).
- `npm run lint` -- expected: clean. `npx tsc --noEmit` -- expected: clean.
- `npm run test:e2e:affected` -- expected: full suite (`src/lib/**`, `trips/actions.ts`, `page-client.tsx` all SHARED) with the new `dashboard-live-sync` scenarios green.
