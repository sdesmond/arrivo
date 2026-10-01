# Trip contributors — implementation intent

## Outcome

Let trip owners share a private, always-current itinerary with specific people, without shared credentials or coordinating in person. Recipients accept an invitation and open the shared trip overview, where trip identity, shared state, and their access level are explicit.

## Must: first release

- Add a share dialog as the contributor control plane.
- A manager selects an existing user by email and grants view-only access; viewer can open and read the shared trip.
- Keep shared trip data synchronized live across sessions without reload. Show an offline/internet-down status-bar indicator when live synchronization cannot operate.
- Enforce authorization server-side. Viewer access is read-only and excludes all money, budget, and budget-report data; a future PDF download is permitted.
- Treat trips as private by default. No discovery or access-request flow.

## Contributor model and follow-on scope

- Roles: `viewer` (read-only, no financial data), `editor` (viewer capabilities plus itinerary and budget mutations; cannot delete trip or manage sharing), and `manager` (owner-equivalent full access, including trip deletion and membership management).
- Managers invite by email only. Existing users receive an in-app invitation; unmatched addresses receive an email signup-and-acceptance path. Links are bound to invited email and cannot be accepted by another account.
- New invitations default to viewer. Contributor access persists after trip completion until a manager removes it.
- Share dialog lists active contributors and pending invitations. It supports role changes, removal, and pending-invitation resend. Changes are staged and require Save or Cancel; dialog cannot dismiss while changes remain unsaved.
- Pending invitations expire after 72 hours under a global application setting. Accepted invitation grants role currently staged at acceptance; a removed pending invite reports that it was rescinded.
- Managers can later change an accepted contributor's role. Concurrent itinerary edits resolve latest-write-wins.

## Security and access outcomes

- Removing a contributor immediately revokes authorization, removes trip from their dashboard/shared-trip list, and updates an open session live.
- An actively removed contributor sees a revocation modal naming trip owner, is directed to contact owner for resharing, and OK returns to own dashboard; browser back cannot reopen trip.
- Role or membership changes propagate live, matching manager's saved state.

## Acceptance outcomes

- A viewer invited by manager sees only intended shared trip and receives current itinerary/event/location changes live from other sessions.
- Viewer cannot mutate itinerary, manage contributors, delete trip, or view money, budget, or budget reports.
- Editor and manager permissions hold at API/server boundary, not only UI boundary.
- Sharing, role changes, invitation state, resend, and revocation are auditable and controllable from one share dialog.
