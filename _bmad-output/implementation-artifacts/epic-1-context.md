# Epic 1 Context: Share a Trip and Accept an Invitation

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

A trip manager shares a trip with another person by email; the email must match an existing Packt account, and that person receives an in-app invitation (default role Viewer) they can accept or decline from their own dashboard — no email delivery, no signup route, no token/link involved anywhere in the flow. This epic establishes the role model (`viewer | editor | manager` + a protected creator seat) that every later epic builds on, and delivers the full invitation lifecycle: send, implicit resend, rescind, automatic 72-hour expiry, and decline. It matters because it's the foundation the rest of trip-contributors depends on — nothing else in the feature can be built until real collaborator rows and invitation rows exist with the right shape.

## Stories

- Story 1.1: Migrate collaborator roles to viewer/editor/manager
- Story 1.2: Invite an existing Packt user to a trip
- Story 1.3: View, accept, or decline a pending invitation
- Story 1.4: Invitation expiry and rescind

## Requirements & Constraints

- Inviting by email only works for an email matching an existing Packt account; an unmatched email is rejected inline with no invitation row ever created — no email delivery, no signup route exists for this release.
- An accepted invitation grants role-scoped access to exactly the shared trip; an invitation is never visible to, or acceptable/declinable by, any account other than the one matching the invited email — enforced server-side, not just by what the UI shows.
- A person can decline a pending invitation with no confirmation step, closing it out immediately rather than waiting for it to expire.
- Invitation expiry is a single fixed global setting (72 hours from creation) — not configurable per-manager or per-invitation.
- Contributor access, once granted, persists indefinitely until a manager explicitly removes it — no automatic expiry tied to trip completion.
- Trips stay private by default: access is manager-issued only, no public discovery or access-request flow.

## Technical Decisions

- `collaborators.role` becomes `viewer | editor | manager` (replacing `owner`); add `collaborators.isCreator: boolean`, true for exactly one row per trip (the `trips.ownerId` user). Existing `role='owner'` rows migrate to `role='manager', isCreator=true` in one cutover, no dual-read period. `assertTripAccess(tripId, userId, minRole)` ranks `viewer=0, editor=1, manager=2`. Update the four existing call sites in `trips/actions.ts` (`deleteTrip`, `addCollaborator`, `removeCollaborator`, `updateCollaboratorRole`) plus seed data (`lisbon.ts`, `tokyo.ts`, `seed.ts`) to match.
- New `invitations` table: `id, tripId, email, role, status(pending|accepted|declined|expired|rescinded), expiresAt, invitedBy, createdAt`; unique on `(tripId, email)` where `status='pending'`; `tripId` FK `ON DELETE CASCADE`. No token/hash column — visibility and acceptance are scoped by matching `session.user.email` to `invitations.email` (both normalized: lowercased, trimmed), never a bearer token. `collaborators` rows are created only on acceptance, with `userId` NOT NULL from that point.
- Inviting an email already pending on the same trip is an implicit resend (same row, role updated, `expiresAt` reset) — never a duplicate. Inviting an email with an undismissed declined row creates a fresh pending row and deletes the old declined row in the same write. Inviting an email that already has an active collaborator on the trip, or matches the inviting manager's own account, is rejected with no row created.
- Reads of pending invitations always filter `expiresAt > now()` at query time — `status` is never separately transitioned to `'expired'`; the same filter backs the dashboard list, the nav badge count, and (later, Epic 3) the share dialog.
- `acceptInvitation(invitationId)` / `declineInvitation(invitationId)` (`trips/actions.ts`) are gated by `requireUser()`, re-verify `invitation.email === user.email` server-side, then run one atomic conditional `UPDATE ... SET status=... WHERE id=? AND email=? AND status='pending' AND expiresAt > now() RETURNING *` — never read-then-write, so a double-click, a race with expiry, or a race with a manager's rescind all resolve to a clean zero-row failure rather than a corrupted state. Accept additionally inserts the `collaborators` row only when a row comes back.
- `rescindInvitation` (manager-only) sets `status='rescinded'`; must verify `invitation.tripId === tripId`, not only the caller's manager role on some trip.
- `getMyPendingInvitations(userEmail)` (`src/lib/invitations.ts`) is the single query backing both the dashboard's pending invitations list and `(app)/layout.tsx`'s call that feeds `SidebarNav`'s "Trips" `NavItem.count` — same query, not a parallel count check.
- No SMTP/email dependency, no token/crypto library — everything in this epic is authenticated, in-app, email-scoped.

## UX & Interaction Patterns

- Share dialog invite entry (top of the eventual `trip-share-dialog.tsx`, though the full dialog shell itself ships in Epic 3): email input + role select, default Viewer. An unmatched email shows an inline error next to the input — "No Packt account found for this email." — instead of creating a pending row.
- Pending invitations list (`pending-invitations-list.tsx`): a pinned "Invitations" section above the trip cards on the dashboard, shown only when at least one pending invitation exists. Each row shows trip name, inviter, role, with Accept (primary) and Decline (outline/ghost) buttons — neither needs confirmation. Accept redirects to the trip overview; Decline removes the row immediately with `toast.success("Invitation declined.")`. An expired or rescinded invitation just drops out on next fetch — no terminal-state page.
- Nav invitation badge: sidebar "Trips" `NavItem.count`, tinted warning when count > 0, absent entirely at 0, with `aria-label="Trips, {count} pending invitations"` on the nav link — the discovery mechanism that makes the invitation findable from any page.
- Microcopy is direct and unadorned, no exclamation points: "Invitation sent." / "Invitation resent." / "Invitation declined." via `toast.success()`; "No Packt account found for this email."; "This invitation was rescinded by the trip owner." (or equivalent for expired). Role labels are exactly Viewer/Editor/Manager.
- Every interactive target (role select, Accept/Decline buttons) meets the existing 44×44px minimum; icon-only controls carry a `title` naming the action and the trip/person, e.g. `title="Accept invitation to {tripName}"`.

## Cross-Story Dependencies

- Story 1.1 (role model + `isCreator`) is a hard prerequisite for 1.2–1.4 and for every later epic — `assertTripAccess`'s rank check and the migrated seed data must land first.
- Story 1.2 (invite) produces the `invitations` rows that Story 1.3 (accept/decline) and Story 1.4 (expiry/rescind) both read and mutate; the email-normalization rule and the `(tripId, email)` uniqueness behavior are shared logic across all three.
- Story 1.3's AC that the nav badge updates live (without a full page reload) depends on the SSE/live-sync infrastructure built in Epic 4 (Story 4.1's pub-sub, `use-live-sync.ts`) — until that lands, badge/list correctness can be verified on navigation/refetch, with the live-update path completed once Epic 4's channel exists.
- The full `trip-share-dialog.tsx` shell (email input, combined active/pending/declined list) is built in Epic 3 (Story 3.1); this epic implements the underlying `inviteContributor`/`resendInvitation`/`rescindInvitation` actions and their validation rules, which Epic 3's UI then wires up to the dialog.
