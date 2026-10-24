---
id: SPEC-self-hosted-administration
companions:
  - ../ux-self-hosted-administration/EXPERIENCE.md
  - ../ux-self-hosted-administration/DESIGN.md
  - ../architecture-self-hosted-administration/architecture-self-hosted-administration.md
sources:
  - ../brainstorm-admin-page/brainstorm-admin-page.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Self-hosted administration

Precedence when companions disagree: architecture spine > EXPERIENCE.md/DESIGN.md > this kernel's source brainstorm. EXPERIENCE.md owns behavior, copy, states and flows; the architecture owns concurrency, token, Activity and retention semantics.

## Why

Mandate plus gap for people who run Arrivo on their own server: today anyone can sign up, there is no admin concept, no way to manage or recover other accounts, and no visibility into who did what. The first administration release gives the operator control of account entry, administrative authority, account exit and recovery, and enough Activity and instance visibility to run a household or small-group installation, without exposing anyone's private trips.

## Capabilities

- **CAP-1**
  - **intent:** First account on a fresh install becomes admin and public signup closes permanently; an existing single-account install is promoted automatically on upgrade.
  - **success:** Fresh DB: first signup yields an admin, second signup attempt is refused regardless of `ALLOW_SIGNUP`; concurrent first signups yield exactly one admin; upgrade of a one-account DB promotes it once; a multi-account legacy DB stops with an actionable operator error.
- **CAP-2**
  - **intent:** Admin can add a user by username, creating the account immediately with no password, and obtain a manually shared setup link whose recipient must set a password before reaching the app.
  - **success:** Account appears in Users as Pending setup; link opens a non-dismissable password dialog; before save, direct routes, actions, storage reads and live subscriptions are refused; save consumes the link and grants access for that same account; duplicate/taken username creates no second account.
- **CAP-3**
  - **intent:** Admin can replace an unfinished account's setup link or delete the account, without duplicating it.
  - **success:** Regeneration invalidates the old link, issues a fresh 24-hour link for the same account ID; expired link leaves the account visible as expired with Generate new link; reopening a valid link resumes until original expiry; deleted account's link admits no one.
- **CAP-4**
  - **intent:** Admin can promote and demote users while at least one completed admin always remains.
  - **success:** Demoting or deleting (admin or self-service) the last completed admin is blocked even under concurrency; unfinished accounts cannot be promoted; self-demotion returns to personal settings and removes the Manage instance entry.
- **CAP-5**
  - **intent:** Admin can delete any account, with owned trips handled by automatic succession and no access to private trip contents.
  - **success:** Owned trip goes to the earliest-added remaining manager, else editor (ties by user ID), who becomes owner/manager/creator; viewers-only trips are deleted; confirmation shows outcome without trip names or collaborators and demands renewed review if outcomes change; admin stays signed in; self-service deletion keeps explicit transfer/delete choices.
- **CAP-6**
  - **intent:** Admin can generate a password-reset link for another user to share manually.
  - **success:** One-hour single-use link; generating it changes no password or session; completion keeps MFA, signs out all sessions, revokes trusted devices, requires fresh sign-in, and invalidates every other outstanding reset/recovery link for the account.
- **CAP-7**
  - **intent:** A trusted server operator can recover an admin who lost password and/or MFA via a CLI-issued recovery link, with no web bypass.
  - **success:** CLI takes username and base URL and prints a one-hour single-use link for a completed admin; browser completion needs new password plus verified replacement MFA and then atomically replaces credentials, rotates MFA recovery codes (shown once), revokes sessions and trusted devices; abandoned or expired attempts change nothing; old immediate `mfa-reset` command and its docs are gone.
- **CAP-8**
  - **intent:** Admin can review user-activity history filtered by actor, type and date.
  - **success:** Covers login/logout, failed sign-ins, account creation/deletion, setup/reset/recovery link events and password setup, trip create/modify, trip-invitation create/accept/rescind, password and username changes, role changes, retention changes; routine trip edits collapse to one Updated trip row per actor/trip (10-minute inactivity window); trip rows show only actor, action, timestamp(s), trip ID; no IP, tokens or URLs stored; forcing Activity write failure never alters a primary action's outcome.
- **CAP-9**
  - **intent:** Admin can set how long Activity is kept.
  - **success:** Options 30/90/180/365 days, default 90; shortening requires confirmation; failed save starts no cleanup; saved policy and completed cleanup are shown as distinct states; expired rows are physically removed opportunistically by app activity.
- **CAP-10**
  - **intent:** Admin can see instance condition at a glance.
  - **success:** Shows version, database and document-storage health, user/admin/pending-setup counts, trip/document counts, upload-storage bytes, recent admin actions and failed logins, each with its own freshness and manual Refresh; a failed probe shows Unavailable, never zero or Healthy.
- **CAP-11**
  - **intent:** Everyone reaches Settings and Log out from one account menu; admins also reach Manage instance.
  - **success:** Menu opens from desktop sidebar account control and mobile Profile tab; Manage instance is absent for non-admins and removed on lost authority; all management routes and actions recheck current admin status server-side.

## Constraints

- Admin role grants no access to trips beyond existing sharing permissions; every admin read and action checks current DB authority, and privileged deletion is not a reusable trip-access bypass.
- Credential links are ≥256-bit random, stored hashed, purpose-bound, shown only at issuance; no email integration, no unauthenticated web recovery path, links built only from configured trusted origin.
- Activity is best effort: never in the primary transaction, never blocks sign-in, recovery or mutations; no outbox or retries.
- Runs on the existing app container, PostgreSQL 17 and storage adapter only; no new service, scheduler or provider.
- Sign-in is username and password (then MFA) with existing `src/lib/username.ts` rules; trip invitations stay bound to account ID.
- Interactive targets ≥44×44px, WCAG 2.2 AA; schema changes ship a generated Drizzle migration; Next.js/Auth.js/Drizzle versions unchanged.

## Non-goals

- Email delivery, invitation resend, or email-based invitations.
- Diagnostic or application logging beyond user Activity; tamper-evident audit; live Activity feed; source-IP capture.
- Account suspension, quotas, backup integration or status, registration or upload-limit controls.
- Offline recovery codes or a temporary web recovery mode.
- Multi-account legacy admin selection.
- Admin access to private trip titles, destinations, changed values or collaborators.

## Success signal

Maya installs fresh, becomes admin, adds Alex by username, shares the setup link, and Alex sets a password and uses the app; she later resets his password, deletes an account with trips passing to successors, and reviews Activity and Overview — all without any admin screen revealing a private trip's contents, and a lost-admin lockout is recoverable only through the server CLI.

## Assumptions

- Admin-created passwordless accounts supersede the brainstorm's email invitations, per EXPERIENCE.md.
- Trip-level Activity is minimal for all trips (architecture AD-9), superseding the brainstorm's sharing-access carve-out.
- Exact table, route and event names are chosen in feature tickets (architecture "Deferred").

## Open Questions

- None blocking. Architecture review files (`architecture-self-hosted-administration/reviews/`) were not re-read here; confirm their findings were applied before building.
