---
title: "Revocation Modal on Self-targeted Removal"
type: "feature"
created: "2026-09-05"
status: "done"
review_loop_iteration: 1
context: []
baseline_commit: "4baad00624411e8d5eb5f9c064dca082577313f8"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A contributor removed from a trip is never told. The server already publishes `membership-removed` to the removed user's personal SSE channel and force-closes their trip-channel subscriber (4-1/4-3), but no client consumes that event — a removed contributor keeps staring at a trip they can no longer access until a manual navigation re-runs `getTripDetail` → `assertTripAccess()` → `notFound()`.

**Approach:** Mount a global `ContributorRevocationModal` in the app shell that consumes the personal channel (`/api/users/me/events`). On a `membership-removed` naming the signed-in user, it renders a non-dismissible Base UI `AlertDialog` that names the trip and the removing manager from the event payload fields only (never a refetch — `assertTripAccess` would reject one), with a single OK action that navigates to `/trips`. A module-level revocation ticket lets the trip page force-close its open dialogs (staged changes discarded) and a `pageshow`/bfcache handler re-runs `assertTripAccess` so Back or restore can't reopen the trip.

## Boundaries & Constraints

**Always:**
- New `src/components/packt/contributor-revocation-modal.tsx` (`"use client"`): calls `useLiveSync()` with its default personal-channel URL plus an event callback; renders `AlertDialog` from `@/components/ui/alert-dialog` — no backdrop/Esc dismiss (Base UI `AlertDialog` requires an explicit action) and no Cancel/close affordance, single OK action only. OK → `router.push("/trips")` and clears the ticket.
- Accept a `userId` prop; only react when `event.removedUserId === userId`. Mount in `(app)/layout.tsx` next to `<SyncStatusIndicator/>`, passing `session.id!` (the layout already resolves `requireUser()`).
- New client store `src/lib/revocation-ticket.ts`: module-level `LiveSyncEvent | null` with `getRevocationTicket()`, `subscribeRevocation()`, `publishRevocationTicket()`, `clearRevocationTicket()`; consumed via `useSyncExternalStore` (stable `getSnapshot`). The modal publishes on self-targeted removal and clears on OK/unmount.
- Trip page (`src/app/(app)/trips/[tripId]/page-client.tsx`): subscribe to the ticket store; when `ticket.tripId === trip.id`, force-close `sharingTrip`/`editingTrip` and transient dialog state (`pendingTripPatch`, `tripDateConfirmation`) — staged changes are discarded because `TripShareDialog` unmounts and is keyed by `tripId`.
- New `src/lib/use-bfcache-refresh.ts` (client hook): `pageshow` listener; when `event.persisted === true`, call `router.refresh()` once so `getTripDetail` → `assertTripAccess` re-runs — a bfcache restoration cannot bypass the access check. Mount once in `page-client.tsx`.
- Short-circuit: the removed user's trip-channel subscriber is already force-unsubscribed server-side (`removeTripSubscribersForUser` in `trips/actions.ts:1047`), so no further trip events can arrive; the trip page's existing generation guard covers branded triggers. No stale response can repaint revoked content over the modal — it is the sole top surface and OK leaves the page.
- Tests-first: colocated `contributor-revocation-modal.test.tsx`, `revocation-ticket.test.ts`, `use-bfcache-refresh.test.ts`; E2E `tests/e2e/features/revocation-modal.feature` + `tests/e2e/steps/revocation-modal.steps.ts`, tag `@feat:revocation-modal`, registered in `feature-map.mjs`.
- Existing conventions: tokens only, icons `strokeWidth={1.5}`, no new dependencies; `src/data/types.ts` unchanged (`LiveSyncEvent.MembershipRemoved` already carries the payload).

**Ask First:**
- ~~Two `EventSource` connections to the same `/api/users/me/events` personal channel... Functionally harmless~~ — **renegotiated 2026-09-05**: confirmed NOT harmless. With a trip page open in two tabs, two personal-channel connections per tab plus one trip-channel connection per tab reaches 6 concurrent `EventSource` connections to the same origin — exactly Chrome's HTTP/1.1 per-host connection cap — starving all other requests (server actions, navigations) of a socket indefinitely. See Spec Change Log.

**Never:**
- No server/action changes — the publish + force-unsubscribe producer in `trips/actions.ts` is out of scope (already shipped in 4-3).
- No changes to pub-sub API, SSE routes wire format, or `use-trip-live-refresh.ts`'s refresh map (stays `itinerary-changed`/`membership-changed` only). `use-live-sync.ts`'s internals may share one `EventSource` per URL across consumers (see Spec Change Log) — its public `useLiveSync(url?, callback?)` signature and per-consumer event/status semantics are unchanged.
- No dashboard trip-list live update — that is Story 4.5.
- No client-side route guard as the access backstop — the trip page must remain re-gated server-side by `assertTripAccess()`'s `notFound()`.
- No polling/reconnect logic for revocation; dead-channel behavior is already handled by the `use-live-sync` watchdog → offline indicator (AC's dead-channel item is verification-only).

## I/O & Edge-Case Matrix

| Scenario   | Input / State | Expected Output / Behavior | Error Handling |
| ---------- | ------------- | -------------------------- | -------------- |
| SELF_REMOVAL | `membership-removed` with `removedUserId === userId` on personal channel | modal renders immediately naming trip + manager (`tripName`/`removedByName`/`removedByEmail`); ticket published | no refetch ever — payload only |
| OTHER_REMOVAL | `removedUserId !== userId` (defensive) | ignored — no modal, no ticket | N/A |
| OK | OK clicked | ticket cleared; `router.push("/trips")` | N/A |
| DIALOG_OPEN | ticket for an open trip arrives while share dialog has staged changes | all trip-page dialogs force-closed (staged discarded via unmount); revocation modal is the sole surface | N/A |
| BACK | browser Back to the revoked trip | fresh navigation → `getTripDetail` → `assertTripAccess` → existing `notFound()` | no reopen |
| BFCACHE | `pageshow` with `event.persisted === true` | `router.refresh()` re-runs `assertTripAccess` → `notFound()` if removed | existing not-found boundary |
| DEAD_CHANNEL | no heartbeat beyond interval + grace | watchdog sets offline (existing) — access re-verified on next navigation | N/A |

</frozen-after-approval>

## Code Map

- `src/components/packt/contributor-revocation-modal.tsx` -- NEW; personal-channel consumer via `useLiveSync`; `AlertDialog` with single OK; publishes/clears the ticket; OK → `/trips`.
- `src/lib/revocation-ticket.ts` -- NEW; `useSyncExternalStore`-backed module store.
- `src/lib/use-bfcache-refresh.ts` -- NEW; `pageshow.persisted` → `router.refresh()`.
- `src/app/(app)/layout.tsx:8-32` -- mount `<ContributorRevocationModal userId={session.id!}/>` beside `<SyncStatusIndicator/>` (L30).
- `src/app/(app)/trips/[tripId]/page-client.tsx:86-101,124-147` -- force-close dialogs on matching ticket; mount `use-bfcache-refresh`; existing popstate/tab-sync untouched.
- `src/lib/use-live-sync.ts` -- MODIFIED post-hoc (see Spec Change Log): now shares one `EventSource` per URL across all consumers via a ref-counted module-level registry, closing the multi-tab connection-exhaustion bug this story introduced. Public API (`useLiveSync(url?, callback?)`) unchanged.
- `src/app/api/users/me/events/route.ts`, `src/app/api/trips/[tripId]/events/route.ts` -- MODIFIED post-hoc (see Spec Change Log): flush an immediate heartbeat on connect instead of waiting for the first interval tick. Pre-existing bug from 4-1, unrelated to this story's own changes but fixed alongside them while diagnosing E2E flakiness.
- `src/data/types.ts:693-704` -- `LiveSyncEvent.MembershipRemoved` union member (verbatim): `removedUserId, tripId, tripName, removedByName, removedByEmail` — the consumed shape.
- `src/app/api/users/me/events/route.ts:13-50` -- read-only: the personal channel that delivers the event (gated `requireUser` only).
- `src/lib/trip-events.ts:53-66,115-127` -- read-only: `publishUserEvent` + `removeTripSubscribersForUser` — why the personal channel is the only carrier.
- `src/app/(app)/trips/actions.ts:1035-1049` -- read-only producer: publishes `membership-removed` then force-unsubscribes the removed user's trip channel.
- `src/components/ui/alert-dialog.tsx:9-11,125-158` -- reuse; `AlertDialogAction` only (no `AlertDialogCancel`); Base UI Root requires explicit confirmation.
- `tests/e2e/features/revocation-modal.feature` + `tests/e2e/steps/revocation-modal.steps.ts` + `tests/e2e/feature-map.mjs` -- NEW feature + registration (`@feat:revocation-modal` covering the modal component).
- `tests/e2e/scenario-fixture.ts` + `tests/e2e/e2e-seed-data.ts` -- reuse `scenario.materialize` / mother patterns for the second-session contributor (mirror `trip-live-refresh.steps.ts`).

## Tasks & Acceptance

**Execution:**

- [x] `src/lib/revocation-ticket.ts` + `src/lib/revocation-ticket.test.ts` -- NEW store (get/subscribe/publish/clear, unsubscribe, snapshot stability) -- the trip-page ↔ modal handshake.
- [x] `src/components/packt/contributor-revocation-modal.tsx` + `contributor-revocation-modal.test.tsx` -- NEW modal: personal-channel subscription, self-match gate, render (tripName + removedByName), single OK → push `/trips` + clear ticket; tests via MockEventSource emit -- the AC1/AC2/AC5 surface.
- [x] `src/lib/use-bfcache-refresh.ts` + `use-bfcache-refresh.test.ts` -- NEW hook: `pageshow` persisted → one `router.refresh()`; non-persisted/no-flag → no-op; unmount cleanup -- AC7 (bfcache).
- [x] `src/app/(app)/trips/[tripId]/page-client.tsx` -- subscribe to ticket; on matching `tripId` force-close `sharingTrip`/`editingTrip`/`pendingTripPatch`/`tripDateConfirmation`; mount `use-bfcache-refresh` -- AC3/AC4 force-close + AC7 wiring.
- [x] `src/app/(app)/layout.tsx` -- mount `<ContributorRevocationModal userId={session.id!}/>` -- AC1's "any authenticated page".
- [x] `tests/e2e/features/revocation-modal.feature` + `tests/e2e/steps/revocation-modal.steps.ts` + `tests/e2e/feature-map.mjs` -- Scenario A: contributor with the trip open is removed → modal names trip + manager, OK lands on `/trips`. Scenario B: manager with open share dialog (staged change) is removed → dialog force-closed, modal sole surface, OK → `/trips` -- user-facing AC1/2/4/5.

**Acceptance Criteria:**

- Given I'm viewing any authenticated page, when a `membership-removed` event naming my own `userId` arrives, then `contributor-revocation-modal.tsx` renders as a non-dismissible `AlertDialog` with a single OK action, naming the trip and the removing manager from the payload.
- Given an event names a different `userId`, when it arrives, then no modal or ticket is produced.
- Given another dialog (e.g. the share dialog with staged changes) is open when a self-targeted `membership-removed` arrives, then it is force-closed, its staged changes discarded, and the revocation modal is the sole open surface.
- Given a removal event is processed, then no further trip refetch/event processing can repaint revoked content — the trip channel is already closed server-side and the trip page force-closes its dialogs.
- Given the modal is showing, when I click OK, then I'm returned to `/trips`.
- Given browser Back or a bfcache restoration targets the revoked trip, then `assertTripAccess()`'s existing `notFound()` (fresh navigation or the `pageshow`-triggered refresh) still denies access.

### Review Findings

- [x] [Review][Patch] AC3's "sole open surface" only holds for the five page-client-owned states — the effect resets `sharingTrip`/`editingTrip`/`pendingTripPatch`/`pendingCurrencyChangeMode`/`tripDateConfirmation`, but every dialog whose open state lives in a child component (`cost-dialog`, `location-dialog`, `delete-event-dialog`, `add-doc-dialog`, `add-reservation-doc-dialog`, `delete-reservation-alert-dialog`, `doc-viewer`) stays mounted behind the revocation modal with staged edits intact. **Resolved 2026-09-05 — broaden:** key the tab subtree off the ticket so child-owned dialogs unmount too [src/app/(app)/trips/[tripId]/page-client.tsx:139-153]
- [x] [Review][Patch] A second `membership-removed` silently overwrites the first — `publishRevocationTicket` replaces `ticket` unconditionally, so a user removed from two trips in the same burst only ever learns about one. **Resolved 2026-09-05 — ignore-if-present:** first removal wins; the modal stays on that trip until OK clears the ticket [src/lib/revocation-ticket.ts:37-40]
- [x] [Review][Patch] E2E "names the trip / names me" assertions are not scoped to the modal — `getByText(trip.name).first()` matches the trip hero underneath the dialog; scope both to `getByRole("alertdialog")` [tests/e2e/steps/revocation-modal.steps.ts:44-50]
- [x] [Review][Patch] Remover-name assertion is conditional and silently skippable (`if (remover) {...}`) — throw when `scenario.currentUser` is unset, like the sibling helpers do [tests/e2e/steps/revocation-modal.steps.ts:46-48]
- [x] [Review][Patch] `page-client.test.tsx` has zero coverage of both new wirings — neither the revocation force-close effect nor `useBfcacheRefresh()` is asserted, and the file never mocks `@/lib/revocation-ticket`, so the effect body never executes; deleting `useBfcacheRefresh();` keeps every test green, and `src/app/**` is excluded from coverage thresholds. Mirror the existing `it("mounts live refresh for the trip")` pattern [src/app/(app)/trips/[tripId]/page-client.test.tsx]
- [x] [Review][Patch] `tests/e2e/server-action.ts` is registered nowhere — imported by packing-tab, template-items and trip-notes steps, but matches no `FEATURE_MAP` glob and no `SHARED_GLOBS` entry, so editing it triggers zero E2E; add it to the shared E2E harness list [tests/e2e/feature-map.mjs:279-286]
- [x] [Review][Patch] Adopting the shared helper weakened `template-items.steps.ts` from a hard failure to a silent 5s timeout — the old bare `waitForResponse` threw when the reorder POST never fired; the tolerant form exists for retrying keyboard-move no-ops, not for an always-mutating drag with no retry loop. Add a `required` option (and assert `response.ok()`) and use it at always-mutating sites [tests/e2e/server-action.ts:22; tests/e2e/steps/template-items.steps.ts:45]
- [x] [Review][Patch] Feature-map demotes `src/lib/revocation-ticket.ts` and `src/lib/use-bfcache-refresh.ts` out of the full-suite tier — `src/lib/**` is a `SHARED_GLOB` but `FEATURE_MAP` is checked first; `use-bfcache-refresh.ts` is mounted in `page-client.tsx` and affects every trip-detail feature. Also add `src/lib/use-live-sync.ts` to the entry — the shared-channel rework exists for this modal [tests/e2e/feature-map.mjs:120-124]
- [x] [Review][Patch] `AGENTS.md`'s `gh` escalation rule does not name the agent it applies to — `sandbox_permissions: "require_escalated"` is a Codex tool parameter; Claude Code's Bash/PowerShell tools expose `dangerouslyDisableSandbox` instead, so the rule reads as unfollowable to a Claude Code agent. State that it is Codex-specific (and give the Claude Code equivalent, since AGENTS.md is shared by both) [AGENTS.md:33]
- [x] [Review][Patch] `router.push("/trips")` without `router.refresh()` — the modal is app-shell-wide, so a user removed while already on `/trips` gets a push to the current URL served from the client router cache, leaving the revoked trip listed [src/components/packt/contributor-revocation-modal.tsx:57-60]
- [x] [Review][Defer] Modal copy renders a leading-space " (alex@example.com) removed you…" when the remover's name is an empty string — `actions.ts:1036` uses `user.name ?? user.email ?? ""`, and `??` does not fall through on `""`. Narrowed on review: email is required at signup so the fully-empty case is unreachable, and the `email (email)` duplicate needs a null name, which credentials signup never produces (`signUpAction` validates email + password only; the name input's `required` is client-side). Reachable only by bypassing client validation — deferred, low severity [src/components/packt/contributor-revocation-modal.tsx:68-71]
- [x] [Review][Patch] `AlertDialogContent size="sm"` renders the lone OK at half width — `AlertDialogFooter` applies `group-data-[size=sm]:grid grid-cols-2` at every breakpoint (every other `size="sm"` call site is Cancel + Action), leaving an empty cell; `size="default"` also removes the manual `place-items-start text-left` header overrides [src/components/packt/contributor-revocation-modal.tsx:64]
- [x] [Review][Patch] `use-live-sync.test.ts` never resets the module-level `channels` map — `beforeEach` resets `MockEventSource.instances` only, so the new `toHaveLength(1)` assertions depend entirely on RTL auto-cleanup releasing every prior channel, under fake timers whose watchdog outlives `useRealTimers()` if one leaks. Export a test-only reset and call it here and in `contributor-revocation-modal.test.tsx` [src/lib/use-live-sync.ts:45; src/lib/use-live-sync.test.ts:36]
- [x] [Review][Patch] E2E Scenario B never stages a change, so AC3's "staged changes discarded" is unexercised — the `Given` opens the share dialog and stops [tests/e2e/features/revocation-modal.feature:11-13]
- [x] [Review][Patch] AC1's "non-dismissible" is asserted nowhere — the unit test mocks the whole `@/components/ui/alert-dialog` module away (`AlertDialog` → `open ? <div>`), so Base UI's Root, Escape, backdrop click, `role="alertdialog"` and focus trap are never exercised, and the E2E only clicks OK. Add an Escape step that re-asserts the modal is still visible [tests/e2e/features/revocation-modal.feature]
- [x] [Review][Patch] Second `BrowserContext` leaks when session setup fails — both `Given` steps create the context several awaits before `setValue(REMOVED_CONTEXT_KEY, …)`, and the `After` hook keys off the stored value; register it immediately after creation [tests/e2e/steps/revocation-modal.steps.ts:155,200]
- [x] [Review][Patch] The comment above `statusListener` no longer describes the code beneath it and still claims a guarantee the hook no longer makes universally — a `url` change onto an already-open Connected channel now skips the forced `Reconnecting` transition (unreachable today: only `useTripLiveRefresh` opens trip channels, one at a time, and its cleanup releases before acquiring) [src/lib/use-live-sync.ts:137-141]
- [x] [Review][Rejected] `layout.tsx` repeats the `session.id!` non-null assertion when `user` carries the id — **applied, then reverted 2026-09-05: the finding was wrong.** `getUserById` returns `UserProfile | null` (`src/lib/queries.ts:80`), so `user.id` throws for a session whose user row no longer exists — a stale cookie against a truncated DB, which the E2E run hit for real (`TypeError: Cannot read properties of null (reading 'id')` at `layout.tsx:32`, plus `tsc`/`build` failures). `session.id!` is the correct source; a comment now records why [src/app/(app)/layout.tsx:32]
- [x] [Review][Defer] AC6 (Back / bfcache → `notFound()`) has no end-to-end verification [src/lib/use-bfcache-refresh.test.ts] — deferred, pre-existing
- [x] [Review][Defer] The two SSE routes are byte-identical from `new ReadableStream` down — extract `createSseStream(subscribe)` [src/app/api/users/me/events/route.ts:18; src/app/api/trips/[tripId]/events/route.ts:20] — deferred, pre-existing
- [x] [Review][Defer] No listener-throw isolation in `broadcastStatus` / `onmessage` fan-out [src/lib/use-live-sync.ts:47-50,74-78] — deferred, pre-existing
- [x] [Review][Defer] `releaseChannel(url)` decrements by map key rather than by the captured channel identity [src/lib/use-live-sync.ts:100-110] — deferred, pre-existing
- [x] [Review][Defer] Six step definitions are two behaviours duplicated three times — parameterize to `the {string} session clicks OK` [tests/e2e/steps/revocation-modal.steps.ts:120-161] — deferred, pre-existing
- [x] [Review][Defer] `emitHeartbeat()` fires before the `request.signal.aborted` check and is the only `controller.enqueue` unguarded against a closed controller [src/app/api/users/me/events/route.ts:24-28] — deferred, pre-existing
- [x] [Review][Defer] No E2E for removal while the user is *not* on a trip page — a distinct app-shell code path [tests/e2e/features/revocation-modal.feature] — deferred, pre-existing

## Spec Change Log

- **2026-09-05 — Shared `EventSource` per URL in `use-live-sync.ts`.** Found while investigating two E2E failures the implementer had (incorrectly) attributed entirely to environmental flakiness. Trace analysis (`trace.zip` network log) showed a trip page open in two tabs holds 6 concurrent `EventSource` connections to the origin (2 personal-channel + 1 trip-channel, per tab) once this story's modal added a second personal-channel consumer — exactly Chrome's HTTP/1.1 per-host connection cap. The saturated pool starved a same-origin server-action POST of a socket, hanging it indefinitely and failing `trip-live-refresh.feature`'s "second tab" scenario deterministically. Fix: `use-live-sync.ts` now keys a ref-counted registry by URL so every consumer of the same URL (`SyncStatusIndicator` + `ContributorRevocationModal`) shares one `EventSource`; a trip page open in two tabs now uses 4 connections total (matching pre-4-4 baseline), not 6. Public hook signature and per-consumer event/status delivery are unchanged; new coverage added to `use-live-sync.test.ts` (dedup, ref-counted teardown, per-consumer event/status fan-out, late-joiner status sync). Renegotiates the frozen "Ask First" bullet above (originally accepted two connections as harmless) and the "Never" bullet barring `use-live-sync.ts` semantic changes.
- **2026-09-05 — Immediate SSE heartbeat on connect.** Also found during the same investigation, but predates this story (shipped in 4-1): both SSE routes only wrote their first byte on the first heartbeat interval tick (15s), racing `sync-status.feature`'s 15000ms "Connected" assertion. Fixed by flushing one heartbeat synchronously in `start()` before scheduling the interval, in both `route.ts` files, with matching `route.test.ts` updates. Out of this story's original boundaries but fixed alongside the above since both surfaced as "flaky" E2E failures from the same validation pass.

## Design Notes

- **Why the personal channel is the only carrier:** `saveContributorChanges` publishes `membership-removed` via `publishUserEvent` (the removed user's `/api/users/me/events`) AND calls `removeTripSubscribersForUser` in the same operation, so the removed user's trip channel never delivers it. The modal must therefore live at app-shell level on the default `useLiveSync()` URL — a trip-page-only consumer would miss removals delivered while the dashboard or another page is open.
- **Ticket store vs. context/provider:** `(app)/layout.tsx` is a server component; wiring a client revoke-handler via a provider would force a server→client boundary rewrite. A module-level `useSyncExternalStore` store is lighter, unit-testable, and lets the modal (layout) and page-client (page) react to the same ticket without prop-drilling.
- **One shared EventSource per URL** (see Spec Change Log) — `SyncStatusIndicator` and `ContributorRevocationModal` both call `useLiveSync()` on the default personal-channel URL and now transparently share a single connection; neither component's code changed.
- **Request/effects lodging:** `useLiveSync` holds the callback in a ref (`onLiveSyncEventRef`), so the modal's handler identity changes harmlessly; only `url` changes reopen (or rejoin) the channel.

## Verification

**Commands:**

- `npx vitest run src/lib/revocation-ticket.test.ts src/lib/use-bfcache-refresh.test.ts src/components/packt/contributor-revocation-modal.test.tsx src/lib/use-live-sync.test.ts src/app/api/users/me/events/route.test.ts "src/app/api/trips/[tripId]/events/route.test.ts"` -- expected: pass.
- `npm run test:coverage` -- expected: ≥95% lines/functions, ≥90% branches (new `src/lib/**` + modal included).
- `npm run lint` -- expected: clean. `npx tsc --noEmit` -- expected: clean.
- `npm run test:e2e:affected` -- expected: full suite (`(app)/layout.tsx`, `page-client.tsx`, `src/lib/**` all SHARED) with the new revocation-modal scenarios green.