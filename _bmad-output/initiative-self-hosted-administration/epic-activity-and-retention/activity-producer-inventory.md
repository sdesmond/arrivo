# Activity producer inventory

Written by story 2.1 (Sign-in to Activity tracer). Lists the real mutation owners that stories 2.3–2.6 instrument, and the shared names they use.

## Shared names

- Table: `activityEvents` (`activity_events`) in `src/db/schema.ts`; no foreign keys or cascades. Actor is a stable `actorId` plus event-time `actorUsername`; optional `targetId`/`targetUsername` and `tripId`.
- Types in `src/data/types.ts`: `ActivityEventType` (const object), `ActivityIdentity`, `ActivityTarget`, `ActivityEventInput`, `ActivityBatchInput`, `ActivityEventSummary`.
- Recorder: `recordActivity(input)` in `src/lib/activity.ts`. Synchronous `void`; schedules the insert with `after()`, bounded by `ACTIVITY_WRITE_TIMEOUT_MS`, no retries, all failures caught and logged by error class only. Occurrence time comes from the injectable real clock (`setActivityClock`), never `getNow()`.
- Reader: `listRecentActivity(viewerId)` in `src/lib/activity-queries.ts`; rechecks DB admin authority (`notFound()` otherwise), newest first (`endedAt desc, id desc`), fixed `ACTIVITY_LIST_LIMIT`.
- Route: `/admin/activity` (`src/app/(app)/admin/activity/page.tsx`), component `InstanceActivity`.

Rules for every producer: call `recordActivity` only after the primary mutation has committed and never inside its transaction; capture the actor's username before a rename or deletion; never put IPs, tokens, URLs, credentials or private trip details in an event; add the new type to `ActivityEventType` and to `EVENT_LABELS` in `instance-activity.tsx`.

## Done (2.1)

- Sign-in: `completeSignIn` in `src/lib/authorize-credentials.ts` (single success point for password and MFA paths).

## Done (2.3, authentication and account events)

- Failed sign-in (`sign_in_failed`): rejection branches of `authorizePassword` / `authorizeSecondFactor` and the missing-field path in `authorizeCredentials`, `src/lib/authorize-credentials.ts`. No actor; target is a known account (ID plus canonical username), an unknown account (supplied username only), or absent (unavailable).
- Logout (`sign_out`): `signOutAction` in `src/app/(auth)/actions.ts`, recorded only after `signOut` succeeds.
- Bootstrap creation (`account_created`): `signUpAction` in `src/app/(auth)/actions.ts`, from the committed result of `bootstrapFirstAccount` (`src/lib/instance-bootstrap.ts`).
- Role change (`role_changed`): `changeUserRoleAction` in `src/app/(app)/admin/users/actions.ts`, only when `changed`; usernames come from `changeUserRole` (`src/lib/account-role-changes.ts`) under its locks.
- Self-service deletion (`account_deleted`): `deleteAccount` in `src/app/(app)/profile/actions.ts`, from the `account` snapshot `deleteOwnAccount` (`src/lib/account-deletion.ts`) returns.
- Username change (`username_changed`) and password change (`password_changed`): `updateProfile` and `changePassword` in `src/app/(app)/profile/actions.ts`. The old username is read under a row lock; neither event stores the new value.

## Not covered by 2.3

- MFA on/off, recovery codes, sign out everywhere, trusted-device removal: `confirmMfaEnrollment`, `disableMfa`, `regenerateRecoveryCodes`, `signOutEverywhere`, `removeTrustedDevice` in `src/app/(app)/profile/security-actions.ts`. Not in the approved event list; no producer yet.

## Done (2.4, trip and itinerary events)

- `trip_created`: `createTrip` in `src/app/(app)/trips/actions.ts`, once the transaction commits and before cover work, using the actor identity captured under the user lock.
- `trip_updated`: `updateTripMetadata` in that module, only on `saved`; and `updateTripTransitMode` in `[tripId]/transit-actions.ts` after its update.
- Itinerary owners in `src/app/(app)/trips/[tripId]/actions.ts`: `createEvent`, `updateEvent`, `deleteEvent`, `deleteEventWithDocDecision`, `reorderDayItems`, `updateDay`, `addDay`, `removeLastDay` (only `removed`), `createNote`, `updateNote`, `deleteNote`, `createTripNote`, `updateTripNote`, `deleteTripNote`, `reorderTripNotes`, `createChecklist`, `createChecklistWithItem`, `updateChecklistTitle`, `deleteChecklist`, `createChecklistItem`, `updateChecklistItem`, `toggleChecklistItem`, `deleteChecklistItem`, `addChecklistFromPackingSource`.
- `src/lib/trip-activity.ts` isolates username lookup and recorder failures. Updates synchronously schedule a post-response actor username lookup bounded to five seconds, suppress late results, and merge through 2.2; events contain actor and trip ID only.
- Refusals, confirmation-required results, access denials and thrown mutations emit nothing. `deleteTrip`, `leaveTrip` and read-only `route-actions.ts` are outside the approved event list.

## Done (2.5, other trip edit events)

All emit `trip_updated` through `recordTripUpdated(user.id!, tripId)` after commit at the mutation owner, merging into the 2.4 batched row (actor and trip ID only).

- Covers and documents in `src/app/(app)/trips/[tripId]/actions.ts`: `setTripCoverWithAttribution`, `removeTripCover`, `addDocument`, `removeDocument`, `renameDocument`, `attachTripDocToEvent`, `promoteEventDocToTrip`. `uploadCoverImage` in `cover-upload-actions.ts`; `uploadDocument` / `uploadDocumentToEvent` in `document-upload-actions.ts`. The same-named exports at the end of `actions.ts` only delegate and are not instrumented.
- Budget (`[tripId]/budget/actions.ts`): `createExpense`, `updateExpense`, `recalculateConversions`, `deleteExpense` (not on a missing row).
- Reservations: `createReservation`, `updateReservation`, `deleteReservation` (not on a missing row) in `reservations/actions.ts`; `uploadReservationDocument`, `removeReservationDocument`, `renameReservationDocument`, `promoteReservationDocToTrip`, `attachTripDocToReservation` in `reservation-document-actions.ts` (not on a missing doc).
- Packing (`src/app/(app)/trips/packing-actions.ts`): `addPackingItemImpl`, `updatePackingItemImpl`, `togglePackingItemImpl` (not when the locked row is gone), `removePackingItemImpl`, `removePackingSectionImpl` (not when the locked section is gone), `reorderPackingItemsImpl` (non-empty only), `pullTemplatesOntoTripImpl` (only when `added > 0`), `createPackingList`, `renamePackingList`, `deletePackingList`. Never the exported `*WithErrorHandling` wrappers.
- Not instrumented: `saveTripListAsTemplate` (standalone template, not a trip edit), `deleteTrip`, `leaveTrip`.
- Refusals, access denials, validation errors, thrown mutations and no-op paths emit nothing.

## Done (2.6, invitation events)

- `invitation_created`: `inviteContributor` in `src/app/(app)/trips/actions.ts`, only after its transaction commits with `status: "invited"`, including replacement after decline.
- `invitation_accepted`: `acceptInvitation` in that module, only after the matched pending invitation and membership transaction commits.
- `invitation_rescinded`: `rescindInvitation` in that module, only after the conditional pending update returns a row.
- All three use `recordTripInvitation` in `src/lib/trip-activity.ts`: synchronous scheduling, bounded post-response actor lookup, caught failures, actor and trip ID only. These are individual events, outside `BATCHED_TYPES`.
- Excluded: pending-invitation resend branch in `inviteContributor`; `declineInvitation`, `dismissInvitation`, `saveContributorChanges`; `resendInvitation` / `applyInvitationResend` in `src/lib/invitations.ts`. Delegating invitation exports in `[tripId]/actions.ts` are not instrumented.
- Missing, expired, wrong-account, nonpending, denied, refused, no-op and thrown/rolled-back mutations emit nothing. Events never include target identity, invitation ID, role, trip name, token or URL.
