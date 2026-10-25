---
title: "Users list and role-change UI"
type: "feature"
ticket: "4"
created: "2026-10-25"
status: "built"
baseline_revision: "0cf382ad662fc047573f856a933963c026c9a8ed"
route: "full"
route_source: "auto"
risk: "medium"
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick]
review_loop_iteration: 0
context:
  - "{project-root}/_bmad-output/initiative-self-hosted-administration/ux-self-hosted-administration/EXPERIENCE.md"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Users section is an empty placeholder, so admins cannot see accounts or change roles, although the role service exists.

**Approach:** List accounts (username, role, setup status) with Make admin / Remove admin confirmations backed by a server action over `changeUserRole`; the last completed admin's Remove admin is disabled with a tooltip; self-demotion lands on personal settings.

## Boundaries & Constraints

**Always:** Action calls `requireAdmin()` then `changeUserRole(db, user.id, …)`, then `revalidatePath`; the service stays the only authority, the disabled control is advisory. Confirmation states instance authority only, no private-trip access. Tooltip copy "Make another user an admin first."; failure copy "Couldn't save. Try again."; no inline "Last admin" label. Row controls and dialog actions at least 44px. Read rows through a mapper; never ship password hashes to the client. Dialog is the shared `Dialog` (bottom sheet below 640px).

**Never:** Add User, setup links, delete, reset password, Activity, search/pagination, optimistic role change, changes to `changeUserRole` or schema/migrations.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Promote member | Completed member, confirm | Role shows admin; toast; dialog closes | — |
| Demote another admin | Another completed admin remains | Role shows member | — |
| Self-demote | Another completed admin remains, confirm | Navigate to `/profile`; no Manage instance | — |
| Sole completed admin | Row is only completed admin | Remove admin disabled, tooltip shown | Service `last-admin` still refused if raced: dialog shows "Make another user an admin first." |
| Unfinished account | `passwordHash` null | "Setup pending" status; no Make admin | `unfinished-account` shown as couldn't-save |
| Stale actor | Actor demoted elsewhere | Action 404s via `requireAdmin()` | Router refresh surfaces not-found |
| Retry/unavailable | `retry` / `instance-unavailable` / `not-found` | Dialog stays open with "Couldn't save. Try again."; `not-found` also refreshes list | — |

</frozen-after-approval>

## Code Map

- `src/lib/instance-users.ts` (new, `server-only`) -- `listInstanceUsers()`: id, username, role, passwordHash presence; pure `toInstanceUserSummaries(rows)` derives `setupComplete` and `isLastCompletedAdmin` (exactly one completed admin and this is it); ordered by username; never selects hash to the client.
- `src/data/types.ts` -- add `InstanceUserSummary`; reuse `UserRole`, `RoleChangeFailure`, `ChangeUserRoleResult`.
- `src/app/(app)/admin/users/actions.ts` (new) -- `changeUserRoleAction(targetUserId, role)`; `requireAdmin()`, `changeUserRole(db, …)`, revalidate `/admin/users`; returns the service result.
- `src/app/(app)/admin/users/page.tsx` -- keep `requireAdmin()` guard; load list; render `InstanceUsersList` with `currentUserId`.
- `src/components/arrivo/instance-users-list.tsx` (new, client, `InstanceUsersListProps`) -- rows: identity, textual role/status, action button with `aria-label` "Make admin: <username>" / "Remove admin: <username>"; Tooltip primitive for disabled reason; `useRouter` for self-demotion push.
- `src/components/arrivo/change-role-dialog.tsx` (new, client) -- confirmation with title, consequence, inline error, Cancel, explicit action; Escape/Cancel dismiss and focus returns to the row button (Base UI Dialog default; asserted in tests); model on `profile/delete-account-dialog.tsx` (`useTransition`, `Dialog*`).
- `src/components/ui/tooltip.tsx` -- reuse; `TooltipProvider` already mounted in `src/app/layout.tsx`. Disabled button sits in a focusable (`tabIndex=0`) wrapper so keyboard users reach the reason.
- `src/lib/account-role-changes.ts` -- consumed as-is.
- `tests/e2e/feature-map.mjs` -- new `instance-users` entry for the two components, `instance-users.ts`, `admin/users/**`; `scripts/feature-map.test.mjs` fails otherwise.
- `tests/e2e/steps/account-menu.steps.ts` -- reuse "I am signed in as an instance", menu steps; `scenario.materialize({ user: { overrides, setCurrent: false } })` (as in `pending-invitations.steps.ts`) for the second account.

## Tasks & Acceptance

**Execution:**

- [x] `src/lib/instance-users.test.ts` -- first edit: summary derivation (sole completed admin, unfinished admins don't count, multiple admins, member), ordering, query mock -- tests precede code
- [x] `src/app/(app)/admin/users/actions.test.ts` -- guard order, service args, revalidate, each failure result passes through, non-admin denied before service
- [x] `src/components/arrivo/instance-users-list.test.tsx`, `change-role-dialog.test.tsx` -- Make/Remove admin flows, tooltip + disabled state, unfinished row, failure copy per reason, self-demotion pushes `/profile`, other-user change refreshes without navigating, focus return on Escape
- [x] `src/data/types.ts`, `src/lib/instance-users.ts`, `actions.ts`, `page.tsx`, the two components -- implement until targeted tests pass
- [x] `tests/e2e/features/instance-users.feature`, `tests/e2e/steps/instance-users.steps.ts`, `feature-map.mjs` -- `@feat:instance-users`: admin promotes a member, then removes own admin, lands on personal settings, menu lacks Manage instance and `/admin` 404s
- [x] Targeted Vitest, then `npm run test:e2e:affected`, then `build-validator`

**Acceptance Criteria:**

- Given an admin and a completed member, when the admin confirms Make admin, then the list shows that user as admin and the database role persists.
- Given two completed admins, when the admin confirms Remove admin on self, then they land on `/profile` and no longer see Manage instance.
- Given one completed admin, when the Users list renders, then that row's Remove admin is disabled and its tooltip reads "Make another user an admin first."
- Given a failing role change, when the dialog is open, then it stays open with inline error and nothing changes optimistically.

## Implementation Notes

- Plan review: scope, architecture, components, accessibility, tests checked; no blocking findings. Existing Users page is 18 lines; shared primitives reused.
- Define ChangeRoleDialogProps explicitly. Cancel initially receives focus on demotion; keyboard activation opens dialog, Escape/Cancel restores row-trigger focus. Ensure tooltip reason is reachable by keyboard and touch.
- Before Next.js edits, read version-matched local use-server and use-router docs. Apply shadcn skill for shared primitives; example dialog lives at src/app/(app)/profile/delete-account-dialog.tsx.

## Plan Change Log

## Review Triage Log
| Finding | Verdict | Route | Evidence |
| --- | --- | --- | --- |
| Last-admin error unmounts after revalidation | medium | patch | Action revalidates even on refusal; refreshed sole-admin props replace the dialog. Revalidate successful changes only to preserve inline refusal. |
| Pending dialog dismisses | medium | patch | onOpenChange accepts Escape/backdrop dismissal while mutation continues and Cancel is disabled. Ignore close requests while pending. |
| Rejected action loses inline failure | medium | patch | Transition awaits without handling network/application rejection. Show safe inline error while preserving framework-controlled notFound/redirect propagation. |

## Design Notes

The shared E2E database always holds the baseline admin plus other scenarios' admins, so the sole-admin tooltip is proven in component tests, not E2E; E2E asserts only rows owned by the scenario. Self-demotion navigation relies on the existing account-menu role refresh to drop the menu entry on pathname change.

## Verification

**Commands:**

- `npx vitest run src/lib/instance-users.test.ts "src/app/(app)/admin" src/components/arrivo/instance-users-list.test.tsx src/components/arrivo/change-role-dialog.test.tsx scripts/feature-map.test.mjs` -- expected: pass
- `npm run test:e2e:affected` -- expected: instance-users and account-menu scenarios pass





**Results:** 39 targeted tests passed. Quick review: three findings patched, none deferred. Build validator passed lint, TypeScript, 4,673 unit tests with 96.92% lines / 96.77% functions / 91.72% branches, 299 affected E2E tests, and production build (16 static pages).
