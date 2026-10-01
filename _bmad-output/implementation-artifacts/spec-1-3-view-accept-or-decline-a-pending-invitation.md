---
title: "View, accept, or decline a pending invitation"
type: "feature"
created: "2026-09-01"
status: "done"
baseline_commit: "276b21176a2b2489e74b8d609e8131f519ad1e75"
review_loop_iteration: 0
context: ["{project-root}/docs/drizzle-workflow.md"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Users who have been invited to collaborate on a trip (story 1.2) have no way to see or act on those invitations. The invite infrastructure exists — `invitations` table, `inviteContributor` action, `normalizeEmail`, `dbInvitationToType` — but there is no read path for pending invitations, no accept/decline actions, and no UI surface to display or interact with them.

**Approach:** Add `getMyPendingInvitations` query (dashboard list + sidebar badge count), `acceptInvitation`/`declineInvitation` server actions (atomic conditional UPDATE with email-scoped guard), a `PendingInvitationsList` component pinned above the trips dashboard, and wire the sidebar "Trips" nav badge. Accept inserts a `collaborators` row and redirects to the trip; Decline removes the row with a toast. Both actions publish events for Epic 4 live sync.

## Boundaries & Constraints

**Always:** `acceptInvitation`/`declineInvitation` gated by `requireUser()` — email-scoped, not token-scoped. Atomic conditional UPDATE: `WHERE id=? AND email=? AND status='pending' AND expiresAt > now() RETURNING *` — never read-then-write. Accept inserts `collaborators` row with `isCreator: false` and the invitation's role only when a row comes back. Both actions publish events on `trip:{tripId}` and `user:{userId}` for live-sync readiness (Epic 4 completes the subscription side). `getMyPendingInvitations(userEmail)` filters `status = 'pending' AND expiresAt > now()` — expired rows are excluded, never separately transitioned to `'expired'`. Dashboard pinned "Invitations" section shown only when pending count > 0. Nav badge uses `NavItem.count` with `countTint="warning"`, `aria-label="Trips, {count} pending invitations"`. All interactive targets ≥44×44px. Microcopy per UX-DR11: "Invitation declined." via `toast.success()`. Role labels exactly Viewer/Editor/Manager. Email matching case/whitespace-insensitive on both sides.

**Ask First:** N/A — story fully specified by epic ACs.

**Never:** Never build the share dialog (Epic 3) or SSE subscription infrastructure (Epic 4). Never create invitation rows from accept/decline — only status-transition existing ones. Never show a confirmation step for Decline. Never let `acceptInvitation`/`declineInvitation` throw on expected failures — return result objects. Never add `<Toaster>` (already in root layout). Never add E2E for live-sync badge updates — that depends on Epic 4's SSE channel.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Accept happy path | pending, unexpired invitation matching my email | `status='accepted'`, `collaborators` row inserted, `revalidatePath`, event published, redirect to `/trips/{tripId}` | N/A |
| Accept expired | invitation past `expiresAt` | zero-row match, no collaborator created | returns `{ status: "error", message: "This invitation has expired." }` |
| Accept already-resolved | status is `accepted`/`declined`/`rescinded` | zero-row match | returns `{ status: "error", message: "This invitation is no longer pending." }` |
| Accept rescinded moments ago | manager rescinded between page load and click | zero-row match | returns `{ status: "error", message: "This invitation was rescinded by the trip owner." }` |
| Accept double-click | second call after first already succeeded | zero-row match, no duplicate collaborator | returns error result; UI does not surface second error toast |
| Accept wrong account | invitation belongs to different email | zero-row match (email guard in WHERE) | returns `{ status: "error", message: "This invitation is not addressed to your account." }` |
| Accept non-existent ID | no invitation row with that ID | zero-row match | returns `{ status: "error", message: "Invitation not found." }` |
| Decline happy path | pending, unexpired invitation matching my email | `status='declined'`, no collaborator created, `revalidatePath`, event published | `toast.success("Invitation declined.")` |
| Decline already-resolved | same as accept already-resolved | zero-row match | returns `{ status: "error", message: "This invitation is no longer pending." }` |
| Decline wrong account | same as accept wrong account | zero-row match | returns `{ status: "error", message: "This invitation is not addressed to your account." }` |
| Dashboard list | my pending invitations exist | pinned "Invitations" section with trip name, inviter, role, Accept/Decline | N/A |
| Dashboard list empty | no pending invitations | no "Invitations" section rendered | N/A |
| Badge count | 2 pending invitations | sidebar "Trips" shows `2` tinted warning, `aria-label="Trips, 2 pending invitations"` | N/A |
| Badge count zero | 0 pending invitations | no badge rendered | N/A |
| Cross-account isolation | invitation for different user | not in my list, not in my badge count, accept/decline rejected | N/A |

</frozen-after-approval>

## Code Map

- `src/lib/invitations.ts` -- add `getMyPendingInvitations(userEmail)` query: selects from `invitations` JOIN `trips` (trip name) JOIN `users` (inviter name/email) WHERE `email = normalizeEmail(userEmail) AND status = 'pending' AND expiresAt > now()`, returns mapped rows. This file already exports `normalizeEmail` and `INVITE_TTL_HOURS` — it is the designated home for shared invitation queries.
- `src/app/(app)/trips/actions.ts` -- add `acceptInvitation(invitationId)` and `declineInvitation(invitationId)`. Both: `requireUser()` → lookup invitation by ID → guard `invitation.email === normalizeEmail(user.email)` → atomic conditional UPDATE. Accept additionally inserts `collaborators` row when matched. Both call `revalidatePath("/trips")` and `revalidatePath(\`/trips/${tripId}\`)`. Both publish events via `publishTripEvent`/`publishUserEvent` from `src/lib/trip-events.ts` (import; the pub-sub module ships in Epic 4 but the import is safe — it's a plain function export). If `trip-events.ts` doesn't exist yet, defer the publish call with a TODO comment; do not create the pub-sub module here.
- `src/data/types.ts` -- add `AcceptInvitationResult` and `DeclineInvitationResult` discriminated union types (mirror `InviteContributorResult` pattern at `:837`). Add `PendingInvitation` interface: `{ id, tripId, tripName, inviterName, inviterEmail, role: CollaboratorRole, expiresAt: string }`. Update `NavItemProps` in nav-item.tsx (not types.ts — the props interface is local to the component).
- `src/components/packt/pending-invitations-list.tsx` (new) -- `"use client"` component. Props: `invitations: PendingInvitation[]`. Renders pinned "Invitations" section above trip cards. Each row: trip name, inviter display, role pill, Accept (primary `h-11 px-4`) and Decline (outline `h-11 px-4`) buttons. Accept calls `acceptInvitation(id)` via `useTransition` + `router.push(\`/trips/${tripId}\`)`. Decline calls `declineInvitation(id)` + `toast.success("Invitation declined.")` + removes row from local state. Both wrap in `startTransition`, disable buttons during pending. Use `title` attributes on buttons per UX-DR12. Accept buttons: `title="Accept invitation to {tripName}"`. Decline buttons: `title="Decline invitation to {tripName}"`.
- `src/app/(app)/trips/page.tsx` -- fetch `getMyPendingInvitations(session.user.email!)` in the existing `Promise.all`, pass result as `pendingInvitations` prop to `TripsPageClient`.
- `src/app/(app)/trips/page-client.tsx` -- accept `pendingInvitations: PendingInvitation[]` prop, render `<PendingInvitationsList invitations={pendingInvitations} />` above the trip cards section (before `TripsDesktopLayout`/`TripsMobileLayout`).
- `src/app/(app)/layout.tsx` -- fetch `getMyPendingInvitations(session.user.email!)` (new import from `@/lib/invitations`), compute `invitationCount = result.length`, pass to `<SidebarNav user={user} invitationCount={invitationCount} />`.
- `src/components/packt/sidebar-nav.tsx` -- add `invitationCount?: number` to `SidebarNavProps`, pass `count={invitationCount}` and `countTint={invitationCount > 0 ? "warning" : undefined}` to the trips `NavItem`.
- `src/components/packt/nav-item.tsx` -- add `countTint?: "warning"` to `NavItemProps`. When `countTint === "warning"`, override badge `color` from `var(--fg-3)` to `var(--warning)`. Update `aria-label` on the `<Link>` to `"Trips, {count} pending invitations"` when count > 0.
- `src/app/(app)/trips/actions.test.ts` -- add unit tests for `acceptInvitation` and `declineInvitation` covering the I/O matrix: happy accept, happy decline, expired, already-resolved, rescinded, double-click, wrong account, non-existent ID. Mock `@/db`, `@/lib/auth-helpers`, `next/cache`, `next/navigation` per existing header pattern.
- `tests/e2e/features/pending-invitations.feature` (new) -- `@feat:pending-invitations` tag. Scenarios: accept invitation (redirects to trip), decline invitation (toast, row disappears), badge shows count, badge hidden when zero, cross-account isolation.
- `tests/e2e/steps/pending-invitations.steps.ts` (new) -- step definitions for the feature file. Uses scenario-owned invitation rows materialized per the project's self-seeding convention.
- `tests/e2e/feature-map.mjs` -- add `entry("pending-invitations", [...])` mapping the new feature/step files plus `src/components/packt/pending-invitations-list.tsx`, `src/lib/invitations.ts`.

## Tasks & Acceptance

**Execution:**

- [x] `src/data/types.ts` -- add `PendingInvitation`, `AcceptInvitationResult`, `DeclineInvitationResult` -- canonical types for the accept/decline flow
- [x] `src/lib/invitations.ts` -- add `getMyPendingInvitations(userEmail)` -- single query backing both dashboard list and sidebar badge count
- [x] `src/lib/invitations.test.ts` -- add cases for `getMyPendingInvitations` -- covers query filtering, join correctness, expiry exclusion
- [x] `src/app/(app)/trips/actions.ts` -- add `acceptInvitation(invitationId)` and `declineInvitation(invitationId)` -- atomic conditional UPDATE with email guard, accept creates collaborator row, both publish events and revalidate
- [x] `src/app/(app)/trips/actions.test.ts` -- cover all 9 I/O-matrix rows for `acceptInvitation` and `declineInvitation` -- closes Matrix Test Audit requirement
- [x] `src/components/packt/pending-invitations-list.tsx` (new) -- dashboard "Invitations" section with Accept/Decline buttons -- the primary UI surface for story 1.3
- [x] `src/components/packt/pending-invitations-list.test.tsx` (new) -- test rendering, button interactions, error handling, empty state
- [x] `src/components/packt/nav-item.tsx` -- add `countTint` prop, conditional warning color, accessible aria-label -- sidebar badge tinting
- [x] `src/components/packt/nav-item.test.tsx` -- add cases for warning tint and aria-label with count
- [x] `src/components/packt/sidebar-nav.tsx` -- add `invitationCount` prop, pass to trips NavItem -- wire badge data from layout
- [x] `src/app/(app)/layout.tsx` -- fetch `getMyPendingInvitations`, pass count to SidebarNav -- server-side data flow for badge
- [x] `src/app/(app)/trips/page.tsx` -- fetch `getMyPendingInvitations`, pass to page-client -- server-side data flow for dashboard list
- [x] `src/app/(app)/trips/page-client.tsx` -- accept `pendingInvitations` prop, render `PendingInvitationsList` above trip cards -- dashboard integration
- [x] `tests/e2e/features/pending-invitations.feature` (new) -- `@feat:pending-invitations` E2E scenarios for accept, decline, badge, isolation
- [x] `tests/e2e/steps/pending-invitations.steps.ts` (new) -- step definitions with scenario-owned invitation rows
- [x] `tests/e2e/feature-map.mjs` -- register pending-invitations feature entry and source globs

**Acceptance Criteria:**

- Given I have pending, unexpired invitations, when I load any page, then the sidebar "Trips" nav item shows a count badge equal to the number of pending invitations, tinted to the warning register, with `aria-label="Trips, {count} pending invitations"`.
- Given I have no pending invitations, when I load any page, then the "Trips" nav item shows no badge.
- Given a pending, unexpired invitation matching my account email, when I view my trips dashboard, then I see a pinned "Invitations" section showing trip name, inviter, and role, with Accept and Decline buttons.
- Given a pending invitation addressed to a different account, when that account queries pending invitations or calls accept/decline, then it never appears in their list or badge count and both calls are rejected server-side.
- Given a pending, unexpired invitation addressed to me, when I click Accept, then `acceptInvitation` atomically sets `status='accepted'`, inserts a `collaborators` row with my userId and the invitation's role, publishes a `membership-changed` event, and I'm redirected to the trip overview.
- Given a pending, unexpired invitation addressed to me, when I click Decline, then `declineInvitation` atomically sets `status='declined'`, no `collaborators` row is created, the row disappears from my list, and I see `toast.success("Invitation declined.")`.
- Given an invitation that's already been resolved (accepted, declined, rescinded, or expired), when accept or decline is called again, then the conditional update matches zero rows and a descriptive error result is returned.
- Given the invitation was resolved because a manager rescinded it moments before my click reached the server, when the zero-row failure is reported, then I see "This invitation was rescinded by the trip owner." rather than a generic error.
- Given I double-click Accept or Decline, when the second call reaches the server after the first succeeded, then its zero-row match reports failure without creating or changing anything and the UI does not surface a second error toast.

## Spec Change Log

- Implementation discovery: `next build` failed on the pre-story baseline (`hasNormalizedEmail` was a non-async export from `actions.ts`, which carries a top-level `"use server"` directive — Next requires every export from such a file to be an async Server Action). This was unrelated to this story but blocked the build/E2E gate entirely, so it was fixed in the same change by moving `hasNormalizedEmail` from `src/app/(app)/trips/actions.ts` into `src/lib/invitations.ts` (a plain module, not `"use server"`) and updating its callers/imports and its unit test accordingly. Behavior is unchanged — pure relocation.

## Design Notes

`acceptInvitation` uses a single atomic `UPDATE ... WHERE id=? AND email=? AND status='pending' AND expiresAt > now() RETURNING *` rather than read-then-write, so a double-click, a race with expiry, or a race with a manager's rescind all resolve to a clean zero-row failure. The `collaborators` row is inserted inside the same action (separate INSERT, not inside the UPDATE transaction) because the UPDATE is conditional — if zero rows match, no collaborator is created. This is safe because the UPDATE already verified all guards; the INSERT uses the validated `userId`, `tripId`, and `role` from the matched row.

`getMyPendingInvitations` joins `invitations` → `trips` (for trip name) → `users` (for inviter name/email via `invitations.invitedBy = users.id`). The query is the single source for both the dashboard list and the sidebar badge count — no parallel count check, no separate query.

The sidebar badge and dashboard list are both re-rendered by `revalidatePath("/trips")` after accept/decline. Live-sync badge updates (without full re-render) depend on Epic 4's SSE channel — the publish calls are wired now but won't take effect until the subscription infrastructure exists.

## Verification

**Commands:**

- `npm run lint` -- expected: no errors
- `npx tsc --noEmit` -- expected: no type errors
- `npx vitest run src/app/\(app\)/trips/actions.test.ts src/lib/invitations.test.ts src/components/packt/pending-invitations-list.test.tsx src/components/packt/nav-item.test.tsx` -- expected: all pass
- `npm run test:e2e:affected` -- expected: pending-invitations scenarios pass

**Manual checks (if no CLI):**

- Inspect sidebar "Trips" nav item with 0 and 2+ pending invitations — badge appears/disappears correctly, tint is warning-colored.
- Inspect dashboard with pending invitations — pinned section appears above trip cards, Accept redirects to trip, Decline shows toast and removes row.

### Review Findings

- [x] [Review][Patch] Keep acceptance and membership creation atomic [src/app/(app)/trips/actions.ts:803] — `acceptInvitation` commits `status = "accepted"` before inserting `collaborators`; an insert failure leaves a permanently accepted invitation without trip access. Wrap conditional update and collaborator insert in one transaction, and do not treat a collaborator conflict as success unless the existing row is verified or updated to satisfy the invitation's user and role.
- [x] [Review][Patch] Restore required pending-row role and status treatment [src/components/packt/pending-invitations-list.tsx:67] — Story 1.3's Code Map requires a role pill, and the UX contract requires the shared pending-row tokens plus a text "Pending" badge. Current row renders role as inline metadata on `var(--surface)` and has no status badge.
- [x] [Review][Patch] Remove forbidden arbitrary Tailwind values [src/components/packt/pending-invitations-list.tsx:59] — `lg:max-w-[1200px]` and `rounded-[8px]` violate project styling rules; use existing static utilities or inline styles for these values.
- [x] [Review][Patch] Verify invitation mutation guards and terminal writes [src/app/(app)/trips/actions.test.ts:925] — acceptance/decline test fixtures return predefined rows regardless of the `WHERE` predicate and do not assert `.set()` values. Add DB-backed or SQL-shape tests proving email, pending-status, and expiry guards prevent cross-account/resolved transitions, and that successful paths persist `accepted`/`declined`.
- [x] [Review][Patch] Cover pending-query filtering and full decline matrix [src/lib/invitations.test.ts:52] — query mocks do not exercise pending/expiry predicates, and decline lacks expired, rescinded, and missing-ID coverage. Add behavioral coverage that terminal/expired rows are excluded from list and badge and that each decline result is descriptive.
