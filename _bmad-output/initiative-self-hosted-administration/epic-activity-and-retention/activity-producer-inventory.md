# Activity producer inventory

Written by story 2.1 (Sign-in to Activity tracer). Lists the real mutation owners that stories 2.3, 2.5 and 2.6 instrument, and the shared names they use.

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

## Story 2.5 (trips)

- `src/app/(app)/trips/actions.ts`: `createTrip`, `updateTripMetadata`, `deleteTrip`, `leaveTrip`.
- `src/app/(app)/trips/[tripId]/actions.ts`: itinerary edits (`createEvent`, `updateEvent`, `deleteEvent`, `deleteEventWithDocDecision`, `reorderDayItems`, `updateDay`, `addDay`, `removeLastDay`, notes and checklist actions), documents (`addDocument`, `removeDocument`, `renameDocument`, ...), covers (`setTripCoverWithAttribution`, `removeTripCover`).
- Uploads: `uploadCoverImage` in `cover-upload-actions.ts`, `uploadDocument` / `uploadDocumentToEvent` in `document-upload-actions.ts`.
- Other: `updateTripTransitMode` in `transit-actions.ts`; `src/app/(app)/trips/[tripId]/budget/actions.ts`; `src/app/(app)/trips/[tripId]/reservations/actions.ts` and `reservation-document-actions.ts`; packing in `src/app/(app)/trips/packing-actions.ts`.
- Trip event metadata stays minimal (trip ID, no names or details). Routine edits are batched by 2.2.
- Note: `saveContributorChanges` and the packing actions are exported from more than one module (`trips/actions.ts`, `[tripId]/actions.ts`, `packing-actions.ts`); confirm which one the UI imports and instrument only that to avoid duplicate emission.

## Story 2.6 (invitations)

- `inviteContributor`, `acceptInvitation`, `declineInvitation`, `rescindInvitation`, `dismissInvitation`, `saveContributorChanges` in `src/app/(app)/trips/actions.ts`.
- `resendShareInvitation`, `rescindShareInvitation`, `dismissShareInvitation`, `saveContributorChanges` in `src/app/(app)/trips/[tripId]/actions.ts`.
- `resendInvitation` / `applyInvitationResend` in `src/lib/invitations.ts`.
