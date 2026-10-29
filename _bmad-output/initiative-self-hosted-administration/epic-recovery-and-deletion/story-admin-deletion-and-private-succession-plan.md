---
title: "Admin deletion and private succession"
type: "feature"
ticket: 3
created: "2026-10-29"
status: "in-review"
baseline_revision: "c8449ab65a2cba6d7164b1c6c3a5bce21091d419"
route: "full"
route_source: "auto"
risk: "high"
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick]
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Users only supports deleting unfinished accounts. Completed accounts need automatic trip succession without exposing private travel data.

**Approach:** One admin deletion flow previews aggregate outcomes, then recomputes an opaque outcome fingerprint under lifecycle locks before committing succession and deletion.

## Boundaries & Constraints

**Always:** CAP-5 and architecture AD-1/2/7 apply. Lock singleton, affected users sorted by ID, then trips sorted by ID. Recheck current completed-admin authority and session security version under locks. Managers precede editors; within each tier sort membership addedAt then user ID. Only remaining account-backed members qualify. Winner becomes owner, manager, sole creator. No eligible successor means delete trip. Preserve self-service explicit choices. Invalidate account authorizations, remove memberships and cancel sent invitations atomically. Files, notifications and secret-free Activity follow commit; failures cannot change committed success.

**Never:** Expose trip IDs/names, collaborators or successor identities through preview responses, errors or markup. Add trip-access bypasses, successor pickers, schema changes or recovery features. Change historical Activity semantics.

## I/O & Edge-Case Matrix

| State | Result |
| --- | --- |
| Managers/editors tied | Role tier, addedAt, user ID determine successor |
| Viewers, empty seats or no members | Delete trip |
| Pending or completed target | Same review/confirm flow; links cease authorizing |
| Outcome changes, even same counts | No writes; refreshed preview requires renewed confirmation |
| Last completed admin / lost authority | Refuse without writes |
| Self-target | Automatic admin policy; sign out after commit (UX exception) |
| Post-commit effect failure | Deletion remains successful; remaining effects attempted |

</frozen-after-approval>

## Code Map

- `src/lib/account-deletion.ts`: reuse deletion transaction/summary; preserve `deleteOwnAccount`. Shared locks live in `account-lifecycle-locks.ts`; membership writers already coordinate. Sort trip locks; clear creator flags during admin transfer.
- `src/lib/unfinished-account-deletion.ts`: obsolete pending-only service; replace callers without compatibility wrappers. Authorization FKs already cascade.
- `src/app/(app)/admin/users/actions.ts`: replace pending-only action; add private preview. `src/app/(app)/profile/actions.ts`: existing effects/sign-out reference.
- `src/components/arrivo/delete-unfinished-account-dialog.tsx`: replace with `delete-account-dialog.tsx`; `app-users-list.tsx` hides completed-account deletion. Files: 103/118 lines.
- `src/lib/activity-labels.ts`: AccountDeleted says “Deleted own account”; use separate admin event to preserve history. `src/data/types.ts` owns domain contracts.

## Tasks & Acceptance

**Execution (tests first; each modified lib/domain component includes matching colocated test):**

- [ ] Extend `src/lib/account-deletion.test.ts` first: matrix cases, fingerprint stability/target/successor binding, forgery, missing target, refusal atomicity, sole creator, authorization/invitation removal. Implement preview/commit in `account-deletion.ts`; remove obsolete unfinished service/test.
- [ ] Add `src/lib/account-deletion-effects.ts` and `.test.ts`: shared effects for profile/admin; isolate cleanup, notification and Activity failures. Update profile `actions.ts` and `actions.test.ts` preserving explicit choices and sign-out. No sign-out inside shared effects.
- [ ] Update admin `actions.test.ts` then `actions.ts`: authorization, response privacy, stale preview, session retention/self-target sign-out, effect failures. Add contracts/admin deletion event in `src/data/types.ts`; update `src/lib/activity-labels.ts` / `.test.ts` and `src/components/arrivo/app-activity.test.tsx`.
- [ ] Replace dialog and matching test with `src/components/arrivo/delete-account-dialog.tsx` / `.test.tsx`; update `app-users-list.tsx` / `.test.tsx`. Cover preview loading/failure, renewed review, uncertain response refresh, pending protection, completed/pending/self accounts. Use client component with explicit Props interface and existing Base UI Dialog/Button. Cancel initially focused; Escape dismisses idle dialog; return focus to trigger or next row/list heading after removal. Announce errors/status, label target, use CSS tokens and 44px controls. Disable destructive submit until reviewed preview exists.
- [ ] Update `tests/e2e/features/unfinished-account-deletion.feature` and matching steps: replace completed-after-list refusal with unified review; retain pending/expired/deleted-link checks. Remove old isolated-service imports.
- [ ] Add `tests/e2e/features/admin-account-deletion.feature`, `tests/e2e/steps/admin-account-deletion.steps.ts`, `tests/e2e/admin-account-deletion-fixture.ts`: scenario-owned mothers, real Postgres succession/ties, viewers-only deletion, stale successor with unchanged counts, last-admin/authority races, authorization invalidation, private payload/markup, admin session and self-target sign-out. Reuse `deletion-concurrency-fixture.ts` lock gates; preserve existing concurrency scenarios. Register sources/tag in `tests/e2e/feature-map.mjs`; await server-action response before reload.

**Acceptance Criteria:**

- Given pending/completed accounts and private owned trips, when admin confirms reviewed deletion, then deterministic outcomes persist and no private identity is disclosed.
- Given changed outcomes or authority, when old confirmation submits, then no mutation occurs and new review is required.
- Given committed deletion, when effects fail, then deletion remains committed; other-account admin stays signed in and self-target signs out.

## Implementation Notes

## Plan Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
| --- | --- | --- | --- |
| app-activity.test.tsx lacks account_deleted_by_admin row | low | patch | Plan task lists the file; label table ended at account_deleted. Row added. |
| AdminActor.sessionVersion typed number or undefined | low | patch | Violates the optional-field convention; runAdminDeletion already treats undefined as Forbidden. Changed to sessionVersion?: number. |
| Dialog outcome not announced | medium | patch | Only the loading line was role=status and it unmounted on ready. Loading and outcome now share one persistent status region; test asserts it. |
| trip-delete.steps.ts out of scope | false | rejected | Hardening was requested by the user to fix two failing E2E scenarios; it is not a plan edit. |

## Design Notes

Use keyed digest of canonical outcomes, preventing identifier guessing from client-visible hashes. Preview/commit share resolver under locks; no persisted preview state.

## Verification

Run matching Vitest, affected Playwright, then build-validator once after final code (E2E separate). Read version-matched Next.js mutation guide before action edits. No full suite or CHANGELOG edit.
