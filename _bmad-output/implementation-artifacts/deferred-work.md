- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-invite-an-existing-packt-user-to-a-trip.md`
  summary: ~~Add an index on `invitations.email` alone~~ — resolved: `getMyPendingInvitations` filters via `hasNormalizedEmail` (`lower(trim(email))`), which a plain column index can't serve, so `invitations_normalized_email` was added as an expression index on `lower(trim(email))` instead (`src/db/schema.ts`).
  evidence: Story 1.3 needs `getMyPendingInvitations` (per `src/lib/invitations.ts`'s design note) to look up invitations by invitee email across trips; without the matching expression index that query will full-scan the table.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-3-manager-has-full-trip-control.md`
  summary: ~~Wire `trip-edit-sheet.tsx`'s People section to real collaborator data and server actions~~ — resolved by removal, not wiring: `TripEditCollaborators` and the People section no longer exist anywhere in the codebase (epic 3's share dialog replaced this inline list per DESIGN.md).
  evidence: Discovered via live-browser E2E testing while implementing story 2.3 (`isCreator` creator-seat protection) — the pre-existing gap made it impossible to exercise the creator-lock UI end-to-end, so that story shipped with unit/component coverage only.

## Deferred from: code review of spec-2-3-manager-has-full-trip-control (2026-09-02)

- ~~Validate collaborator role at the Server Action boundary: `updateCollaboratorRole` receives runtime input without the existing `isCollaboratorRole` check.~~ — resolved: `updateCollaboratorRole` no longer exists (superseded by `saveContributorChanges`), which now validates `change.toRole` against `Object.values(CollaboratorRole)` before the transaction, returning `"Invalid collaborator role"` on a bad value (`src/app/(app)/trips/actions.ts:982-985`).

## Deferred from: code review of spec-2-4-viewer-s-shared-trips-are-excluded-from-personal-expense-rep (2026-09-02)

- ~~Duplicate collaborator rows for the same trip+user could yield duplicate trip entries in `listExpensesForUserInRange`~~ — resolved: `tripRows` is now deduped by `trip.id` before building `tripList`/`tripIds`. `src/lib/queries.ts`.

## Deferred from: code review of story-3-2 (2026-09-03)

- ~~`resendInvitation`'s WHERE guard (`src/lib/invitations.ts:82`) checks `status = 'pending'` but not `expiresAt > now()`~~ — resolved by design, not a bug: the epic-3 retro (2026-09-04) changed `getContributorsAndInvitations` to stop excluding expired-pending rows, specifically so a manager can see and resend/rescind an expired invitation from the share dialog. Reviving an expired-but-still-`pending` row via Resend is now the intended recovery path, not a latent race.
- ~~Resend/rescind async handlers in `src/components/packt/trip-share-dialog.tsx:65` have no unmount guard~~ — resolved: an `isCurrentRef` guard (matching the existing `loadData` `isCurrent` pattern) was added to `resendPendingInvitation`/`removeInvitation` in `src/components/packt/use-trip-share-dialog-controller.ts`.

## Deferred from: code review of story-3-3 (2026-09-03)

- ~~Invite error string comparison (`message === "No Packt account found for this email"`) ties the client to exact server wording~~ — resolved: `inviteContributor` now returns a typed `errorCode` field (`InviteContributorErrorCode`, `src/data/types.ts`); the client branches on `errorCode === "no-account"` in `src/components/packt/use-trip-share-invite-form.ts`.
- ~~Caught errors in `handleInvite` are not logged~~ — resolved: the extracted `useTripShareInviteForm` hook (`src/components/packt/use-trip-share-invite-form.ts`) logs via `console.error` in its catch block.
- ~~No client-side email format validation before round-tripping to the server~~ — resolved: `useTripShareInviteForm` validates against an email-format regex before calling `inviteContributor`, showing an inline error instead of round-tripping.
- Server error messages from `inviteContributor` are forwarded raw to `toast.error(message)`. Known error types should be mapped to user-friendly strings. `src/components/packt/use-trip-share-invite-form.ts`. (Out of scope for `spec-sharing-dialog-invite-flow-hardening.md` — only the "no account" case was typed there.)
- ~~`canManage` prop in `TripEditSheet` is now unused after removing the People section~~ — resolved: removed from `TripEditSheet` and its 3 call sites (`trips/[tripId]/page-client.tsx`, `trips/page-client.tsx`, `travel-history/page-client.tsx`).

## Deferred from: code review of story-3-5 (2026-09-03)

- ~~No upper bound on `changes.length` in `saveContributorChanges`~~ — resolved: a `MAX_CONTRIBUTOR_CHANGES` (50) cap rejects oversized batches before opening a transaction. `src/app/(app)/trips/actions.ts`.
- ~~Potential `setState` after unmount if the dialog is closed while a save is in flight~~ — resolved: `handleSaveChanges` now guards its post-await `setState` calls with the same `isCurrentRef` used for resend/rescind. `src/components/packt/use-trip-share-dialog-controller.ts`.

## Deferred from: code review of story-4-2-sync-status-indicator (2026-09-04)

- The `"heartbeat"` wire sentinel has no shared constant/type in `LiveSyncEventType` — future story 4.3 consumers parsing `onmessage` payloads as a `LiveSyncEvent` must hardcode the literal string. Explicitly deferred to 4.3 per this story's own spec Design Notes ("4.3 consumers filter to known event types"). `src/data/types.ts`.
- `refreshCurrentPage` in `tests/e2e/scenario-fixture.ts:654-657` has no callers anywhere in `tests/e2e/` — pre-existing dead code, untouched by this story besides its `waitForLoadState` line.

## Deferred from: code review of spec-4-4-revocation-modal-on-self-targeted-removal (2026-09-05)

- AC6 (Back / bfcache restoration → `assertTripAccess()`'s `notFound()`) has no end-to-end verification. `use-bfcache-refresh.test.ts` proves only that a `pageshow` with `persisted: true` calls a mocked `router.refresh()`; nothing verifies the load-bearing downstream assumption that the refresh actually re-runs the access check and renders the not-found boundary, and `revocation-modal.feature` has no Back-navigation scenario. Deterministic bfcache E2E is genuinely hard to author. `src/lib/use-bfcache-refresh.test.ts`.
- ~~The two SSE routes are byte-identical from `new ReadableStream` down... Extract a `createSseStream(subscribe)` helper.~~ — resolved: both routes now call a shared `createLiveSyncResponse(signal, subscribe)` in `src/lib/trip-events.ts`; `new ReadableStream` appears exactly once in the codebase.
- ~~No listener-throw isolation in the shared channel's fan-out: `broadcastStatus` and `onmessage`...~~ — resolved (epic-4-retro-item-22): both now wrap each listener call in try/catch with a `console.warn`, matching the server-side pattern (`src/lib/use-live-sync.ts`).
- ~~`releaseChannel(url)` decrements whatever channel the map currently holds at that key rather than the channel the effect captured... an identity guard is one line.~~ — resolved: `releaseChannel(url, channel)` now starts with `if (channels.get(url) !== channel) return;` (`src/lib/use-live-sync.ts`).
- Six step definitions in the revocation-modal steps are two behaviours duplicated three times (`…contributor…` / `…co-manager…` differ only in a noun and delegate to identical bodies). Parameterize to `the {string} session clicks OK` / `I remove the {string} from the trip and save`. **Partially mitigated:** the step bodies now delegate to shared helpers (`removeNamedContributorAndSave`, `assertRevocationModalNamesRemover`, `getRemovedPage`), so the behavioral-drift risk is gone, but the Gherkin step text itself is still un-parameterized. `tests/e2e/steps/revocation-modal.steps.ts:120-161`.
- ~~`emitHeartbeat()` runs unconditionally before the `request.signal.aborted` branch...~~ — resolved: `createLiveSyncResponse` now checks `if (signal.aborted) { cleanup(); return; }` before the heartbeat flush (`src/lib/trip-events.ts:300-309`).
- ~~No E2E covers removal while the user is *not* on a trip page.~~ — resolved: `dashboard-live-sync.feature:9-15` ("A contributor removed while viewing the dashboard sees revocation and loses the trip") covers exactly this, added by spec-4-5's dashboard live-sync work after this finding was logged against `revocation-modal.feature` specifically.
- Modal copy renders a leading-space " (alex@example.com) removed you…" when the remover's name is an empty string: `saveContributorChanges` builds `removedByName = user.name ?? user.email ?? ""` (`src/app/(app)/trips/actions.ts:1036`) and `??` does not fall through on `""`. Reachable only by bypassing the signup form's client-side `required` on the name input — `signUpAction` validates email and password only (`src/app/(auth)/actions.ts:35`). The fully-empty " ()" case is unreachable (email is required at signup) and the "email (email)" duplicate needs a null name, which credentials signup never produces. `src/components/packt/contributor-revocation-modal.tsx:68-71`. **Confirmed still open (2026-09-09)** — sprint-status.yaml's `epic-4-retro-item-21` had been marked `done` for this same finding despite no fallback copy existing anywhere in the component; corrected back to `open`.

## Deferred from: code review of spec-4-5-dashboard-reflects-membership-changes-live (2026-09-05)

- `MockEventSource`, `currentSource()` and `flushMicrotasks()` are now copied identically into a fourth test file. They already exist in `use-trip-live-refresh.test.ts`, `use-live-sync.test.ts` and `contributor-revocation-modal.test.tsx`. Extract to a shared test helper beside `src/lib/use-live-sync.ts`. `src/lib/use-dashboard-live-refresh.test.ts:15-51`.
- The new E2E step file re-implements contributor seeding, second-`BrowserContext` sign-in and the revocation-modal assertion instead of reusing the near-identical helpers the Code Map named. Those helpers (`seedCollaborator`, `openSecondSession`, `signInAsRemovedUser`) are module-local in `revocation-modal.steps.ts` and `trip-live-refresh.steps.ts`, so sharing them means promoting them into `tests/e2e/scenario-fixture.ts` — a three-file extraction beyond this story's scope. `tests/e2e/steps/dashboard-live-sync.steps.ts:33-85`.
- `15_000` is repeated as a bare assertion timeout in three steps. `tests/e2e/live-sync.ts` already owns `LIVE_SYNC_READY_TIMEOUT_MS`; add an exported assertion-timeout constant there and use it in both live-sync step files. `tests/e2e/steps/dashboard-live-sync.steps.ts:88,111,124`.
- ~~`saveContributorChanges` revalidates only `/trips/${tripId}`, while `acceptInvitation` and `declineInvitation` also revalidate `/trips`~~ — resolved: `saveContributorChanges` now also calls `revalidatePath("/trips")`, matching `acceptInvitation`/`declineInvitation`. `src/app/(app)/trips/actions.ts`.
- ~~The trip edit sheet's `open` keys off `editingTrip` (a string id) while its `trip` prop keys off `editingEntry`~~ — resolved: `open` now keys off `editingEntry !== null`, matching `trip`'s source. `src/app/(app)/trips/page-client.tsx`.

## Deferred from: code review of spec-4-6-move-sync-status-indicator-to-top-bar-icon (2026-09-06)

- ~~The `aria-live` announcement region keeps the last transition's text indefinitely. After recovery the sr-only span still reads `Unable to sync`.~~ — resolved: the announcement now updates to `"Connected"` on recovery, proven by `sync-status-indicator.test.tsx` ("announces the problem, an escalation, and the recovery").
- No debounce on status announcements. A flapping SSE channel produces alternating `Reconnecting` / `Connected` announcements with no settling window — confirmed still open: once `displayedStatus` already shows a problem, every subsequent flap sets it immediately (`isAlreadyShowingProblem` branch has no timer); only the *first* transition into a problem gets the grace-period debounce. `src/components/packt/sync-status-indicator.tsx`.
- ~~`bottom-tab-bar`'s `env(safe-area-inset-bottom)` padding is inert... the app emits no `viewport-fit=cover`.~~ — resolved: `src/app/layout.tsx` now exports `viewport: Viewport = { viewportFit: "cover" }`, with a comment citing this exact issue.

## Deferred from: live-sync health review (2026-09-08)

- ~~The SSE heartbeat proves the route is alive, not that the pub/sub fan-out reaches the client.~~ —
  resolved by `spec-heartbeat-fanout-health-check.md`: `tickHeartbeat` now calls the same
  `deliverToTripSubscribers`/`deliverToUserSubscribers` real events use (`src/lib/trip-events.ts:108-114`),
  so a broken fan-out now stalls the watchdog and surfaces `Unable to sync` instead of reporting healthy.

  The single-instance-only in-memory pub/sub limitation this entry also raised (no Redis-backed
  transport, so a publish on instance A never reaches a subscriber on instance B) was explicitly
  ruled out of scope, not fixed — still tracked separately as sprint-status epic-4-retro-item-27
  (document the limitation inline in `trip-events.ts`), which remains open.

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
  summary: ~~`removeTripSubscribersForUser` and `purgeTripTopic` drop a subscriber from the topic `Set` without closing that subscriber's underlying stream/controller.~~ — resolved by `spec-sse-subscriber-cleanup.md` (epic-4-retro-item-18): both now route through the shared `unregisterTripSubscriber` helper, which calls `subscriber.close()` (`src/lib/trip-events.ts:148-156,226-246`).
  evidence: Was pre-existing and untouched by this spec's diff at the time it was logged. A forcibly-removed connection (e.g. a contributor's access revoked) used to keep an open response until the client's own watchdog timed out; the follow-up spec closed it immediately instead.
