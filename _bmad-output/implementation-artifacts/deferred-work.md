- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-invite-an-existing-packt-user-to-a-trip.md`
  summary: ~~Add an index on `invitations.email` alone~~ — resolved: `getMyPendingInvitations` filters via `hasNormalizedEmail` (`lower(trim(email))`), which a plain column index can't serve, so `invitations_normalized_email` was added as an expression index on `lower(trim(email))` instead (`src/db/schema.ts`).
  evidence: Story 1.3 needs `getMyPendingInvitations` (per `src/lib/invitations.ts`'s design note) to look up invitations by invitee email across trips; without the matching expression index that query will full-scan the table.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-3-manager-has-full-trip-control.md`
  summary: Wire `trip-edit-sheet.tsx`'s People section to real collaborator data and server actions — it doesn't hydrate a shared trip's existing collaborators (`TripEditCollaborators` renders "No collaborators yet" for a seeded shared trip), and its `removeCollaborator`/`updateCollaboratorRole`/`addCollaborator` handlers only mutate local draft state, never calling the real `removeCollaborator`/`updateCollaboratorRole`/`addCollaborator` server actions in `actions.ts`.
  evidence: Discovered via live-browser E2E testing while implementing story 2.3 (`isCreator` creator-seat protection) — the pre-existing gap made it impossible to exercise the creator-lock UI end-to-end, so that story shipped with unit/component coverage only. Likely best addressed alongside epic 3's share dialog work, which replaces this inline list per DESIGN.md.

## Deferred from: code review of spec-2-3-manager-has-full-trip-control (2026-09-02)

- Validate collaborator role at the Server Action boundary in `src/app/(app)/trips/actions.ts:928`: `updateCollaboratorRole` receives runtime input without the existing `isCollaboratorRole` check, while `collaborators.role` is unconstrained text. A crafted request can persist an invalid role. Pre-existing issue outside this creator-seat change.

## Deferred from: code review of spec-2-4-viewer-s-shared-trips-are-excluded-from-personal-expense-rep (2026-09-02)

- ~~Duplicate collaborator rows for the same trip+user could yield duplicate trip entries in `listExpensesForUserInRange`~~ — resolved: `tripRows` is now deduped by `trip.id` before building `tripList`/`tripIds`. `src/lib/queries.ts`.

## Deferred from: code review of story-3-2 (2026-09-03)

- ~~`resendInvitation`'s WHERE guard (`src/lib/invitations.ts:82`) checks `status = 'pending'` but not `expiresAt > now()`~~ — resolved by design, not a bug: the epic-3 retro (2026-09-04) changed `getContributorsAndInvitations` to stop excluding expired-pending rows, specifically so a manager can see and resend/rescind an expired invitation from the share dialog. Reviving an expired-but-still-`pending` row via Resend is now the intended recovery path, not a latent race.
- Resend/rescind async handlers in `src/components/packt/trip-share-dialog.tsx:65` have no unmount guard, unlike the existing `loadData` effect's `isCurrent` pattern in the same file — calling `setData`/`setPendingInvitationId`/`toast` after the dialog closes mid-request. No-op under React 18, but inconsistent with the guarded pattern used elsewhere in the file.

## Deferred from: code review of story-3-3 (2026-09-03)

- Invite error string comparison (`message === "No Packt account found for this email"`) ties the client to exact server wording. Server should return a typed error code for the "no account" case. `src/components/packt/trip-share-dialog.tsx:72`.
- Caught errors in `handleInvite` are not logged (no `console.error` or telemetry). Production debugging for invite failures will have no signal beyond the generic user-facing toast. `src/components/packt/trip-share-dialog.tsx:86`.
- No client-side email format validation before round-tripping to the server. The `type="email"` attribute on the input provides native browser validation on submit, but the `handleInvite` guard only checks `email.trim()`, allowing syntactically invalid emails through. `src/components/packt/trip-share-dialog.tsx:65`.
- Server error messages from `inviteContributor` are forwarded raw to `toast.error(message)`. Known error types should be mapped to user-friendly strings. `src/components/packt/trip-share-dialog.tsx:75`.
- `canManage` prop in `TripEditSheet` is now unused after removing the People section. Removing it would break ~6 call sites; deferred to a follow-up. `src/components/packt/trip-edit-sheet.tsx`.

## Deferred from: code review of story-3-5 (2026-09-03)

- No upper bound on `changes.length` in `saveContributorChanges` — an authenticated manager could submit an arbitrarily large batch in one transaction. Low real-world impact given the caller is already an authorized manager on the trip. `src/app/(app)/trips/actions.ts:971`.
- Potential `setState` after unmount if the dialog is closed while a save is in flight (`handleSaveChanges` in `trip-share-dialog.tsx`) — matches the existing unguarded pattern already noted for the resend/rescind handlers in story-3-2's deferred items; React 18+ no longer warns on this. `src/components/packt/trip-share-dialog.tsx:86`.

## Deferred from: code review of story-4-2-sync-status-indicator (2026-09-04)

- The `"heartbeat"` wire sentinel has no shared constant/type in `LiveSyncEventType` — future story 4.3 consumers parsing `onmessage` payloads as a `LiveSyncEvent` must hardcode the literal string. Explicitly deferred to 4.3 per this story's own spec Design Notes ("4.3 consumers filter to known event types"). `src/data/types.ts`.
- `refreshCurrentPage` in `tests/e2e/scenario-fixture.ts:654-657` has no callers anywhere in `tests/e2e/` — pre-existing dead code, untouched by this story besides its `waitForLoadState` line.

## Deferred from: code review of spec-4-4-revocation-modal-on-self-targeted-removal (2026-09-05)

- AC6 (Back / bfcache restoration → `assertTripAccess()`'s `notFound()`) has no end-to-end verification. `use-bfcache-refresh.test.ts` proves only that a `pageshow` with `persisted: true` calls a mocked `router.refresh()`; nothing verifies the load-bearing downstream assumption that the refresh actually re-runs the access check and renders the not-found boundary, and `revocation-modal.feature` has no Back-navigation scenario. Deterministic bfcache E2E is genuinely hard to author. `src/lib/use-bfcache-refresh.test.ts`.
- The two SSE routes are byte-identical from `new ReadableStream` down, including the newly duplicated immediate-heartbeat block, differing only in the `subscribeUser` / `subscribeTripForUser` call. Extract a `createSseStream(subscribe)` helper into `src/lib/trip-events.ts` alongside `formatSseEvent` / `formatSseHeartbeat`. Pre-existing duplication from 4-1, doubled by this story. `src/app/api/users/me/events/route.ts:18`, `src/app/api/trips/[tripId]/events/route.ts:20`.
- No listener-throw isolation in the shared channel's fan-out: `broadcastStatus` and `onmessage` both iterate their listener Sets without a try/catch, so one consumer throwing starves every later listener — including the revocation announcement. Low reachability today (two known consumers, neither throws synchronously). `src/lib/use-live-sync.ts:47-50,74-78`.
- `releaseChannel(url)` decrements whatever channel the map currently holds at that key rather than the channel the effect captured. No current path produces a mismatch (a channel is only deleted at refCount 0, and each acquire pairs with exactly one release), but an identity guard is one line. `src/lib/use-live-sync.ts:100-110`.
- Six step definitions in the revocation-modal steps are two behaviours duplicated three times (`…contributor…` / `…co-manager…` differ only in a noun and delegate to identical bodies). Parameterize to `the {string} session clicks OK` / `I remove the {string} from the trip and save`. `tests/e2e/steps/revocation-modal.steps.ts:120-161`.
- `emitHeartbeat()` runs unconditionally before the `request.signal.aborted` branch, and is the only `controller.enqueue` in either SSE route not guarded against "Invalid state: Controller is already closed". An already-aborted request enqueues into a controller about to be closed. `src/app/api/users/me/events/route.ts:24-28`.
- No E2E covers removal while the user is *not* on a trip page. The modal lives in the app shell, so that is a distinct code path from both shipped scenarios (which both start on the trip page). `tests/e2e/features/revocation-modal.feature`.
- Modal copy renders a leading-space " (alex@example.com) removed you…" when the remover's name is an empty string: `saveContributorChanges` builds `removedByName = user.name ?? user.email ?? ""` (`src/app/(app)/trips/actions.ts:1036`) and `??` does not fall through on `""`. Reachable only by bypassing the signup form's client-side `required` on the name input — `signUpAction` validates email and password only (`src/app/(auth)/actions.ts:35`). The fully-empty " ()" case is unreachable (email is required at signup) and the "email (email)" duplicate needs a null name, which credentials signup never produces. `src/components/packt/contributor-revocation-modal.tsx:68-71`.

## Deferred from: code review of spec-4-5-dashboard-reflects-membership-changes-live (2026-09-05)

- `MockEventSource`, `currentSource()` and `flushMicrotasks()` are now copied identically into a fourth test file. They already exist in `use-trip-live-refresh.test.ts`, `use-live-sync.test.ts` and `contributor-revocation-modal.test.tsx`. Extract to a shared test helper beside `src/lib/use-live-sync.ts`. `src/lib/use-dashboard-live-refresh.test.ts:15-51`.
- The new E2E step file re-implements contributor seeding, second-`BrowserContext` sign-in and the revocation-modal assertion instead of reusing the near-identical helpers the Code Map named. Those helpers (`seedCollaborator`, `openSecondSession`, `signInAsRemovedUser`) are module-local in `revocation-modal.steps.ts` and `trip-live-refresh.steps.ts`, so sharing them means promoting them into `tests/e2e/scenario-fixture.ts` — a three-file extraction beyond this story's scope. `tests/e2e/steps/dashboard-live-sync.steps.ts:33-85`.
- `15_000` is repeated as a bare assertion timeout in three steps. `tests/e2e/live-sync.ts` already owns `LIVE_SYNC_READY_TIMEOUT_MS`; add an exported assertion-timeout constant there and use it in both live-sync step files. `tests/e2e/steps/dashboard-live-sync.steps.ts:88,111,124`.
- `saveContributorChanges` revalidates only `/trips/${tripId}`, while `acceptInvitation` and `declineInvitation` also revalidate `/trips`. Verified to have no staleness consequence today (no `unstable_cache`/`revalidate`/`force-cache` anywhere under `src/`, and `/trips` is dynamic via `cookies()`), so this is an unexplained asymmetry rather than a bug. `src/app/(app)/trips/actions.ts:1067`.
- ~~The trip edit sheet's `open` keys off `editingTrip` (a string id) while its `trip` prop keys off `editingEntry`~~ — resolved: `open` now keys off `editingEntry !== null`, matching `trip`'s source. `src/app/(app)/trips/page-client.tsx`.

## Deferred from: code review of spec-4-6-move-sync-status-indicator-to-top-bar-icon (2026-09-06)

- The `aria-live` announcement region keeps the last transition's text indefinitely. After recovery the sr-only span still reads `Unable to sync`, so a screen-reader user browsing into the region later hears an out-of-date status. Pre-existing from 4-2's announcement contract, unchanged by this story. `src/components/packt/sync-status-indicator.tsx:108-110`.
- No debounce on status announcements. A flapping SSE channel produces alternating `Reconnecting` / `Connected` announcements with no settling window. Pre-existing from 4-2. `src/components/packt/sync-status-indicator.tsx:68-73`.
- `bottom-tab-bar`'s `env(safe-area-inset-bottom)` padding is inert for the same reason the new top spacer is: the app emits no `viewport-fit=cover`, so every `env(safe-area-inset-*)` resolves to `0px`. This is the actual root cause of the notched-mobile tab-bar overlap that story 4-6 was written to route around. `src/components/packt/bottom-tab-bar.tsx:26`.

## Deferred from: live-sync health review (2026-09-08)

- The SSE heartbeat proves the route is alive, not that the pub/sub fan-out reaches the client, so a
  broken fan-out reports as healthy. `src/app/api/users/me/events/route.ts:24-29` emits the
  heartbeat from the request's own `setInterval`, entirely independent of the `subscribeUser`
  registration above it (`src/app/api/trips/[tripId]/events/route.ts` has the same shape). The
  client's dead-channel watchdog resets on any message including heartbeats
  (`src/lib/use-live-sync.ts:68-78`), so heartbeats keep it satisfied while no real event ever
  arrives, and `SyncStatusIndicator` correctly renders nothing the whole time.

  Reachable the moment the app runs more than one instance: `src/lib/trip-events.ts` holds
  subscribers in an in-process `Map` (`tripTopics` / `userTopics`), so a publish on instance A never
  reaches a subscriber on instance B — an editor's changes silently never appear for a viewer, with
  the UI reporting a healthy connection throughout. Single-instance deployments (dev, a single
  Synology container) are unaffected today, which is why this is latent rather than broken.

  Two candidate fixes, not mutually exclusive: back the topics with a real pub/sub transport (Redis
  or equivalent) so fan-out survives multiple instances — explicitly ruled out of scope by story
  4-1 and 4-6; and/or route the heartbeat through the same publish path as real events so a broken
  fan-out actually stalls the watchdog and surfaces `Unable to sync`. The second is the smaller
  change and is what makes the indicator honest regardless of transport.

## Deferred from: spec-heartbeat-fanout-health-check.md token-count split (2026-09-08)

- source_spec: `_bmad-output/implementation-artifacts/spec-heartbeat-fanout-health-check.md`
  summary: Same open item as the story-4-2 entry above ("no shared constant/type in `LiveSyncEventType`... future consumers must hardcode the literal string") — carved off this spec to stay under its token-count target, not a new finding. See that entry; no separate fix needed here.
  evidence: The heartbeat scheduler added by this spec reuses today's internal `"heartbeat"` literal rather than promoting it to `src/data/types.ts`, so the pre-existing gap is unchanged, not widened.

## Deferred from: spec-sse-subscriber-cleanup.md token-count split (2026-09-08)

- source_spec: `_bmad-output/implementation-artifacts/spec-sse-subscriber-cleanup.md`
  summary: Add per-listener throw isolation to `use-live-sync.ts`'s client-side fan-out (`broadcastStatus`, `onmessage`) — retro epic-4 item 22/VG-2/EC-5.
  evidence: Split off spec-sse-subscriber-cleanup.md to stay under its token-count target. Item 22 is a different file/layer (client vs. server) with no shared code to that spec's items 18/20, so it doesn't need to land in the same change.

## Deferred from: code review of spec-heartbeat-fanout-health-check.md (2026-09-08)

- source_spec: `_bmad-output/implementation-artifacts/spec-heartbeat-fanout-health-check.md`
  summary: `deliverToTripSubscribers`/`deliverToUserSubscribers` never remove a subscriber whose callback throws — they `console.warn` and continue, leaving it registered.
  evidence: Pre-existing behavior from `publishTripEvent`/`publishUserEvent`'s original try/catch (unchanged by this spec, just reused by the new heartbeat scheduler), but the heartbeat now invokes every subscriber every `SSE_HEARTBEAT_INTERVAL_MS` regardless of activity, so a connection whose `enqueue` starts throwing for a reason other than its own abort signal (e.g. the controller closed out-of-band) now re-fails and re-logs on every tick indefinitely instead of only on the next real publish. `src/lib/trip-events.ts:54-82`.
- source_spec: `_bmad-output/implementation-artifacts/spec-heartbeat-fanout-health-check.md`
  summary: `removeTripSubscribersForUser` and `purgeTripTopic` drop a subscriber from the topic `Set` without closing that subscriber's underlying stream/controller.
  evidence: Pre-existing, untouched by this spec's diff. A forcibly-removed connection (e.g. a contributor's access revoked) stops receiving anything but its `ReadableStream` is never told to close, leaking an open response until the client's own watchdog times out. `src/lib/trip-events.ts:215-232`.
