---
title: "Revocation Modal on Self-targeted Removal"
type: "feature"
created: "2026-09-05"
status: "in-progress"
review_loop_iteration: 0
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