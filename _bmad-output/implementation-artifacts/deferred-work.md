- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-invite-an-existing-packt-user-to-a-trip.md`
  summary: Add an index on `invitations.email` alone (the current partial unique index only covers `(tripId, email)` where `status = 'pending'`).
  evidence: Story 1.3 needs `getMyPendingInvitations` (per `src/lib/invitations.ts`'s design note) to look up invitations by invitee email across trips; without a standalone email index that query will full-scan the table.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-3-manager-has-full-trip-control.md`
  summary: Wire `trip-edit-sheet.tsx`'s People section to real collaborator data and server actions — it doesn't hydrate a shared trip's existing collaborators (`TripEditCollaborators` renders "No collaborators yet" for a seeded shared trip), and its `removeCollaborator`/`updateCollaboratorRole`/`addCollaborator` handlers only mutate local draft state, never calling the real `removeCollaborator`/`updateCollaboratorRole`/`addCollaborator` server actions in `actions.ts`.
  evidence: Discovered via live-browser E2E testing while implementing story 2.3 (`isCreator` creator-seat protection) — the pre-existing gap made it impossible to exercise the creator-lock UI end-to-end, so that story shipped with unit/component coverage only. Likely best addressed alongside epic 3's share dialog work, which replaces this inline list per DESIGN.md.

## Deferred from: code review of spec-2-3-manager-has-full-trip-control (2026-09-02)

- Validate collaborator role at the Server Action boundary in `src/app/(app)/trips/actions.ts:928`: `updateCollaboratorRole` receives runtime input without the existing `isCollaboratorRole` check, while `collaborators.role` is unconstrained text. A crafted request can persist an invalid role. Pre-existing issue outside this creator-seat change.

## Deferred from: code review of spec-2-4-viewer-s-shared-trips-are-excluded-from-personal-expense-rep (2026-09-02)

- Duplicate collaborator rows for the same trip+user could yield duplicate trip entries in `listExpensesForUserInRange`: the `innerJoin` matches on `eq(collaborators.tripId, trips.id)` + `eq(collaborators.userId, userId)`, but the table's unique constraint is on `(tripId, email)`, not `(tripId, userId)` — so two collaborator rows with different emails but the same linked `userId` on one trip would both match the join. Pre-existing join shape, unrelated to this story's `ne(role, "viewer")` addition. `src/lib/queries.ts:257`.

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
