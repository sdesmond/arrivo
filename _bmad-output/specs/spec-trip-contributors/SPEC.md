---
id: SPEC-trip-contributors
companions: []
sources:
  - ../../brainstorming/brainstorm-trip-contributors-2026-08-31/brainstorm-intent.md
  - ../../brainstorming/brainstorm-trip-contributors-2026-08-31/contributor-task-list.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Trip Contributors

## Why

Trip owners today can only keep others informed by sharing credentials or coordinating in person — neither scales to remote, asynchronous group travel planning. This is a vision to realize: let an owner give specific people a live, always-current view of a trip, with each person's capabilities (read-only, edit, or full management) explicit and enforced, so collaboration replaces shared logins and in-person syncing.

## Capabilities

- **CAP-1**
  - **intent:** Manager shares a trip with a person by email; the email must match an existing Packt user, who gets an in-app invitation defaulting to viewer. An email with no matching Packt account is rejected inline, with no invitation record created.
  - **success:** Entering an email in the share dialog either creates a pending invitation at role Viewer (matched account) or shows an inline "No Packt account found for this email" error with nothing persisted (unmatched account).

- **CAP-2**
  - **intent:** An invited person accepts an in-app invitation and gains role-scoped access to exactly the shared trip.
  - **success:** Accepting the invitation lands the recipient on the shared trip overview showing trip identity, sharer, and their access level; the role granted is whatever was staged at acceptance time; the invitation is never visible to, or acceptable by, any account other than the one matching the invited email.

- **CAP-3**
  - **intent:** A viewer can open and read a shared trip's itinerary without seeing financial data or mutating anything.
  - **success:** Viewer sees days, events, and locations; money, budget, and budget-report data are absent from every surface they can reach — including their own personal expense-reporting summary, where a shared trip they only view contributes no spend, category, destination, or budget-adherence data to their totals or graphs; itinerary mutation, trip deletion, and contributor management are unavailable to them at the server/API level, not just hidden in the UI.

- **CAP-4**
  - **intent:** An editor can view and mutate itinerary and budget/money items on a shared trip, but cannot delete the trip or manage sharing.
  - **success:** Editor's itinerary and budget edits persist and appear to other contributors; a request to delete the trip or change membership/sharing is rejected server-side for an editor.

- **CAP-5**
  - **intent:** A manager holds owner-equivalent full access to a shared trip.
  - **success:** Manager can edit the trip, delete it, invite or remove contributors, and change contributor roles — all enforced server-side identically to the owner.

- **CAP-6**
  - **intent:** A manager administers every contributor and pending invitation from one share dialog, and can see when an invited person has declined.
  - **success:** The dialog lists active contributors, pending invitations, and declined invitations with role and status, and supports role change, removal, invitation resend, and dismissing a declined invitation; changes are staged and the dialog cannot be dismissed while a staged change is unsaved — only explicit Save or Cancel exits.

- **CAP-7**
  - **intent:** Pending invitations expire automatically, and a manager can rescind one before acceptance.
  - **success:** An invitation not accepted within the global 72-hour window silently drops from the recipient's pending-invitations list and can no longer be accepted; an invitation removed by the manager before acceptance disappears from the recipient's list the same way instead of remaining acceptable — there is no separate rescinded-invite notice since the recipient never received a link to click, only an absence.

- **CAP-8**
  - **intent:** Shared trip state — itinerary, events, locations, membership, and roles — updates live across sessions without a reload.
  - **success:** A change made by one contributor becomes visible in another open session on that trip without navigation or refresh; when live sync cannot operate, an offline/internet-down indicator appears in the status bar.

- **CAP-9**
  - **intent:** Removing a contributor revokes their access immediately, everywhere.
  - **success:** The trip disappears at once from the removed contributor's dashboard/shared-trip list; if they are actively viewing it, a modal names the trip and the manager who removed them, directs them to request resharing, OK returns them to their own dashboard, and browser Back cannot reopen the trip.

- **CAP-10**
  - **intent:** Concurrent edits to the same itinerary item from different contributors resolve without data corruption or a merge prompt.
  - **success:** When two contributors edit the same item nearly simultaneously, the latest write wins and all sessions converge to that value.

- **CAP-11**
  - **intent:** An invited person can decline a pending invitation, immediately closing it out instead of leaving it to expire; the manager who sent it can see that it was declined.
  - **success:** Declining removes the invitation from the recipient's pending list right away and it can no longer be accepted; declining requires no confirmation step, matching accept's directness; the invitation shows as declined in the manager's share dialog until the manager dismisses it or re-invites the same email.

## Constraints

- Trips are private by default; access is manager-issued only — no public discovery or access-request flow exists.
- Role boundaries (viewer/editor/manager) are enforced server-side; a UI-only restriction does not satisfy any capability above.
- Invitation entry is email-only in this release — no user/friend picker.
- Invitations require an existing Packt account matching the invited email; there is no email delivery or signup route for unmatched addresses in this release.
- Invitation expiry (72 hours) is a single global application setting — not manager- or per-invitation-configurable.
- Contributor access persists after trip completion until a manager explicitly removes it — no automatic expiry.
- The share dialog cannot be dismissed while staged role/removal changes are unsaved; only Save or Cancel exits.
- Concurrent edit conflicts resolve latest-write-wins — no merge UI.

## Non-goals

- Email delivery of invitations (SMTP) and a signup route for unmatched addresses — invitations require an existing account at send time (see Open Questions).
- Public trip discovery or a contributor access-request flow.
- Forwardable invitations usable by an account other than the invited email.
- Per-invitation or manager-chosen expiration times.
- Automatic contributor-access removal after trip completion.
- A message center/notification surface for sharing events.
- A friend/known-user picker as an alternative to email entry.
- Viewer PDF export of the itinerary (contingent on an export capability that does not yet exist elsewhere in the product).
- Making the 72-hour invitation-expiry window itself configurable — an open product decision, not committed here.

## Success signal

Every contributor on a shared trip tracks trip progress — current events, locations, and itinerary — live and in sync with no stale state between sessions. Viewer, editor, and manager boundaries hold at the server/API layer under every condition tested, including a contributor removed mid-session and a live-sync outage.

## Open Questions

- Should the 72-hour invitation-expiry window ever become configurable (globally or per-invitation), or stay fixed? Source material flags this as an open call for later product review, not a decision to make now.
- Should Packt add email delivery and a signup route for inviting people who don't yet have an account? Deferred out of this release; matched-account-only is the interim design.
