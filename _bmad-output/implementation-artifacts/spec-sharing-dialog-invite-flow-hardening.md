---
title: "Harden sharing dialog controller and invite flow"
type: "bugfix"
created: "2026-09-09"
status: "done"
baseline_commit: "321157c728df8b4e64a7c2eb484ad2eed996e92b"
review_loop_iteration: 0
context:
  - "{project-root}/_bmad-output/project-context.md"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Four small findings from stories 3-2/3-3/3-5 code review remain open in
`use-trip-share-dialog-controller.ts` and its neighbors: two async-handler paths have no unmount
guard, the invite flow's error handling is brittle and unlogged, an unused prop lingers on
`TripEditSheet`, and `saveContributorChanges` accepts an unbounded batch size.

**Approach:** Apply the controller's own existing `isCurrent` guard pattern (already used by its
`loadData` effect) to the remaining async paths; give `inviteContributor` a typed error code
instead of an exact-string contract; add client-side email validation and error logging; delete
the dead `canManage` prop and its ~6 call sites; cap `changes.length` server-side. The controller
is already at 253 lines (over this project's ~250-line limit) before any of this lands, so extract
its invite-flow slice into a sibling hook as part of this same change rather than growing the file
further.

## Boundaries & Constraints

**Always:** Keep `assertTripAccess`/`isCollaboratorRole` server-side checks authoritative — client
validation is UX only, never a substitute. Preserve every existing toast/error string a test
already asserts unless that assertion is updated in the same change. Write and run named tests
before production edits.

**Ask First:** The exact new `InviteContributorResult` error-code enum values and the
`changes.length` cap constant — pick sensible defaults, but confirm before landing if either
choice isn't obvious from context.

**Never:** Reintroduce the removed People-section pattern.

</frozen-after-approval>

## Code Map

- `src/components/packt/use-trip-share-dialog-controller.ts:158-205` — `resendPendingInvitation`/`removeInvitation` have no `isCurrent` guard, unlike `loadData` (:206-226).
- `src/components/packt/use-trip-share-dialog-controller.ts:77-108` — `handleSaveChanges` same gap.
- `src/components/packt/use-trip-share-dialog-controller.ts:115-141` — `handleInvite`: exact-string match on `"No Packt account found for this email"` (:122), no `console.error` in the file, no client email format check beyond `.trim()`.
- `src/app/(app)/trips/actions.ts:690-765` — `inviteContributor`; `InviteContributorResult` (`src/data/types.ts:893-896`) has only `{status:"error", message: string}`.
- `src/app/(app)/trips/actions.ts:971-985` — `saveContributorChanges`; no cap on `changes.length`.
- `src/components/packt/trip-edit-sheet.tsx:45,64` — unused `canManage` prop. Call sites:
  `src/app/(app)/trips/[tripId]/page-client.tsx:364`, `src/app/(app)/trips/page-client.tsx:87`,
  `src/app/(app)/travel-history/page-client.tsx:127`, plus their 3 test files asserting `data-can-manage`.
- `src/components/packt/use-trip-share-dialog-controller.ts` is 253 lines — already over this
  project's ~250-line file limit, and every task below adds to it. Split before/alongside the
  other changes, not after.

## Tasks & Acceptance

**Execution:**

- [ ] `src/app/(app)/trips/actions.ts` -- add an `errorCode` field (e.g. `"no-account"`) to the
  `{status:"error"}` branch of `InviteContributorResult`, plus a `MAX_CONTRIBUTOR_CHANGES` cap in
  `saveContributorChanges` returning a typed error past it, plus a `revalidatePath("/trips")`
  alongside `saveContributorChanges`'s existing `revalidatePath(\`/trips/${tripId}\`)` (matching
  `acceptInvitation`/`declineInvitation`) -- removes the client's exact-string dependency, closes
  the unbounded-batch gap, and closes the revalidation asymmetry.
- [ ] New `src/components/packt/use-trip-share-invite-form.ts` -- extract the invite-flow slice
  (`email`, `role`, `inviteLoading`, `inviteError`, `handleInvite`) out of
  `use-trip-share-dialog-controller.ts` into this sibling hook, keeping the main controller focused
  on load/stage/save -- brings the controller back under ~250 lines instead of growing it further.
- [ ] `src/components/packt/use-trip-share-dialog-controller.ts` -- add an `isCurrent` ref/guard to
  `resendPendingInvitation`, `removeInvitation`, and `handleSaveChanges`; consume the new
  `useTripShareInviteForm` hook in place of the extracted state/handlers.
- [ ] `src/components/packt/use-trip-share-invite-form.ts` (new hook) -- switch `handleInvite`'s
  branch to check `result.errorCode`; add a `console.error` in each catch block; validate email
  format (regex or reused helper) before calling `inviteContributor`.
- [ ] `src/components/packt/trip-edit-sheet.tsx` -- remove `canManage` prop and its dead
  destructure.
- [ ] `src/app/(app)/trips/[tripId]/page-client.tsx`, `src/app/(app)/trips/page-client.tsx`,
  `src/app/(app)/travel-history/page-client.tsx` -- remove the now-invalid `canManage` prop passed
  to `TripEditSheet`.
- [ ] New `use-trip-share-invite-form.test.ts`, plus updates to
  `use-trip-share-dialog-controller.test.ts`, `trip-edit-sheet.test.tsx`, `actions.test.ts`, and
  the 3 page-client test files above -- update/add coverage for every change in this list.

**Acceptance Criteria:**

- Given the dialog unmounts mid-resend/rescind/save, when the request resolves later, then no
  `setState` fires and no console error about updating an unmounted component appears.
- Given an invite to an email with no Packt account, when `handleInvite` runs, then the client
  branches on a typed code, not a string match.
- Given an invalid email format, when Invite is clicked, then no request is sent and an inline
  error shows.
- Given a batch past the cap, when `saveContributorChanges` runs, then it rejects with a typed
  error and no partial write occurs.
- Given `saveContributorChanges` succeeds, when it returns, then both `/trips/${tripId}` and
  `/trips` are revalidated.

## Verification

**Commands:**

- `npx vitest run src/components/packt/use-trip-share-dialog-controller.test.ts src/components/packt/use-trip-share-invite-form.test.ts src/components/packt/trip-edit-sheet.test.tsx "src/app/(app)/trips/[tripId]/page-client.test.tsx" src/app/(app)/trips/page-client.component.test.tsx src/app/(app)/travel-history/page-client.test.tsx src/app/(app)/trips/actions.test.ts` -- expected: all pass.
- `packt-build-validator` -- expected: lint, type check, coverage, build, affected E2E pass.
