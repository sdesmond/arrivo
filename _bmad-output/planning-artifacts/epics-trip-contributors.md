---
stepsCompleted: ["step-01-validate-prerequisites", "step-02-design-epics", "step-03-create-stories"]
inputDocuments:
  - _bmad-output/specs/spec-trip-contributors/SPEC.md
  - _bmad-output/planning-artifacts/architecture/architecture-trip-contributors-2026-08-31/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-trip-contributors-2026-08-31/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-trip-contributors-2026-08-31/EXPERIENCE.md
---

# Packt - Epic Breakdown: Trip Contributors

## Overview

This document provides the complete epic and story breakdown for the trip-contributors feature, decomposing its SPEC, Architecture Spine, and UX Design contract (DESIGN.md and EXPERIENCE.md) into implementable stories.

## Requirements Inventory

### Functional Requirements

_No PRD.md exists for this feature — Packt uses the bmad-spec workflow instead. The Capabilities section of `SPEC-trip-contributors` (SPEC.md) is the FR-equivalent source and is extracted below._

FR1: Manager shares a trip with a person by email; the email must match an existing Packt user, who gets an in-app invitation defaulting to role Viewer. An email with no matching account is rejected inline, with no invitation record created. (CAP-1)

FR2: An invited person accepts an in-app invitation and gains role-scoped access to exactly the shared trip; the invitation is never visible to, or acceptable by, any account other than the one matching the invited email. (CAP-2)

FR3: A viewer can open and read a shared trip's itinerary (days, events, locations) without seeing money, budget, or budget-report data anywhere they can reach it — including their own personal expense-reporting summary, where a shared trip they only view contributes nothing to totals, category/destination breakdowns, or budget-adherence counts; itinerary mutation, trip deletion, and contributor management are unavailable to them server-side, not just hidden in the UI. (CAP-3)

FR4: An editor can view and mutate itinerary and budget/money items on a shared trip, but cannot delete the trip or manage sharing. (CAP-4)

FR5: A manager holds owner-equivalent full access to a shared trip — edit, delete, invite/remove contributors, change contributor roles — all enforced server-side identically to the owner/creator. (CAP-5)

FR6: A manager administers every contributor, pending invitation, and declined invitation from one share dialog — the dialog lists active contributors, pending invitations, and declined invitations with role/status, supports role change/removal (staged), resend/rescind (pending rows, immediate), and dismiss (declined rows, immediate); the dialog cannot be closed with a staged role/removal change unsaved — only explicit Save or Cancel exits. (CAP-6)

FR7: Pending invitations expire automatically after a global 72-hour window; a manager can rescind one before acceptance, which drops it from the recipient's pending-invitations list instead of granting access — there is no separate rescinded-invite notice. (CAP-7)

FR8: Shared trip state — itinerary, events, locations, membership, and roles — updates live across sessions without a reload; when live sync cannot operate, an offline/internet-down indicator appears in the status bar. (CAP-8)

FR9: Removing a contributor revokes their access immediately and everywhere — the trip disappears at once from their dashboard/shared-trip list; if actively viewing it, a modal names the trip owner, directs them to request resharing, OK returns them to their own dashboard, and browser Back cannot reopen the trip. (CAP-9)

FR10: Concurrent edits to the same itinerary item from different contributors resolve without data corruption or a merge prompt — the latest write wins and all sessions converge to that value. (CAP-10)

FR11: An invited person can decline a pending invitation, immediately closing it out (rather than waiting for it to expire); declining requires no confirmation step. (CAP-11)

### Non-Functional Requirements

_Extracted from SPEC-trip-contributors' Constraints section._

NFR1: Trips are private by default; access is manager-issued only — no public discovery or access-request flow exists.

NFR2: Role boundaries (viewer/editor/manager) are enforced server-side; a UI-only restriction does not satisfy any capability.

NFR3: Invitation entry is email-only in this release — no user/friend picker.

NFR4: Invitations require an existing Packt account matching the invited email; there is no email delivery or signup route for unmatched addresses in this release.

NFR5: Invitation expiry (72 hours) is a single global application setting — not manager- or per-invitation-configurable.

NFR6: Contributor access persists after trip completion until a manager explicitly removes it — no automatic expiry.

NFR7: The share dialog cannot be dismissed while staged role/removal changes are unsaved; only Save or Cancel exits.

NFR8: Concurrent edit conflicts resolve latest-write-wins — no merge UI.

### Additional Requirements

_Extracted from the trip-contributors Architecture Spine. No starter template applies — this is additive work on the existing Packt codebase, not a greenfield setup._

- Data model: `collaborators.role` becomes `viewer | editor | manager` (replacing `owner`); add `collaborators.isCreator: boolean` (true for exactly one row per trip, the `trips.ownerId` user); existing `role='owner'` rows are data-migrated to `role='manager', isCreator=true` — no dual-read period. (AD-1)
- New `invitations` table (AD-2): `id, tripId, email, role, status(pending|accepted|declined|expired|rescinded), expiresAt, invitedBy, createdAt`, unique on `(tripId, email)` where `status='pending'`, `tripId` FK `ON DELETE CASCADE` matching `collaborators.tripId` — deleting a trip removes its invitations too.
  - No token/hash column — an invitation is only ever created for an email matching an existing account, so visibility and acceptance/decline are both scoped by matching `session.user.email` to `invitations.email` (case/whitespace-normalized on both sides), not by a bearer token.
  - `collaborators` rows are created only on acceptance, `userId` NOT NULL from that point forward.
  - Resend resets `expiresAt` (no token to rotate). Inviting an already-pending email is an implicit resend on the same row, never a duplicate.
  - Inviting an email that already has an active `collaborators` row on this trip, or matches the inviting manager's own account, is rejected — no invitation row is created.
  - Inviting an email with an existing undismissed *declined* row creates a fresh pending row and deletes the old declined row in the same write, so a dialog never accumulates more than one declined row per email.
  - The share dialog's invitations list reads `status IN ('pending', 'declined') AND (status != 'pending' OR expiresAt > now())` — a pending row past its `expiresAt` is excluded rather than shown stale, matching the dashboard's own expiry filter; the `status` column itself is never separately transitioned to `'expired'`, since query-time filtering covers every read path.
  - A declined row stays manager-visible until dismissed (`dismissInvitation(invitationId)`, hard delete, non-`pending` rows only, and only when `invitation.tripId === tripId`) or superseded by a fresh invite as above.
  - Rescinded/expired rows are not surfaced this way — they just stop appearing once no longer pending.
  - `resendInvitation`/`rescindInvitation`/`dismissInvitation` all verify `invitation.tripId === tripId` before acting, not only the caller's manager role on `tripId` — an id from another trip is rejected even if the caller manages *some* trip.
- Live sync (AD-3, AD-4): two Server-Sent Events (SSE) Route Handlers — `GET /api/trips/[tripId]/events` (gated `requireUser()` + `assertTripAccess(tripId, userId, "viewer")`) and `GET /api/users/me/events` (gated `requireUser()` only) — fanning out from an in-process pub-sub in `src/lib/trip-events.ts` (two `Map<topicId, Set<subscriberCallback>>`s on `globalThis`, same singleton shape as `db/index.ts`).
  - No new dependency; Redis/horizontal-scale fan-out explicitly deferred. This assumes a single running Node process — Packt is deployed as a single instance today. Scaling to multiple instances would silently break live sync and revocation (each instance's `globalThis` map is independent) and requires replacing this mechanism first, not deferring it further.
  - Each subscriber is removed from its topic's `Set` when the request's `AbortSignal` fires (client disconnect, tab close, navigation away) — connections never accumulate dead subscribers.
  - Removing a contributor, or deleting a trip, force-unsubscribes that user's `trip:{tripId}` subscriber as part of the same operation, and trip deletion additionally publishes a `trip-deleted` event so any still-open connection is told rather than left to time out.
  - Reconnect (`onopen`) triggers a full refetch; a self-targeted `membership-removed` short-circuits all in-flight refetch processing.
  - If no event has been published for an interval, a heartbeat comment keeps the connection alive; if no event or heartbeat has been received for longer than that interval plus a grace window, the client treats the channel as down and re-verifies access on next navigation rather than trusting stale client state indefinitely.
- Invitation acceptance and decline are authenticated and email-scoped, not a public route: `inviteContributor(tripId, email, role)` looks up `users` by email at write time — no match returns a validation error and persists nothing. `getMyPendingInvitations(userEmail)` in `src/lib/invitations.ts` lists invitations addressed to the signed-in user; `acceptInvitation(invitationId)` and `declineInvitation(invitationId)` (both in `trips/actions.ts`) are gated by `requireUser()`, each re-verifying `invitation.email === user.email` server-side, then performing one atomic conditional `UPDATE ... SET status='accepted'|'declined' WHERE id=? AND email=? AND status='pending' AND expiresAt > now() RETURNING *` — never read-then-write. No SMTP/email dependency, no token/crypto library needed. (AD-5)
- `(app)/layout.tsx` calls `getMyPendingInvitations(user.email)` once and passes its length into `SidebarNav` → the "Trips" `NavItem`'s existing `count` prop (same query the dashboard list uses, not a parallel count check) — the badge is the discovery mechanism that makes the invitation findable from any page, not just after navigating to the dashboard. (AD-5)
- Viewer financial exclusion (AD-6) threads the resolved role into two existing query call sites, not one:
  - `getTripDetail(tripId, userId)` resolves role via `assertTripAccess`'s existing lookup and passes it to `dbTripToType(dbRow, { role })`, which omits budget/expense/report fields for `role === "viewer"` — including any per-event/reservation `cost`/`price`-shaped field, not only the trip-level `budget`/`budgetTotal`/`budgetPerPerson` fields, checked against every such field currently defined in `src/data/types.ts` at implementation time.
  - Separately, `listExpensesForUserInRange(userId, ...)` (feeds the user's personal Spending/expense-report aggregation in `src/lib/spending.ts`) currently joins `collaborators` on `userId` with no role filter at all — gains `AND collaborators.role != 'viewer'` so a viewer-only trip never enters that user's own aggregate totals/graphs.
  - No parallel UI-only enforcement path at either site.
- The share dialog's row data (AD-7) comes from `getContributorsAndInvitations(tripId, userId)` — active `collaborators` plus `invitations WHERE status IN ('pending', 'declined')`, expiry-filtered per AD-2 — gated by `assertTripAccess(tripId, userId, "manager")` at the query itself, not only at the trigger button; an editor or viewer gets nothing back even if the dialog were somehow opened.
  - Save applies staged changes as one atomic batch via a single server action `saveContributorChanges(tripId, changes: ContributorChange[])` inside one DB transaction (all-or-nothing).
  - The server rejects the entire batch if any change targets an `isCreator=true` row, targets a `collaboratorId` not belonging to `tripId`, or targets the calling manager's own row (self-removal/self-demotion is unsupported via this action) — regardless of what the UI allowed to stage.
  - Each targeted row's current state is re-checked inside the transaction against what the dialog last loaded; if any row was modified by another manager's save in the meantime, the entire batch is rejected rather than silently reapplying against stale state.
  - Client-side staging is keyed by `collaboratorId` — a second staged action on the same row (a role change followed by Remove, or two role changes) replaces the earlier staged entry rather than accumulating both.
- `src/lib/use-live-sync.ts` client hook (wraps `EventSource`, exposes `{status: "connected" | "reconnecting" | "offline"}`) backs `src/components/packt/sync-status-indicator.tsx`, mounted once in `(app)/layout.tsx` alongside the existing `<Toaster/>`. Dashboard subscribes to `user:{userId}` so removal reflects without the trip page ever being open. (AD-8)
- Test environment: no email stub needed. E2E scenarios materialize their own `invitations`/`collaborators` rows per the project's self-seeding convention — no shared fixture trips.

### UX Design Requirements

_Extracted from the trip-contributors UX design contract (DESIGN.md and EXPERIENCE.md). Each item is scoped for a testable story — not summarized._

UX-DR1: Build the Share dialog (Base UI `Dialog`, `src/components/packt/trip-share-dialog.tsx`) replacing `trip-edit-collaborators.tsx` as the control plane: email input + role select (default Viewer) at top, one combined list mixing active contributors and pending invitations, each row with an avatar-initials chip (accent-soft/accent-ink tint), name/email, role pill or pending badge, and a remove/resend/rescind control. Entering an email with no matching Packt account shows an inline error next to the input ("No Packt account found for this email.") instead of creating a pending row. Follows the existing row rhythm (`gap-2`, `padding: 6px 8px`, `rounded.md`) — no new list-row layout.

UX-DR2: Role pill component — three tints per token set (manager = accent-soft/accent-ink; editor and viewer = neutral surface-2, differentiated by label only, never color-only).

UX-DR3: Pending-invite badge — `warning-soft`/`warning-ink` pill reading "Pending," shown on a pending row in place of a role pill.

UX-DR4: Creator row shows a lock icon (`aria-label="Trip creator — access can't be changed"`) instead of a role dropdown or remove control — never a disabled/grayed trash icon.

UX-DR5: Remove control — trash icon matching the existing `trip-edit-collaborators.tsx` icon-button, with a new hover-color delta from `fg-3` to `danger` (today's version has no hover color change).

UX-DR6: Pending invitation row offers Resend + Rescind actions instead of a role dropdown/remove control. Resend issues a fresh 72h window silently (no confirmation dialog). Rescind acts immediately with no extra confirmation. Re-inviting an email with an existing pending row updates that row in place (badge timestamp refreshes) rather than creating a duplicate row.

UX-DR6a: Declined invitation row — stays in the share dialog's list after the recipient declines (CAP-11), showing the declined-invite badge (`{colors.surface-2}`/`{colors.fg-3}`, neutral tone — not warning or danger) instead of the pending badge, with a single Dismiss control replacing Resend/Rescind. Dismiss deletes the row immediately, no confirmation. Re-inviting the same email creates a fresh pending row rather than reviving the declined one.

UX-DR7: Share dialog unsaved-changes guard — backdrop-click or `Esc` while a change is staged swaps the dialog's own content in place to an inline discard-confirmation view ("Discard unsaved changes?" / Discard / Keep editing), never a second stacked dialog. Moves focus to "Keep editing" (the safe default) and announces via `role="alertdialog"` + `aria-live="assertive"`. The explicit Cancel button is exempt — it already means discard and closes immediately.

UX-DR8: Revocation modal — Base UI `AlertDialog` (no backdrop-dismiss), single "OK" action, names the trip and the manager who removed them (`removedByName`/`removedByEmail` from the event payload, AD-3 — the acting manager, not necessarily the trip creator). If any other dialog is open when a self-targeted `membership-removed` event arrives, that dialog is force-closed (staged changes discarded) and the revocation modal takes its place — the one exception to the one-level-deep modal-stacking rule.

UX-DR9: Pending invitations list (`src/components/packt/pending-invitations-list.tsx`) — a pinned "Invitations" section at the top of the trips dashboard, above the trip cards, shown only when at least one pending invitation exists. Each row uses the share dialog's pending-row tokens (trip name, inviter, role) plus two buttons: Accept (primary variant) calls `acceptInvitation()` and redirects to the trip overview; Decline (outline/ghost variant) calls `declineInvitation()` and the row disappears immediately, confirmed via `toast.success("Invitation declined.")`. Neither action requires a confirmation step. An invitation that expires or is rescinded also just drops out of the list on next fetch/SSE refresh — no separate terminal-state page.

UX-DR10: Sync status indicator — new status-bar chip (no status bar exists in Packt today), three states: connected (quiet, `fg-4`, no accent color), reconnecting (`warning`, pulsing), offline (`danger`, static/non-pulsing). State changes announce via `aria-live="polite"`, including recovery back to connected. The reconnecting pulse respects `prefers-reduced-motion` (static warning-toned dot substitutes).

UX-DR11: Microcopy per the Voice and Tone table — direct, unadorned, no exclamation points: "Invitation sent." / "Invitation resent." / "Invitation declined." (via `toast.success()`); "No Packt account found for this email."; "This invitation was rescinded by the trip owner."; "You no longer have access to this trip. Contact {removedByName} to request access again."; "You're offline. Changes from other people won't appear until you reconnect."; role labels in UI are exactly Viewer/Editor/Manager, never invented synonyms.

UX-DR12: Accessibility floor — every interactive target in the share dialog, revocation modal, and pending invitations list meets the project's existing 44×44px minimum (role selects, resend/rescind/remove/accept buttons included); icon-only controls carry a `title` attribute naming the action and the person or trip (for example `title="Remove {name}"`, `title="Accept invitation to {tripName}"`); role/status is never color-only, every pill/badge carries a text label.

UX-DR13: Role-scoped view differences — a viewer's Budget tab/section is absent from trip navigation entirely (not present-but-disabled), and nothing in their itinerary view references money. An editor's view has no "Delete trip" action and no "Invite"/Share entry point at all (not disabled-with-tooltip) — matching the manager-only gating on the Share dialog trigger.

UX-DR14: Concurrent edit collisions render no conflict UI by design — the last write silently wins and every open session converges to it on its next refetch; do not build a "someone else changed this" surface for itinerary edits.

UX-DR15: Nav invitation badge — reuses `NavItem`'s existing (currently unused) `count` prop on the sidebar's "Trips" item, tinted `{colors.warning}` instead of the neutral default when count > 0, so a pending invitation is visible from any app page without requiring the recipient to navigate to the dashboard first. Absent entirely at count 0 (matches `NavItem`'s existing `count == null` behavior). Exposed to screen readers via `aria-label="Trips, {count} pending invitations"` on the nav link — not color-only, not visual-only.

### FR Coverage Map

FR1: Epic 1 - invite by email, matched-account only
FR2: Epic 1 - accept invitation, in-app and email-scoped
FR3: Epic 2 - viewer read-only, no financial data
FR4: Epic 2 - editor itinerary/budget access
FR5: Epic 2 - manager full access, creator protection
FR6: Epic 3 - share dialog contributor admin
FR7: Epic 1 - invitation expiry and rescind
FR8: Epic 4 - live cross-session sync
FR9: Epic 4 - immediate access revocation
FR10: Epic 4 - concurrent edit latest-write-wins
FR11: Epic 1 - decline a pending invitation

## Epic List

### Epic 1: Share a Trip and Accept an Invitation
**FRs covered:** FR1, FR2, FR7, FR11
**NFRs covered:** NFR1, NFR3, NFR4, NFR5, NFR6
**Implementation notes:** New `invitations` table, no token/hash column (AD-2), `collaborators.role` migration to `viewer|editor|manager` + `isCreator` (AD-1) — the invite/accept path is what first produces real collaborator rows, so the role model lands here. Authenticated, email-scoped acceptance and decline — no public route, no email delivery (AD-5). Pinned pending invitations list on the dashboard with Accept + Decline (UX-DR9), inline "no matching account" error in the share dialog (UX-DR1), sidebar nav badge as the discovery mechanism (UX-DR15).

### Epic 2: Role-Scoped Trip Access
**FRs covered:** FR3, FR4, FR5
**NFRs covered:** NFR2
**Implementation notes:** `assertTripAccess()` rank change, viewer financial exclusion threaded through `getTripDetail()`/`dbTripToType()` and `listExpensesForUserInRange()` (AD-6), server-side rejection of any change targeting `isCreator` row. UX-DR13 (budget tab/invite entry point absent, not disabled).

### Epic 3: Contributor Management Dialog
**FRs covered:** FR6
**NFRs covered:** NFR7
**Implementation notes:** `trip-share-dialog.tsx` replacing `trip-edit-collaborators.tsx`, `saveContributorChanges()` atomic batch action for role/removal (AD-7), `dismissInvitation()` as an immediate action alongside Resend/Rescind (AD-2, AD-7). UX-DR1, 2, 3, 4, 5, 6, 6a, 7, 12.

### Epic 4: Live Sync and Revocation
**FRs covered:** FR8, FR9, FR10
**NFRs covered:** NFR8
**Implementation notes:** `trip-events.ts` in-process pub-sub, both SSE routes, `use-live-sync.ts`, `sync-status-indicator.tsx` (AD-3/4/8). Revocation modal (UX-DR8), sync indicator (UX-DR10). CAP-10 needs no new mechanism — verified by test, not built.

---

## Epic 1: Share a Trip and Accept an Invitation

Trip manager invites someone by email; the email must match an existing Packt user, who gets an in-app invitation (an unmatched email is rejected inline, nothing persisted); the recipient accepts or declines from their dashboard, and accepting lands them on the trip. Handles expiry and rescind.

### Story 1.1: Migrate collaborator roles to viewer/editor/manager

As a trip manager,
I want the collaborator role model to support manager/editor/viewer with a protected creator seat,
So that the rest of the sharing feature has correct role ranks to build on.

**Acceptance Criteria:**

**Given** a `collaborators` row with `role = 'owner'`
**When** the migration runs
**Then** that row's `role` becomes `'manager'` and `isCreator` becomes `true`
**And** no other rows are altered

**Given** a trip with zero `role = 'owner'` rows, or more than one
**When** the migration runs
**Then** it aborts loudly for that trip rather than silently leaving zero or multiple `isCreator=true` rows — the "exactly one creator per trip" invariant is verified, not assumed

**Given** the updated schema
**When** `assertTripAccess(tripId, userId, "manager")` is called for a user whose role is `"editor"`
**Then** access is denied via `notFound()`

**Given** the updated schema
**When** `assertTripAccess(tripId, userId, "viewer")` is called for a user whose role is `"manager"`
**Then** access is granted

**Given** `CollaboratorRole` in `src/data/types.ts` now has values `viewer | editor | manager`
**When** `trip-edit-collaborators.tsx` renders a row with `role === "manager"`
**Then** its role select and remove control lock exactly as the prior `"owner"` row did
**And** `trip-edit-collaborators.test.tsx`, `trip-edit-sheet.test.tsx`, and `actions.test.ts` are updated to reference `"manager"` in place of `"owner"` and pass

**Given** seed sources (`src/db/seed-data/lisbon.ts`, `tokyo.ts`, `src/db/seed.ts`) reference `"owner"`
**When** the migration lands
**Then** they're updated to `"manager"` + `isCreator: true` for each trip's creator row

**Given** `assertTripAccess`'s `minRole` type no longer accepts `"owner"`
**When** the four existing call sites in `src/app/(app)/trips/actions.ts` (`deleteTrip`, `addCollaborator`, `removeCollaborator`, `updateCollaboratorRole`) are updated
**Then** each passes `"manager"` in place of `"owner"` and the project type-checks

### Story 1.2: Invite an existing Packt user to a trip

As a trip manager,
I want to invite a person to my trip by entering their email,
So that they can gain access without me sharing my login.

**Acceptance Criteria:**

**Given** I'm a manager on a trip and enter an email matching an existing Packt account with no active or pending membership on this trip
**When** I submit the invite (role defaults to Viewer)
**Then** an `invitations` row is created with `status='pending'`, the specified role, and `expiresAt = now() + 72h`

**Given** I enter an email with no matching Packt account
**When** I submit the invite
**Then** no `invitations` row is created and the action returns a validation error: "No Packt account found for this email"

**Given** a pending invitation already exists for `(tripId, email)`
**When** I invite that same email again to the same trip
**Then** the existing row is updated in place (role updated, `expiresAt` reset) rather than a new row being created

**Given** an undismissed declined invitation exists for `(tripId, email)`
**When** I invite that same email again
**Then** a fresh pending row is created and the old declined row is deleted in the same write, so the dialog never shows more than one declined row per email

**Given** the email matches an existing active collaborator on this trip, or matches my own account's email
**When** I submit the invite
**Then** it's rejected with a validation error and no `invitations` row is created

**Given** an invitation's stored email and a recipient account's email differ only in case or surrounding whitespace
**When** either is compared — for the active-collaborator check above, for dashboard/accept/decline matching in Story 1.3, or for the `(tripId, email)` uniqueness check
**Then** they're treated as the same email; both sides are normalized (lowercased, trimmed) at write and read time

**Given** I'm an editor (not a manager) on the trip
**When** `inviteContributor` is called
**Then** it's rejected server-side regardless of what the client sent

### Story 1.3: View, accept, or decline a pending invitation

As an invited Packt user,
I want to see invitations addressed to me and accept or decline them,
So that I gain access to a shared trip on my terms, without needing an email link.

**Acceptance Criteria:**

**Given** I have one or more pending, unexpired invitations
**When** I load any page in the app
**Then** the sidebar's "Trips" nav item shows a count badge equal to the number of pending invitations, tinted to the warning/pending register, with `aria-label="Trips, {count} pending invitations"` on the nav link

**Given** I have no pending invitations
**When** I load any page
**Then** the "Trips" nav item shows no badge

**Given** a pending, unexpired invitation matching my account email
**When** I view my trips dashboard
**Then** I see a pinned "Invitations" section above my trip list, showing the trip name, inviter, and role, with Accept and Decline buttons

**Given** a pending invitation addressed to a different account
**When** that account queries pending invitations, or calls `acceptInvitation`/`declineInvitation` with that invitation's id from their own session
**Then** it never appears in their list or badge count, and both calls are rejected server-side (email mismatch)

**Given** a pending, unexpired invitation addressed to me
**When** I click Accept
**Then** `acceptInvitation(invitationId)` atomically sets `status='accepted'`, inserts a `collaborators` row with my `userId` and the invitation's role, publishes a `membership-changed` event on `trip:{tripId}` (so an already-open share dialog or trip page picks up the new contributor without a manual refresh), and I'm redirected to the trip overview showing trip identity, who shared it, and my access level

**Given** a pending, unexpired invitation addressed to me
**When** I click Decline
**Then** `declineInvitation(invitationId)` atomically sets `status='declined'`, no `collaborators` row is created, the row disappears from my list immediately, and I see `toast.success("Invitation declined.")`

**Given** an invitation that's already been resolved (accepted, declined, rescinded, or expired)
**When** `acceptInvitation` or `declineInvitation` is called for it again
**Then** the conditional update matches zero rows, nothing is created, and the action reports failure

**Given** the invitation was resolved because a manager rescinded it, or it expired, moments before my click reached the server
**When** the resulting zero-row failure is reported
**Then** I see "This invitation was rescinded by the trip owner." (or the equivalent expired-state message) rather than a generic error, per UX-DR11

**Given** I double-click Accept or Decline, or the network retries my request
**When** the second call for the same invitation reaches the server after the first already succeeded
**Then** its zero-row match reports failure without creating or changing anything, and the UI does not surface a second error toast on top of the first call's success

**Given** the sidebar nav badge count from Story 1.3's first two ACs
**When** an invitation addressed to me is accepted, declined, expires, or is rescinded while I have any page open
**Then** the badge updates via the same live-sync channel as the pending-invitations list, not only on the next full page load

### Story 1.4: Invitation expiry and rescind

As a trip manager,
I want invitations to expire automatically and be rescindable,
So that stale or mistaken invites can't be accepted later.

**Acceptance Criteria:**

**Given** an invitation with `expiresAt` in the past and `status='pending'`
**When** the invited user's dashboard queries pending invitations
**Then** it's excluded from the list

**Given** an expired invitation
**When** `acceptInvitation` is called for it
**Then** the atomic conditional update matches zero rows and access is not granted

**Given** a manager rescinds a pending invitation
**When** the rescind action runs
**Then** the invitation's `status` becomes `'rescinded'` and it no longer appears in the recipient's pending list

**Given** a rescinded invitation
**When** `acceptInvitation` is called for it
**Then** zero rows match and access is not granted

**Given** an editor (not a manager) attempts to rescind an invitation
**When** the action runs
**Then** it's rejected server-side

**Given** an `invitationId` that belongs to a different trip than the one the caller manages
**When** rescind is called with that id
**Then** it's rejected — the action verifies `invitation.tripId === tripId`, not only the caller's manager role on some trip

---

## Epic 2: Role-Scoped Trip Access

Once someone has access, what they can see and do matches their role exactly, enforced server-side: viewers get read-only itinerary with no money data (in their own expense reporting too), editors can edit itinerary/budget but not delete or manage sharing, managers have full owner-equivalent control, and the creator's seat can't be touched by anyone.

### Story 2.1: Viewer gets a read-only, financial-data-free trip view

As a viewer,
I want to see the itinerary but not money or budget data,
So that a trip owner can share visibility without exposing financial details.

**Acceptance Criteria:**

**Given** a collaborator with role `"viewer"` requests trip detail via `getTripDetail(tripId, userId)`
**When** the result is mapped via `dbTripToType(dbRow, { role })`
**Then** `budget`, `budgetTotal`, `budgetPerPerson`, and expense/report fields are omitted from the returned object

**Given** a collaborator with role `"editor"` or `"manager"` requests trip detail
**When** mapped
**Then** those fields are included exactly as today

**Given** any event, reservation, or itinerary item that carries a `cost`/`price`-shaped field
**When** a viewer requests trip detail
**Then** that field is omitted exactly like the top-level budget fields — checked against every field currently defined for events/reservations in `src/data/types.ts`, not assumed absent

**Given** a viewer's trip page renders with no budget fields present in the returned data
**When** the trip detail shell builds its navigation
**Then** no Budget tab/section entry appears at all — not present-but-disabled

**Given** a viewer calls any itinerary/day/event/reservation/packing/document mutation action directly
**When** `assertTripAccess(tripId, userId, "editor")` runs
**Then** access is denied (regression coverage across representative mutation actions)

**Given** a viewer calls `deleteTrip`, `addCollaborator`, `removeCollaborator`, or `updateCollaboratorRole`
**When** `assertTripAccess(tripId, userId, "manager")` runs
**Then** access is denied

### Story 2.2: Editor sees full itinerary/budget access without trip-management controls

As an editor,
I want to edit the itinerary and budget but not see trip-management controls I can't use,
So that the UI matches my actual permissions.

**Acceptance Criteria:**

**Given** an editor requests trip detail
**When** mapped via `dbTripToType(dbRow, { role: "editor" })`
**Then** budget/expense/report fields are included exactly as for a manager

**Given** an editor's trip page renders
**When** the trip detail shell builds its action controls
**Then** "Delete trip" and the "Invite"/Share entry point are absent from the rendered output — not disabled-with-tooltip

**Given** an editor calls `deleteTrip`, `addCollaborator`, `removeCollaborator`, or `updateCollaboratorRole`
**When** `assertTripAccess(tripId, userId, "manager")` runs
**Then** access is denied

**Given** an editor calls an itinerary or budget mutation action (for example update an event, add an expense)
**When** `assertTripAccess(tripId, userId, "editor")` runs
**Then** it succeeds (regression coverage confirming the role rename didn't affect editor's existing write access)

### Story 2.3: Manager has full trip control; the creator's seat can't be touched

As a manager,
I want the same control as the trip creator, except I can never remove or demote the creator,
So that ownership stays anchored to one person while I still get full delegated management.

**Acceptance Criteria:**

**Given** a manager (`isCreator=false`) calls `deleteTrip`, `addCollaborator`, `removeCollaborator`, or `updateCollaboratorRole`
**When** `assertTripAccess(tripId, userId, "manager")` runs
**Then** access is granted identically to the creator

**Given** a manager's trip page renders
**When** the trip detail shell builds its action controls
**Then** "Delete trip" and "Invite" are visible, matching the creator's view

**Given** any caller — including another manager — calls `removeCollaborator` or `updateCollaboratorRole` targeting a `collaborators` row where `isCreator=true`
**When** the action runs
**Then** it's rejected server-side regardless of the caller's own role, and no change is made to that row

**Given** the creator's own row in `trip-edit-collaborators.tsx`
**When** it renders for a manager viewing the dialog
**Then** the role select and remove control remain locked — and the prior AC confirms this holds server-side too, not just in the UI

### Story 2.4: Viewer's shared trips are excluded from personal expense reporting

As a user viewing my own Spending/expense-report summary,
I want trips where I'm only a viewer excluded from my totals and graphs,
So that I never see financial data from a trip I only have read access to, even in aggregate.

**Acceptance Criteria:**

**Given** I collaborate on a trip with role `"viewer"` and on others with role `"editor"` or `"manager"`
**When** `listExpensesForUserInRange(userId, startDate, endDate)` runs for me
**Then** the viewer-role trip is excluded from the returned `trips` list, and none of its expenses are returned either

**Given** the viewer-role trip is excluded from `listExpensesForUserInRange`'s result
**When** `buildSpendingSummary` aggregates the result
**Then** that trip contributes nothing to `totalSpend`, `averageTripSpend`/`averageDailySpend`, `categoryBreakdown`, `destinationBreakdown`, or `budgetAdherence`

**Given** the same trip's role later changes from viewer to editor or manager
**When** `listExpensesForUserInRange` is next called for me
**Then** the trip and its expenses are included, matching non-viewer behavior — the exclusion is role-derived, not a stored flag

---

## Epic 3: Contributor Management Dialog

A manager administers every contributor, pending invitation, and declined invitation from one dialog — role changes and removal are staged and applied as one batch; resend, rescind, and dismiss (on a declined row) act immediately. The dialog can't be closed with unsaved changes.

### Story 3.1: Build the share dialog shell with active/pending/declined rows

As a trip manager,
I want a single dialog listing everyone with access or a pending/declined invite to my trip,
So that I have one place to see the full state of who can see or edit my trip.

**Acceptance Criteria:**

**Given** I'm a manager viewing a trip's detail page
**When** I click "Invite" on the Collaborators rail
**Then** `trip-share-dialog.tsx` opens (the rail's previously non-functional Invite button is wired for the first time)

**Given** I'm an editor or a viewer on the trip
**When** I view the trip detail page
**Then** the Collaborators rail's Invite button is absent for both roles — not just editor

**Given** the dialog's row data comes from `getContributorsAndInvitations(tripId, userId)`
**When** an editor or viewer calls it directly (bypassing the UI)
**Then** `assertTripAccess(tripId, userId, "manager")` rejects it — pending/declined invitation emails are never returned to a non-manager, regardless of how the call was made

**Given** the dialog is open on a trip with no contributors beyond the creator and no pending/declined invitations
**When** it renders
**Then** it shows only the creator's locked row plus the email input + role select (default Viewer) at top — there is no separate "No collaborators yet." empty state, since every trip always has at least the creator's own row (AD-1)

**Given** the trip has active collaborators, pending invitations, and declined invitations
**When** the dialog renders
**Then** it shows one combined list: active rows with a role pill, pending rows with the pending badge, declined rows with the declined badge — matching the existing row rhythm

**Given** a pending invitation whose `expiresAt` has passed
**When** the dialog loads via `getContributorsAndInvitations`
**Then** it's excluded from the pending grouping, matching the dashboard's own expiry filter (Story 1.4) — a manager never sees a stale "Pending" badge on a dead invitation

**Given** the dialog is open when another contributor accepts a pending invitation for this trip
**When** the resulting `membership-changed` event (Story 1.3, Epic 4 live sync) arrives
**Then** the dialog's list refetches and shows the new contributor without the manager closing and reopening it

**Given** the creator's own row
**When** rendered
**Then** it shows a lock icon (`aria-label="Trip creator — access can't be changed"`) instead of a role dropdown or remove control

**Given** the new dialog now exists alongside the still-present `trip-edit-sheet.tsx` collaborators tab
**When** either surface is used
**Then** they coexist without conflict — role-editing/removal still only works via the old sheet until Story 3.4 retires it

### Story 3.2: Resend and Rescind a pending invitation

As a trip manager,
I want to resend or rescind a pending invitation from the share dialog,
So that I can fix a stale invite or cancel one without leaving the dialog.

**Acceptance Criteria:**

**Given** a pending row
**When** I click Resend
**Then** the existing resend logic (`invitations.ts`) runs immediately with no confirmation, resetting `expiresAt`, and the row's badge timestamp updates in place

**Given** a pending row
**When** I click Rescind
**Then** the invitation's `status` becomes `'rescinded'` immediately with no confirmation, and the row disappears from the dialog's list

**Given** I'm an editor, not a manager
**When** I call resend or rescind directly
**Then** it's rejected server-side

**Given** an `invitationId` that belongs to a different trip than the one being managed
**When** resend or rescind is called with that id
**Then** it's rejected — the action verifies `invitation.tripId === tripId` before acting, not only the caller's manager role on some trip

**Given** any pending row
**When** rendered
**Then** its controls carry `title="Resend invitation to {email}"` / `title="Rescind invitation to {email}"`

### Story 3.3: Dismiss a declined invitation

As a trip manager,
I want to dismiss a declined invitation from the share dialog,
So that resolved invites don't linger in my view indefinitely.

**Acceptance Criteria:**

**Given** a declined row
**When** I click Dismiss
**Then** `dismissInvitation(invitationId)` hard-deletes the row immediately with no confirmation, and it disappears from the dialog's list

**Given** I'm an editor, not a manager
**When** I call `dismissInvitation`
**Then** it's rejected server-side

**Given** an invitation that's still `pending`
**When** `dismissInvitation` is called for it
**Then** it's rejected — Dismiss is only valid on a non-pending (declined) row

**Given** an `invitationId` that belongs to a different trip than the one being managed
**When** `dismissInvitation` is called with that id
**Then** it's rejected — the action verifies `invitation.tripId === tripId` before deleting

### Story 3.4: Stage and save role changes and removals as one batch

As a trip manager,
I want to change roles and remove contributors as staged edits I can review before saving,
So that I don't make membership changes one accidental click at a time.

**Acceptance Criteria:**

**Given** an active contributor row (not the creator's)
**When** I change its role select
**Then** the change is staged client-side only — no server call yet

**Given** a staged role change
**When** I click Remove on a different active row
**Then** the removal is also staged — multiple staged changes accumulate

**Given** a row already has a staged change
**When** I stage a different change for that same row (a second role change, or Remove after a role change)
**Then** the new staged entry replaces the earlier one for that row — staging is keyed by `collaboratorId`, never both applying

**Given** one or more staged changes
**When** I click Save
**Then** `saveContributorChanges(tripId, changes)` applies every staged change inside one DB transaction — all land or none do

**Given** a staged batch where any entry targets the `isCreator` row, targets a `collaboratorId` that does not belong to `tripId`, or targets the calling manager's own row
**When** Save is called
**Then** the server rejects the entire batch and nothing lands, even the other, unrelated staged changes — self-removal/self-demotion is unsupported via this action

**Given** a staged batch entry whose target row was modified by another manager's save since this dialog last loaded its data
**When** Save is called
**Then** the entire batch is rejected rather than silently reapplying a change against stale row state

**Given** one or more staged changes
**When** I click Cancel
**Then** all staged state is discarded client-side with no server call

**Given** `saveContributorChanges` now covers role-change and removal
**When** this story lands
**Then** `trip-edit-sheet.tsx`'s collaborators tab, `trip-edit-collaborators.tsx`, and the legacy `addCollaborator`/`removeCollaborator`/`updateCollaboratorRole` actions are removed — `trip-share-dialog.tsx` is the sole control plane
**And** `trip-edit-collaborators.test.tsx` is deleted and `trip-edit-sheet.test.tsx`'s collaborators-tab assertions are removed in the same change, so no test references deleted markup or components

**Given** an editor calls `saveContributorChanges` directly
**When** the action runs
**Then** it's rejected server-side

### Story 3.5: Unsaved-changes guard on dialog close

As a trip manager,
I want the dialog to stop me from losing staged changes by accident,
So that a stray click or Esc doesn't silently discard membership edits.

**Acceptance Criteria:**

**Given** staged changes exist
**When** I press `Esc` or click the backdrop
**Then** the dialog does not close — its content swaps in place to a discard-confirmation view ("Discard unsaved changes?" / Discard / Keep editing)

**Given** the discard-confirmation view is shown
**When** it renders
**Then** focus moves to "Keep editing" and the region announces via `role="alertdialog"` + `aria-live="assertive"`

**Given** the discard-confirmation view
**When** I click Discard
**Then** staged changes are cleared and the dialog closes

**Given** the discard-confirmation view
**When** I click "Keep editing"
**Then** it swaps back to the normal dialog content with staged changes intact

**Given** no staged changes exist
**When** I press `Esc` or click the backdrop
**Then** the dialog closes normally — no discard-confirmation view

**Given** staged changes exist
**When** I click the explicit Cancel button (not `Esc`/backdrop)
**Then** it discards immediately without showing the discard-confirmation view

**Given** staged changes exist
**When** I navigate away via an in-app link, the sidebar, or programmatic navigation (not `Esc`/backdrop/Cancel)
**Then** the same discard-confirmation guard intercepts the navigation before it proceeds — staged changes are never silently lost via routing

---

## Epic 4: Live Sync and Revocation

Contributors see trip changes live across open sessions, know when they've gone offline, and someone whose access is removed is told immediately and can't get back in — even mid-session.

### Story 4.1: SSE pub-sub infrastructure and both routes

As a contributor with a trip page or dashboard open,
I want the server to notify my browser when relevant changes happen,
So that I don't have to manually refresh to see updates.

**Acceptance Criteria:**

**Given** `trip-events.ts`
**When** a server action calls `publishTripEvent(tripId, event)`
**Then** every subscriber callback registered for topic `trip:{tripId}` on the `globalThis` map receives it in-process

**Given** `trip-events.ts`
**When** a server action calls `publishUserEvent(userId, event)` for a membership change or removal
**Then** every subscriber callback registered for topic `user:{userId}` receives it

**Given** `GET /api/trips/[tripId]/events`
**When** requested by an unauthenticated caller
**Then** `requireUser()` rejects before any subscription is created

**Given** `GET /api/trips/[tripId]/events`
**When** requested by an authenticated user without at least viewer access
**Then** `assertTripAccess(tripId, userId, "viewer")` rejects via `notFound()` before subscription

**Given** `GET /api/users/me/events`
**When** requested by an authenticated user
**Then** it subscribes to `user:{userId}` for that user only, gated by `requireUser()` alone — no trip access check

**Given** either open SSE connection
**When** no event has been published for an interval
**Then** a heartbeat comment is sent so the connection doesn't idle-timeout

**Given** a client connected to `/api/trips/[tripId]/events`
**When** an itinerary mutation server action commits
**Then** the client receives an `itinerary-changed` event

**Given** an open SSE connection
**When** its request's `AbortSignal` fires (client disconnect, tab close, navigation away)
**Then** that subscriber callback is removed from its topic's `Set` immediately — connections never accumulate dead subscribers on `globalThis`

**Given** a contributor is removed from a trip while their `/api/trips/[tripId]/events` connection is open
**When** the removal commits
**Then** that user's subscriber for `trip:{tripId}` is force-unsubscribed as part of the same operation, independent of whether the revocation modal (Story 4.4) has rendered yet

**Given** a manager deletes a trip that has pending or declined invitations, or open subscriber connections
**When** `deleteTrip` commits
**Then** its `invitations` rows are removed by cascade (matching `collaborators`), and a `trip-deleted` event publishes to `trip:{tripId}` so any open connection is told rather than orphaned

### Story 4.2: Sync status indicator

As any signed-in user,
I want to see whether my live connection to Packt is working,
So that I know if I might be looking at stale data.

**Acceptance Criteria:**

**Given** `use-live-sync.ts` mounted on the dashboard
**When** it initializes
**Then** it opens an `EventSource` against `/api/users/me/events` and exposes `status: "connected"` once open

**Given** `use-live-sync.ts` mounted on a trip page
**When** it initializes
**Then** it opens `EventSource` connections against both `/api/users/me/events` and `/api/trips/[tripId]/events`

**Given** the `EventSource` connection drops
**When** `onerror` fires and reconnect begins
**Then** `status` becomes `"reconnecting"`

**Given** reconnect attempts continue to fail past a threshold
**When** that threshold is reached
**Then** `status` becomes `"offline"`

**Given** `sync-status-indicator.tsx`
**When** `status` is `"connected"`
**Then** it renders quietly in `{colors.fg-4}` with no accent color

**Given** `sync-status-indicator.tsx`
**When** `status` is `"reconnecting"`
**Then** it renders in the warning tone with a pulse animation, or as a static warning-toned dot when `prefers-reduced-motion` is set

**Given** `sync-status-indicator.tsx`
**When** `status` is `"offline"`
**Then** it renders in the danger tone, static — never pulsing

**Given** any status transition
**When** it occurs
**Then** it's announced via `aria-live="polite"`, including the transition back to `"connected"` after a reconnect

**Given** `(app)/layout.tsx`
**When** it renders
**Then** `<SyncStatusIndicator/>` is mounted once, alongside the existing `<Toaster/>`

### Story 4.3: Trip page live refresh on itinerary and membership events

As a contributor viewing a trip,
I want changes other contributors make to appear without me refreshing,
So that I'm always looking at current trip state.

**Acceptance Criteria:**

**Given** a trip page open with an active `EventSource` to `/api/trips/[tripId]/events`
**When** an `itinerary-changed` event arrives
**Then** the page triggers a refetch of the relevant trip data

**Given** the `EventSource` reconnects (`onopen` firing after any disconnect, not just the initial connect)
**When** reconnection completes
**Then** a full refetch of the trip's relevant state runs, regardless of whether any event was received during the gap

**Given** two refetches are triggered in quick succession
**When** their responses return out of order
**Then** only the response to the most-recently-issued request is applied — a monotonic request-generation counter discards a stale response

**Given** two contributors edit the same itinerary item nearly simultaneously
**When** both writes commit
**Then** the latest write wins with no merge prompt or corruption, and both sessions converge to that value on their next refetch (CAP-10 regression coverage — no new mechanism)

**Given** a `membership-changed` event naming a different user, not the current viewer
**When** it arrives
**Then** the trip page's contributor-related data refetches, but no interrupt or modal is shown

**Given** a `membership-changed` event names the current viewer themselves (a role change, not removal) while they're on the trip page
**When** it's processed
**Then** role-gated UI (Budget tab, mutation controls, Share entry point) re-evaluates against the new role immediately — not only on the next full page load — with no separate "your role changed" interstitial, matching the dashboard's own behavior for this case

### Story 4.4: Revocation modal on self-targeted removal

As a contributor who has just been removed from a trip,
I want to be told immediately and returned to my own dashboard,
So that I'm not left looking at a trip I no longer have access to.

**Acceptance Criteria:**

**Given** I'm viewing any authenticated page
**When** a `membership-removed` event naming my own `userId` arrives, on either SSE channel
**Then** `contributor-revocation-modal.tsx` renders immediately as an `AlertDialog` with no backdrop-dismiss and a single "OK" action

**Given** the modal renders
**When** it does
**Then** it names the trip and the manager who removed them, using `tripName`/`removedByName`/`removedByEmail` carried inline in the event payload — never a fresh fetch, since `assertTripAccess` would already reject one

**Given** the `membership-removed` event names my own `userId`
**When** it arrives
**Then** all further event/refetch processing for that trip short-circuits immediately — no stale in-flight response can repaint revoked content after the modal renders

**Given** another dialog (for example the share dialog, with staged changes) is open when a self-targeted `membership-removed` event arrives
**When** the event is processed
**Then** that dialog is force-closed, its staged changes discarded, and the revocation modal takes its place as the sole open surface

**Given** the revocation modal is showing
**When** I click OK
**Then** I'm returned to my own dashboard

**Given** I've been removed and returned to the dashboard
**When** I press the browser Back button
**Then** the trip page hits `assertTripAccess()`'s existing `notFound()` — not a client-side route guard — and I can't reopen it

**Given** the browser restores the trip page from back-forward cache (bfcache) instead of issuing a fresh navigation
**When** that restoration happens
**Then** the page's `pageshow` handling forces a reload/refetch so `assertTripAccess()` still runs — bfcache restoration cannot bypass the access check

**Given** the SSE connection to `/api/users/me/events` has delivered no event or heartbeat for longer than the heartbeat interval plus a grace window
**When** that threshold is reached
**Then** the client treats the channel as down (`sync-status-indicator.tsx` shows "offline") and re-verifies trip/membership access on the next navigation — a dead channel cannot mask a revocation indefinitely

### Story 4.5: Dashboard reflects membership changes live

As a contributor on multiple shared trips,
I want my dashboard to reflect a removal immediately, even if I never had that trip page open,
So that I always see an accurate list of trips I have access to.

**Acceptance Criteria:**

**Given** the trips dashboard is open
**When** `use-live-sync.ts` is mounted there
**Then** it subscribes to `/api/users/me/events` — my own channel

**Given** a `membership-removed` event naming me arrives while the dashboard is open
**When** it's processed
**Then** that trip disappears from my shared-trip list immediately, without a page reload

**Given** the trip page for that trip was never opened during the session
**When** the removal event arrives on the dashboard's own `user:{userId}` subscription
**Then** the dashboard still reflects the removal — this doesn't depend on the trip-scoped SSE channel ever having been open

**Given** a `membership-changed` event (role change, not removal) naming me arrives while the dashboard is open
**When** it's processed
**Then** my next server action/query against that trip reflects the new role — no separate "your role changed" interstitial is shown
