# Epic 3 Context: Contributor Management Dialog

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Give a trip manager a single share dialog from which they administer every contributor, pending invitation, and declined invitation on a trip. Role changes and removals are staged client-side and applied as one atomic batch; pending-row Resend/Rescind and declined-row Dismiss act immediately on click. The dialog refuses to close while staged changes are unsaved. This epic retires the legacy `trip-edit-collaborators.tsx` / `trip-edit-sheet.tsx` collaborators tab as the sole control plane, so no other surface edits roles or membership.

## Stories

- Story 3.1: Build the share dialog shell with active/pending/declined rows
- Story 3.2: Resend and Rescind a pending invitation
- Story 3.3: Wire invite form and remove dead collaborator surfaces
- Story 3.4: Dismiss a declined invitation
- Story 3.5: Stage and save role changes and removals as one batch
- Story 3.6: Unsaved-changes guard on dialog close

## Requirements & Constraints

- Manager-only surface: an editor or viewer must not see the Invite trigger, and `getContributorsAndInvitations` is gated by `assertTripAccess(tripId, userId, "manager")` at the query itself — pending/declined invitation emails are never returned to a non-manager even if the dialog is bypassed.
- The dialog cannot be closed via `Esc` or backdrop-click, staged changes or not — both are unconditional no-ops. Only explicit Save (saves and closes; disabled with no staged changes) or Cancel (discards immediately and closes) exits, plus the explicit close (X) button, which also discards and closes immediately.
- Row data is active `collaborators` plus `invitations WHERE status IN ('pending','declined')`, expiry-filtered (`status != 'pending' OR expiresAt > now()`) so stale expired pending rows are never shown as "Pending".
- Pending-row Resend and Rescind, and declined-row Dismiss (`dismissInvitation`), all act immediately with no confirmation. Dismiss is a hard delete valid only for non-pending rows. Each verifies `invitation.tripId === tripId` before acting, not just the caller's manager role on some trip.
- Role/removal edits are staged; staging is keyed by `collaboratorId`, so a second staged change on the same row replaces the earlier one.
- Invite entry: email matching an existing Packt account, role default Viewer; unmatched email shows an inline error and persists nothing. (Invite-creation itself is Epic 1; the dialog hosts the input here.)

## Technical Decisions

- New `src/components/packt/trip-share-dialog.tsx` (Base UI `Dialog`) replaces `trip-edit-collaborators.tsx` as the control plane.
- `getContributorsAndInvitations(tripId, userId)` supplies row data; `contributor-actions.ts` hosts `saveContributorChanges`, `dismissInvitation`, (and `getContributorsAndInvitations`), per the architecture file layout.
- Save calls exactly one server action, `saveContributorChanges(tripId, changes: ContributorChange[])`, applying all staged changes in a single DB transaction — all-or-nothing. Each `ContributorChange` is a role-change or removal keyed by id.
- Server rejects the entire batch if any `ContributorChange` targets an `isCreator=true` row, any id not belonging to `tripId`, or the calling manager's own row — regardless of what the UI staged. The dialog's disabled creator controls are UX only, never the enforcement point.
- Each entry applies against an expected-state guard (row still exists; for a role change, still holds the staged from-role). If any guard fails (concurrent save by another manager), the whole batch is rejected; no partial or unconditional apply.
- Resend, Rescind, Dismiss are not staged — they fire immediately, matching the existing non-batched treatment of invitation-row actions.

## UX & Interaction Patterns

- Combined list mixing active contributors, pending invitations, and declined invitations, following the existing `trip-edit-collaborators.tsx` row rhythm (`gap-2`, padding 6px 8px, `rounded-md`); no new row layout. Rows use the avatar-initials chip (accent-soft/accent-ink), name/email, and a role pill or status badge.
- Role pill tokens by role: manager = accent-soft/accent-ink; editor and viewer share neutral surface-2, differentiated by text label, never color-only. Pending badge = warning-soft/warning-ink "Pending" pill in place of a role pill. Declined badge = neutral surface-2/fg-3 "Declined" pill with a single Dismiss control.
- Creator row shows a lock icon (`aria-label="Trip creator — access can't be changed"`) instead of a role dropdown or remove control — never a disabled trash icon.
- Remove control is a trash icon matching the existing icon-button pattern with a new hover-color delta from `fg-3` to `danger`.
- Pending row offers Resend + Rescind instead of role dropdown/remove; declined row offers only Dismiss. Re-inviting an email with an existing pending row updates that row in place (badge timestamp refreshes) rather than adding a duplicate.
- Unsaved-changes guard: backdrop-click and `Esc` are unconditional no-ops on this dialog — never a discard-confirmation view, never keyed on staged-change state. Save and Cancel render always (not conditional on staged changes); Save is disabled until something is staged. In-app routing interception remains deferred, tracked separately outside story 3.6.
- Accessibility floor: every interactive target (role selects, resend/rescind/remove/dismiss/accept) meets the 44×44px minimum; icon-only controls carry a `title` naming the action and person (`title="Rescind invitation to {email}"`); role/status never color-only, every pill/badge carries a text label.

## Cross-Story Dependencies

- Builds on Epic 1's `invitations` data model (AD-2): the dialog reads the same invitations table Epic 1 writes, and relies on the role model and creator-protection (`isCreator`, AD-1) migrated there. Resend/rescind/dismiss server logic lives with Epic 1's `invitations.ts` / `contributor-actions.ts`.
- Story 3.3 removes `trip-edit-sheet.tsx`'s collaborators tab, `trip-edit-collaborators.tsx`, and the legacy `addCollaborator`/`removeCollaborator`/`updateCollaboratorRole` actions; until then the old sheet and new dialog coexist.
- Dialog must refetch its list when a `membership-changed` event arrives (Epic 4 live sync) so a new accept appears without closing/reopening. Epic 4's revocation modal force-closes this dialog (discarding staged changes) on a self-targeted removal.
