# Trip Contributors — Phased Task List

## Scope guardrails

- Trips remain private by default. Access is manager-issued only; no public discovery or access-request flow.
- Invitation entry is email-only. Existing Packt users receive an in-app invitation; people without an account receive an email invitation with a sign-up route.
- Invitation links are bound to intended email address and cannot be accepted by an account using a different email.
- Share dialog is contributor control plane for invitations, pending invitations, active contributors, role changes, removal, resend, and audit.

## Phase 1 — Must: trusted viewer-sharing foundation

1. Define contributor membership, invitation, role, and invitation-state records.
   - Acceptance outcome: system can distinguish pending, accepted, expired, rescinded, and removed access for one trip and one intended email.

2. Establish server-enforced viewer authorization for shared trips.
   - Acceptance outcome: accepted viewers can open only shared trips; viewers cannot mutate itinerary, delete trips, manage contributors, see money or budget information, or access reports including budget reports.

3. Build share dialog for manager/owner access.
   - Acceptance outcome: manager can enter email, sees viewer selected by default, sees active and pending people with their role and status, and can send an invitation.

4. Deliver account-aware invitation and acceptance journey.
   - Acceptance outcome: matched email receives in-app invitation; unmatched email receives email invitation and can sign up; valid recipient accepts and lands on shared trip overview showing trip identity, sharer, and access level.

5. Add invitation lifecycle safeguards.
   - Acceptance outcome: invitations expire after global 72-hour policy; manager can resend a pending invitation; removing a pending invite shows a rescinded-invite message to recipient; role granted at acceptance is current staged role.

6. Synchronize shared trip state live across sessions.
   - Acceptance outcome: viewer sees current itinerary updates without reload; live-sync failure exposes offline/internet-down status-bar indicator.

7. Add immediate revocation behavior.
   - Acceptance outcome: removing viewer instantly removes trip from their shared list and active view; active viewer receives revocation modal naming trip owner, returns to dashboard on confirmation, and cannot reopen trip via Back navigation.

8. Validate viewer-sharing end-to-end.
   - Acceptance outcome: automated coverage proves invitation, sign-up or existing-user acceptance, viewer read-only restrictions, hidden financial data, live itinerary updates, expiry/rescind, and live revocation.

## Phase 2 — Should: full contributor roles and secure management

1. Introduce editor role.
   - Acceptance outcome: editors can view and mutate itinerary and money/budget items, but cannot delete trip or manage sharing/membership.

2. Introduce manager role equivalent to owner full access.
   - Acceptance outcome: managers can edit trip, delete trip, invite/remove contributors, and change contributor roles.

3. Extend share dialog for contributor administration.
   - Acceptance outcome: manager can stage role changes and removals for pending and active contributors, then explicitly Save or Cancel; dialog cannot dismiss while staged security-sensitive changes exist.

4. Apply role changes live and safely.
   - Acceptance outcome: changed permissions take effect across recipient sessions without reload; removed permissions cannot be bypassed through navigation; concurrent itinerary edits resolve using latest-write-wins.

5. Verify role matrix and recovery controls.
   - Acceptance outcome: automated tests cover viewer/editor/manager boundaries, changing wrong role, removing wrong recipient, and effects on active sessions.

## Phase 3 — Could: follow-on collaboration improvements

1. Add future message center for sharing notifications.
   - Acceptance outcome: recipients can discover share invitations and sharing changes from a dedicated notification surface.

2. Add friend picker alongside email entry.
   - Acceptance outcome: managers can select known Packt users while email remains supported.

3. Support viewer PDF export when export capability exists.
   - Acceptance outcome: viewer can download approved PDF itinerary without gaining editing, membership, report, or financial-data access.

4. Review global invitation-expiry configuration.
   - Acceptance outcome: product decision determines whether 72-hour expiry remains fixed or becomes application-level configurable; managers cannot set expiry per invitation.

## Won't: excluded from this initiative

- Public trip discovery or contributor access requests.
- Forwardable invitations usable by another email account.
- Per-invitation or manager-chosen expiration times.
- Viewer access to money, budgets, reports, itinerary edits, trip deletion, or contributor management.
- Automatic contributor access removal after trip completion; access persists until manager removes it.
