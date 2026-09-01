---
title: "Invite an existing Packt user to a trip"
type: "feature"
created: "2026-09-01"
status: "done"
baseline_commit: "83c75dff2725e9f0de543187f27c13197836942f"
review_loop_iteration: 0
context: ["{project-root}/docs/drizzle-workflow.md"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A trip manager currently cannot invite another Packt user to collaborate on a trip. The collaborator invite flow needs a persisted, pending-until-accepted `invitations` concept so a manager can issue email-scoped invites that another account accepts or declines later (Story 1.3).

**Approach:** Add an `invitations` table and an `inviteContributor(tripId, email, role)` server action. The action looks the email up against existing Packt accounts, normalizes both sides (lowercased, trimmed), and creates/resends a pending invitation row with 72-hour expiry — rejecting unmatched emails, the manager's own email, and emails already on the trip, all with validation errors returned to the caller.

## Boundaries & Constraints

**Always:** Every write is gated by `requireUser()` then `assertTripAccess(tripId, user.id!, "manager")` — an editor or viewer is rejected server-side regardless of client input. Email is normalized (`toLowerCase().trim()`) on write to `invitations.email` and on every read/comparison (active-project check, `(tripId, email)` uniqueness, later Story 1.3 matching). The default invite role is Viewer; only the three valid `CollaboratorRole` values are accepted. `invitations.expiresAt = now + 72h` fixed global constant. Inviting an email already pending on the trip is an implicit resend (same row, role updated, `expiresAt` reset) never a duplicate; inviting an email with an undismissed `declined` row creates a fresh `pending` row and deletes the old declined row in the same write. On success revalidate `revalidatePath(`/trips/${tripId}`)`.

**Ask First:** N/A — story is fully specified by the epic ACs; no open design decision remains.

**Never:** Never create a `collaborators` row from an invite (that happens only on acceptance in Story 1.3). Never send email, never create a signup route, never issue a bearer token — the invite is email-scoped and in-app only. Never store a raw (un-normalized) email in `invitations.email`. Never let the action throw on a validation failure; return an error result instead (only `requireUser`/`assertTripAccess` may redirect/notFound). Do not build the share-dialog UI or dashboard pending-invitations list — both ship in later stories (Epic 3 dialog, Story 1.3 list/badge).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Happy invite | manager, existing account email, no active/pending membership, role defaults Viewer | `invitations` row `status='pending'`, given role, `expiresAt=now+72h`; returns `{ status: "invited" }` | N/A |
| No matching account | email has no `users` row | no row created; returns error `"No Packt account found for this email"` | N/A |
| Re-invite pending | `(tripId, email)` already `pending` | existing row updated (role from request, `expiresAt` reset); returns `{ status: "resent" }` | N/A |
| Re-invite declined | `(tripId, email)` has undismissed `declined` row | old declined row deleted + fresh `pending` row created in same write; returns `{ status: "invited" }` | N/A |
| Already on trip | email has an active `collaborators` row for the trip | no row created; returns error, no duplicate invite | N/A |
| Inviting self | email equals inviting manager's account email | no row created; returns error | N/A |
| Editor denied | caller is `editor` on the trip | action returns before any write; `assertTripAccess(tripId, user.id!, "manager")` throws `notFound()` | N/A |
| Case/whitespace | invitee email `"  Foo@Bar.com "` | normalized to `foo@bar.com`, compared/written normalized | N/A |

</frozen-after-approval>

## Code Map

- `src/db/schema.ts` -- add `invitations` table (after `collaborators` ~`:265`), mirroring the `collaborators` shape. Columns: `id uuid pk default gen_random_uuid()`, `tripId uuid notNull FK→trips.id onDelete cascade`, `email text notNull`, `role text notNull`, `status text notNull default 'pending'`, `expiresAt timestamp(withTimezone) notNull`, `invitedBy uuid notNull FK→users.id`, `createdAt timestamp(withTimezone) default now()`. Partial unique index on `(tripId, email)` `WHERE status = 'pending'` since vanilla `unique().on(tripId,email)` (schema:264) would block non-pending duplicates the declined-resend needs. Confirm drizzle's `uniqueIndex()` + `.where()` support, else use a raw `.toSQL` migration consistent with `docs/drizzle-workflow.md` push-based flow.
- `src/data/types.ts` -- add `InvitationStatus` const/type (`pending|accepted|declined|expired|rescinded`) and `Invitation` interface; add `InviteContributorInput { email: string; role?: CollaboratorRole }` and `InviteContributorResult = { status: "invited" } | { status: "resent" } | { status: "error"; message: string }` (mirror `CollaboratorRole:34`, `Collaborator:506`, `UpdateTripMetadataResult:748`).
- `src/lib/invitations.ts` (new) -- export `normalizeEmail(email: string): string` (`email.trim().toLowerCase()`) and `INVITE_TTL_HOURS = 72`. This file is the designated home for the shared invitation query (`getMyPendingInvitations`) added in Story 1.3, so locate the normalize helper here now.
- `src/db/db-mappers.ts` -- add `dbInvitationToType(row: typeof invitations.$inferSelect): Invitation` mapping nullable cols `?? undefined` and `expiresAt`/`createdAt` `.toISOString()` (mirror `dbCollabToType:191`); add `invitations` to the schema import block `:1-20`.
- `src/app/(app)/trips/actions.ts` -- add `inviteContributor(tripId, email, role?)`. Pattern: `requireUser()` → `assertTripAccess(...,"manager")` → normalize email → reject own email → find `users` by normalized email (no row → return error) → transaction: check existing `collaborators` row for trip+email (active → error), check existing `invitations` by trip+email — `pending` → update role+`expiresAt` return `resent`; `declined` → delete + insert return `invited`; none → insert return `invited`. Reuse `db.transaction` (as `createTrip:234`), `eq`/`and` from drizzle, `revalidatePath`. Co-locate the action near the other collaborator actions (`addCollaborator:653`, `updateCollaboratorRole:680`) and add its import to the `collaborators`/`users`/`invitations` schema import list `:6-16`. Add helpers as needed in a new `./invite-actions.ts` only if `actions.ts` grows unwieldy.
- `src/app/(app)/trips/actions.test.ts` -- add unit tests for `inviteContributor` covering the I/O matrix: happy pending, no-account error, implicit resend, declined-resend, already-on-trip error, self-invite error, editor-denied. Mock `@/db`, `@/lib/auth-helpers`, `next/cache` per existing header `:29-54`; use `createTransactionMock` `:134` if a transaction is exercised.
- `src/lib/invitations.test.ts` (new, colocated) -- unit-test `normalizeEmail` (web: leading/trailing whitespace + case mixing).

## Tasks & Acceptance

**Execution:**

- [x] `src/db/schema.ts` -- add `invitations` table with partial-unique-pending index -- stores pending invites with 72h expiry, enforces one pending row per `(tripId, email)`
- [x] `src/data/types.ts` -- add `InvitationStatus`, `Invitation`, `InviteContributorInput`, `InviteContributorResult` -- canonical types for the invite flow
- [x] `src/lib/invitations.ts` (new) -- `normalizeEmail()` + `INVITE_TTL_HOURS` -- single source of the email-normalization and TTL contract used everywhere in the epic
- [x] `src/lib/db-mappers.ts` -- add `dbInvitationToType()` -- map `invitations` rows to domain `Invitation`
- [x] `src/lib/db-mappers.test.ts` -- add cases for `dbInvitationToType` covering the new fields (status, role, expiresAt/createdAt ISO conversion, nullable cols) -- `db-mappers.ts` is a covered file; a new mapper must ship with its test in the same change
- [x] `src/app/(app)/trips/actions.ts` -- add `inviteContributor(tripId, email, role?)` -- the manager-gated invite write with all validation branches
- [x] `src/app/(app)/trips/actions.test.ts` -- cover all seven I/O-matrix rows of `inviteContributor` -- closes Matrix Test Audit requirement
- [x] `src/lib/invitations.test.ts` (new) -- cover `normalizeEmail` -- trivial pure-function coverage

**Acceptance Criteria:**

- Given a manager invokes `inviteContributor` with a valid existing-account email, when the call completes, then exactly one `pending` `invitations` row exists with the requested role and `expiresAt = now + 72h`, and `revalidatePath(`/trips/${tripId}`)` is called.
- Given an email with no matching Packt account, when `inviteContributor` runs, then no `invitations` row is created and a `{ status: "error", message: "No Packt account found for this email" }` result is returned.
- Given a `pending` invitation already exists for `(tripId, email)`, when invited again, then the same row's role and `expiresAt` update in place (no second row) and `{ status: "resent" }` is returned.
- Given an undismissed `declined` invitation exists for `(tripId, email)`, when invited again, then the declined row is deleted and a fresh `pending` row is created within the same DB transaction.
- Given the email matches an active `collaborators` row on the trip, or matches the inviter's own account, when invited, then no row is created and a validation-error result is returned.
- Given an `editor`-role caller, when `inviteContributor` is invoked, then `assertTripAccess(..., "manager")` rejects before any write.
- Given an input email with surrounding whitespace or mixed case, when stored and later compared, then both sides normalize (`toLowerCase().trim()`) to the same value.
- Given a row converted via `dbInvitationToType`, when mapped, then its `status`/`role` are typed, `expiresAt`/`createdAt` convert to ISO strings, and nullable columns resolve to `undefined` rather than `null`.

## Spec Change Log

## Design Notes

The `invitations` table needs a **partial** unique index — `unique on (tripId, email) WHERE status = 'pending'` — not the vanilla column-level `unique().on(tripId, email)` used by `collaborators`. Reason: a resumed invite must be able to create a fresh `pending` row while a `declined` row for the same `(tripId, email)` still exists transiently during the swap (Story 1.2), and later declined/expired/rescinded rows for the same pair can legitimately coexist with a new pending row (Story 1.3/1.4). Enforcing pending-uniqueness only avoids the duplicate-resend the epic explicitly forbids without precluding terminal-state rows.

`expiresAt` uses `timestamp(..., { withTimezone: true })` (mirroring `trips.createdAt:108`) and is set in the action from `new Date(Date.now() + 72h)` — the action layer already uses `new Date()` directly (`actions.ts:102`), consistent with server-context "now".

`inviteContributor` returns a discriminated union (`UpdateTripMetadataResult:748` style) rather than throwing, because the actionable failures (no account / already-on-trip / self) are expected form-validation outcomes the eventual Epic 3 dialog must surface inline. Only `requireUser`/`assertTripAccess` use redirect/notFound.

No UI is built in this story: the dialog shell (Epic 3) and dashboard list / nav badge (Story 1.3) consume this action. Because there is no user-facing UI to drive yet, this story ships no E2E — the invite action's behavior is fully covered by unit tests in `actions.test.ts`, and the browser-driven E2E for the invitation flow belongs in Story 1.3 (dashboard list) and Epic 3 (dialog), where a real UI exists to drive. This honors the no-duplication rule: a backend write with no client caller cannot be exercised end-to-end meaningfully.

## Verification

**Commands:**

- `npm run lint` -- expected: no errors
- `npx tsc --noEmit` -- expected: no type errors
- `npx vitest run src/app/\(app\)/trips/actions.test.ts src/lib/invitations.test.ts src/lib/db-mappers.test.ts` -- expected: all pass
- `npm run db:push` against local dev DB -- expected: `invitations` table created without error

**Manual checks (if no CLI):**

- Inspect `src/db/schema.ts` for the new `invitations` table and confirm the partial-unique-pending index renders; confirm no `collaborators` write path changed.

## Suggested Review Order

**Schema**

- New `invitations` table: pending-only partial unique index, and `invitedBy` cascades on user delete so `deleteAccount` doesn't hit an FK-restrict error.
  [`schema.ts:268`](../../src/db/schema.ts#L268)

**`inviteContributor` action**

- Entry point: gate, normalize, self-invite/role guards, then the account-lookup → transaction sequence.
  [`actions.ts:691`](../../src/app/(app)/trips/actions.ts#L691)

- `hasNormalizedEmail` builds the case/whitespace-insensitive `WHERE` used by every lookup in the action.
  [`actions.ts:681`](../../src/app/(app)/trips/actions.ts#L681)

- Unique-index race: a concurrent duplicate insert is caught and turned into a friendly error instead of throwing.
  [`actions.ts:687`](../../src/app/(app)/trips/actions.ts#L687)

**Types & mapping**

- `Invitation`, `InvitationStatus`, and the `InviteContributorResult` discriminated union.
  [`types.ts:531`](../../src/data/types.ts#L531)

- `dbInvitationToType` mirrors the existing collaborator mapper's null/ISO conventions.
  [`db-mappers.ts:206`](../../src/lib/db-mappers.ts#L206)

- Shared normalization/TTL contract for this and later invitation stories.
  [`invitations.ts:1`](../../src/lib/invitations.ts#L1)

**Tests**

- `inviteContributor` I/O-matrix coverage plus the added unique-index-race case.
  [`actions.test.ts:765`](../../src/app/(app)/trips/actions.test.ts#L765)

- `hasNormalizedEmail` SQL-shape assertion, added to close a verification gap on the normalization contract.
  [`actions.test.ts:913`](../../src/app/(app)/trips/actions.test.ts#L913)

- `dbInvitationToType` field-mapping and ISO/null-conversion cases.
  [`db-mappers.test.ts:542`](../../src/lib/db-mappers.test.ts#L542)
