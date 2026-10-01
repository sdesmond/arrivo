# Epic 4 Context: Live Sync and Revocation

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Contributors see trip changes live across open sessions without a manual refresh, know when their live connection to Packt has dropped, and a contributor whose access is removed is told immediately and cannot get back into the trip — even mid-session. Live sync is delivered as a one-way Server-Sent Events (SSE) notification side-channel layered on the existing command-action layer (mutations still flow through `requireUser()` → `assertTripAccess()` → write → `revalidatePath()`); the side-channel never carries the mutation itself and is never the source of truth — Postgres via `assertTripAccess()`-gated queries stays authoritative, so a client that misses an event still sees correct state on next navigation/refetch/reconnect. Concurrent edits resolve with latest-write-wins (no merge UI, no new mechanism — verified by test, not built). The whole feature assumes a single running Node process; horizontal-scale fan-out is explicitly out of scope.

## Stories

- Story 4.1: SSE pub-sub infrastructure and both routes
- Story 4.2: Sync status indicator
- Story 4.3: Trip page live refresh on itinerary and membership events
- Story 4.4: Revocation modal on self-targeted removal
- Story 4.5: Dashboard reflects membership changes live

## Requirements & Constraints

- Live cross-session sync (FR8): shared trip state — itinerary, events, locations, membership, roles — updates live across sessions without a reload; when live sync cannot operate, an offline/internet-down indicator appears in the status bar.
- Immediate access revocation (FR9): removing a contributor revokes their access immediately and everywhere; the trip disappears at once from their dashboard; if actively viewing, a modal names the trip owner, directs them to request resharing, OK returns them to their own dashboard, and browser Back cannot reopen the trip.
- Concurrent edit latest-write-wins (FR10/NFR8): concurrent edits to the same itinerary item resolve without data corruption or a merge prompt — the latest write wins and all sessions converge. No merge UI by design.
- Live sync is a read-only notification signal, never a write path; the server validates each client's continued access on every real query via `assertTripAccess()`.
- No new dependencies: SSE needs no library (a Next.js Route Handler returning a stream with `Content-Type: text/event-stream`; `EventSource` is a browser built-in). No Redis / horizontal-scale fan-out this round — deferred; a multi-instance deployment would silently break live sync and revocation and must swap in Redis first.
- Invitations are not part of this epic's new surface beyond the events that reflect their acceptance/expiry (see Cross-Story Dependencies).

## Technical Decisions

- In-process pub-sub in `src/lib/trip-events.ts` (AD-4): two `Map<topicId, Set<subscriberCallback>>` maps on `globalThis` (one for `trip:{tripId}`, one for `user:{userId}`), same singleton shape as `db/index.ts`. A server action calls `publishTripEvent(tripId, event)` and, for membership changes/removal, also `publishUserEvent(affectedUserId, event)` after its write commits. Each SSE route's subscriber callback pushes to its own connection. Subscribers are removed when the request's `AbortSignal` fires (client disconnect, tab close, navigation) — connections never accumulate dead subscribers.
- Two SSE Route Handlers (AD-3):
  - `GET /api/trips/[tripId]/events` — gated `requireUser()` + `assertTripAccess(tripId, userId, "viewer")`; streams itinerary-change and membership events on the trip topic.
  - `GET /api/users/me/events` — gated `requireUser()` only (the caller's own channel); streams `membership-changed`/`membership-removed` across every trip, so the dashboard and any open session reflect a role change or removal without that trip's channel being open.
- SSE event `type` values: `itinerary-changed`, `membership-changed`, `membership-removed`. Heartbeat comments keep connections alive when idle.
- Reconnect resync (AD-3): `onopen` firing after any reconnect (not just initial connect) triggers a full refetch — the stream is best-effort with no gap-filling; events missed during a disconnect are recovered only by resync, never replayed.
- Event ordering: receiving `membership-removed` naming the viewer's own `userId` (either channel) immediately shows the revocation modal and short-circuits all further event/refetch processing for that trip — no stale in-flight response repaints revoked content. Every client-triggered refetch carries a monotonic request-generation counter; a response is applied only if no newer request was issued since.
- `membership-removed` payload carries `{removedUserId, tripId, tripName, removedByName, removedByEmail}` inline — the acting manager's identity captured at publish time, never a fresh fetch (a revoked `assertTripAccess()` would reject one).
- Removing a contributor, or deleting a trip, force-unsubscribes that user's `trip:{tripId}` subscriber as part of the same operation; trip deletion also publishes a `trip-deleted` event so open connections are told rather than orphaned.
- Client hook `src/lib/use-live-sync.ts` (AD-8): wraps `EventSource`, exposes `{status: "connected" | "reconnecting" | "offline"}`. Mounts `/api/users/me/events` on the dashboard; on a trip page mounts both that and the trip channel. `src/components/packt/sync-status-indicator.tsx` renders that status and is mounted once in `(app)/layout.tsx` alongside the existing `<Toaster/>`. Dashboard subscribes to `user:{userId}` so removal reflects without the trip page ever being open.
- CAP-10 (latest-write-wins) needs no new mechanism: plain `UPDATE` writes with no version/optimistic-lock column already produce latest-write-wins; this spine adds none. Verified by regression test, not built.
- Dead-channel detection: if no event or heartbeat is received for longer than the heartbeat interval plus a grace window, the client treats the channel as down (indicator shows offline) and re-verifies trip/membership access on next navigation — a dead channel cannot mask a revocation indefinitely.
- Test environment: E2E scenarios materialize their own rows per the self-seeding convention; no shared fixture trips, no email stub needed.

## UX & Interaction Patterns

- Revocation modal (UX-DR8): Base UI `AlertDialog` (no backdrop-dismiss), single "OK" action. Names the trip and the manager who removed them (`removedByName`/`removedByEmail` from the event payload — the acting manager, not necessarily the trip creator). OK returns to the dashboard; browser Back re-hits `assertTripAccess()`'s existing `notFound()` (not a client-side route guard). If any other dialog is open when a self-targeted `membership-removed` arrives, that dialog is force-closed (staged changes discarded) and the revocation modal takes its place — the one exception to the one-level-deep modal-stacking rule. Focus trapped on open.
- Sync status indicator (UX-DR10): new status-bar chip (no status bar exists in Packt today), three states — connected (quiet, `fg-4`, no accent; a working connection is not an accent moment), reconnecting (`warning`, pulsing; static warning-toned dot when `prefers-reduced-motion`), offline (`danger`, static — never pulsing). Every state carries a visible text label alongside the dot (never color-only). State changes announce via `aria-live="polite"`, including recovery back to connected. No toast for ambient connection state — the status bar is the single source of truth; toasts are reserved for action results.
- "You're offline. Changes from other people won't appear until you reconnect." is the offline microcopy.
- Reconnecting is a signal, not a gate: edits queue normally through existing server actions — no blocking behavior.
- Accessibility: every interactive target meets 44×44px; the revocation modal traps focus and announces on open.

## Cross-Story Dependencies

- Membership events published by Epic 1/3 flows surface here: `acceptInvitation` publishes `membership-changed` on `trip:{tripId}`; removing a contributor (Epic 3's `saveContributorChanges`) and rescinding flow into the `membership-removed`/`membership-changed` events this epic reacts to.
- An already-open share dialog (Epic 3) refetches its contributor list on a `membership-changed` event for its trip; this epic's revoke-modal force-close (Story 4.4) is the exit path when a manager is removed while that dialog is open.
- Relies on Epic 1's role model (`viewer | editor | manager`, `isCreator`) and `assertTripAccess()`'s existing `notFound()` for post-revocation access denial.
