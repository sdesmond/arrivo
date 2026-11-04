---
title: "Profile picture upload"
type: "feature"
ticket: ""
created: "2026-11-04"
status: "built"
baseline_revision: "ff63e0375df8970ad24643701d328542c2778ef5"
route: "full"
route_source: "auto"
risk: "medium"
review: "thorough"
review_source: "auto"
lenses_ran: ["blind-hunter", "edge-case-hunter", "verification-gap", "intent-alignment"]
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Every avatar in the app is initials only; the profile identity section says "Profile photo upload coming soon." `users.image` exists but is unused.

**Approach:** Signed-in user uploads, replaces, or removes a profile picture. A server action re-encodes it to 256×256 WebP with `sharp`, stores it through `getStorageAdapter()`, and saves the URL in `users.image`. Every place that shows initials today (profile, sidebar, trip card and now-card avatar stacks, trip share collaborator row) shows the photo, with initials as fallback.

## Boundaries & Constraints

**Always:** Server action calls `requireUser()` first and touches only the caller's row. Validate MIME type (JPEG/PNG/WebP) and size (max 5 MB) server-side, then re-encode: apply EXIF orientation, center-crop square, resize 256×256, output WebP with metadata stripped, cap input pixels to reject decompression bombs. Delete previous file after the new one is saved; delete the new file if the DB write fails. Add the user's avatar to account-deletion `storageUrls`. Avatar reads need a signed-in user only (no trip check). Initials fallback when no image, load error, or the collaborator's account is deleted. Interactive controls meet 44×44px. The profile photo is large (144px). Upload/replace is a labelled control inside the picture itself, revealed on hover and keyboard focus (hidden file input opened by it, `accept` set to the allowed types, Enter/Space operable, focus stays on it after choosing); Remove is a labelled text button underneath the picture. Avatar images use `alt=""` because the name or an `aria-label` is always adjacent. No schema change.

**Never:** HEIC, GIF, AVIF input. Storing the original upload. Trusting client-reported type alone. Direct `fs`/blob imports. Hardcoded colors. Editing `CHANGELOG.md`. Per-trip or per-user avatar visibility rules.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| -------- | ------------- | -------------------------- | -------------- |
| Upload | JPEG/PNG/WebP under 5 MB | 256×256 WebP stored, `users.image` set, photo shown everywhere | No error expected |
| Replace | Existing avatar | New file stored, old file removed | Old-file delete failure logged, not thrown |
| Remove | Existing avatar | `users.image` null, file deleted, initials return | Storage failure logged, DB still cleared |
| Rejected file | Over 5 MB or wrong type | Nothing stored, row unchanged | Inline `toast.error` naming limit and accepted types |
| Undecodable file | Right MIME, corrupt bytes | Nothing stored | `toast.error` "Couldn't read that image" |
| DB write fails | File stored, update throws | Stored file deleted | Error surfaces to user |
| Member without account | Collaborator, `userId` null | Initials shown | None |

</frozen-after-approval>

## Code Map

- `src/db/schema.ts:30` -- `users.image` already present; no migration.
- `src/lib/upload-policy.ts` -- scopes, MIME sets, `createUploadStorageName`, `assertValidCoverUpload` pattern; add `user-avatar` scope (prefix `user-avatars`, owner = user id) and `assertValidAvatarUpload`.
- `src/lib/utils.ts:183` -- upload byte limits; add `MAX_AVATAR_UPLOAD_BYTES` (5 MB).
- `src/app/(app)/trips/[tripId]/cover-upload-actions.ts` -- put/update/delete-previous/rollback pattern to mirror.
- `src/app/api/storage/[...path]/route.ts`, `src/lib/storage/trip-resolution.ts` -- reads resolve owning trip; `user-avatar` keys must skip `assertTripAccess` (still `requireUser`). Key shape parses via `parseUploadStorageName`.
- `src/lib/account-deletion.ts:232` -- `storageUrls`; add deleted user's `image`.
- `src/data/types.ts:522,873`, `src/lib/db-mappers.ts:89,198` -- add `image` to `UserProfile` and `Collaborator`.
- `src/lib/queries.ts:113` `selectCollaboratorsWithUsername` -- also select `users.image` (left join, null once account is gone).
- `src/components/ui/avatar.tsx` -- `Avatar`/`AvatarImage`/`AvatarFallback` to build on; `src/lib/trip-tints.ts` `getAvatarTint` for fallback color.
- Initials render sites: `identity-section.tsx:77`, `sidebar-nav.tsx:95`, `avatar-stack.tsx` (used by `trip-card.tsx:178`, `now-card.tsx:216`, takes `initials: string[]`), `trip-share-collaborator-row.tsx:60`.
- `next.config.ts` -- 25 MB server-action limit already sufficient. `sharp` 0.34.5 is only a transitive dependency of `next`; add as direct dependency, check Docker standalone build.
- `tests/e2e/features/profile.feature`, `tests/e2e/feature-map.mjs` -- E2E scenario; register new source files.

## Tasks & Acceptance

**Execution:**

- [ ] `src/lib/upload-policy.ts`, `src/lib/utils.ts` + `upload-policy.test.ts` -- avatar scope, accept list, validator -- reject bad type/size
- [ ] `src/lib/avatar-image.ts` + `.test.ts`, `package.json` -- `sharp` re-encode to 256×256 WebP, strip EXIF, orientation, pixel cap
- [ ] `src/app/(app)/profile/avatar-actions.ts` + `.test.ts` -- `uploadAvatar`, `removeAvatar`: own-row only, rollback, old-file cleanup
- [ ] `src/app/api/storage/[...path]/route.ts`, `src/lib/storage/trip-resolution.ts` + `route.test.ts`, `trip-resolution.test.ts` -- avatar keys need sign-in only; `resolveOwningTripId` must not fall through for `user-avatar` (route branches on scope before resolving a trip); test signed-in read, no-session denial, malformed key
- [ ] `src/data/types.ts`, `src/lib/db-mappers.ts`, `src/lib/queries.ts` + `db-mappers.test.ts` -- carry `image` on users and collaborators
- [ ] `src/lib/account-deletion.ts` + `.test.ts` -- include avatar in `storageUrls`
- [ ] `src/components/arrivo/profile-avatar.tsx` + `.test.tsx` -- `"use client"` shared image-or-initials circle with explicit `ProfileAvatarProps` (image, initials, size, tint); `onError` falls back to initials; test image, no image, load error, each size
- [ ] `identity-section.tsx`, `sidebar-nav.tsx`, `avatar-stack.tsx`, `trip-card.tsx`, `now-card.tsx`, `trip-share-collaborator-row.tsx` + colocated tests -- use `ProfileAvatar` (update existing assertions on initials text; `AvatarStack` takes per-member image alongside initials); identity section gets choose/replace/remove controls, tested for client-side error toast and pending state
- [ ] `tests/e2e/features/profile.feature` + `steps/profile.steps.ts`, `tests/e2e/feature-map.mjs` -- upload and remove scenarios using `setInputFiles` with an in-step PNG buffer; each mutation step awaits `waitForServerActionResponse` before reload; map `avatar-actions.ts`, `avatar-image.ts`, `profile-avatar.tsx` to `@feat:profile` (and `avatar-image.ts` into the storage group), then run `scripts/feature-map.test.mjs`

**Acceptance Criteria:**

- Given a user with no photo, when they upload a valid image, then profile, sidebar, and trip avatars show it after reload.
- Given a user with a photo, when they remove it, then initials return everywhere and the file is gone from storage.
- Given an account is deleted, when cleanup runs, then the avatar file is deleted.
- Given another signed-in user, when they request the avatar URL, then it loads; given no session, then it is denied.

## Implementation Notes

## Plan Change Log

- 2026-11-04, human renegotiation during review: photo in the profile section must be visibly larger, and add/replace controls must live inside the picture on hover. Amended the frozen Always line (was: separate labelled text buttons beside a 56px avatar). Built (revised after a second round of feedback: bigger, Remove underneath): 144px avatar, full-circle "Upload/Replace photo" button overlay (hover, focus-visible, and while uploading), resting camera badge, Remove is a labelled h-11 button underneath it. KEEP: `aria-disabled` + focus retention, focus moves to the upload control after Remove, client-side type/size toast, server result values for expected errors.

## Review Triage Log

Review loop 1 (blind-hunter, edge-case-hunter, verification-gap, intent-alignment). Verdict, route, evidence:

- Collaborator select `image` never asserted (verification-gap) — medium, patch — `queries.test.ts` could drop `image: users.image` unnoticed. Added assertion on the select columns.
- No `Cache-Control` on avatar responses (blind, edge) — low, patch — every avatar refetched through the auth route per navigation; fix is one header for the avatar scope. Added header + route tests.
- Rollback delete failure swallowed silently (blind) — low, patch — reused `deleteStoredFile` so a leaked file logs.
- Concurrent uploads orphan a file (blind, edge, verification-gap) — low, defer — real but needs overlapping uploads by one user; fix needs a row-locking transaction.
- No per-user throttle on upload/sharp decode (blind, edge) — low, defer — pixel and size caps bound one request; covers/docs have no throttle either.
- `getUserById` `image` not unit-asserted (verification-gap) — low, defer — profile E2E reloads and checks the sidebar photo.
- No E2E showing a collaborator's photo on trip card/now-card/share row (blind, verification-gap, intent-alignment) — low, defer — unit-tested per component; select now asserted.
- Unvalidated URL passed to `del` (blind) — false — local adapter `del` returns early unless the URL starts with `/api/storage/`; the value is the caller's own row.
- Server-action body limit (blind) — false — `next.config.ts` already allows 25 MB.
- `sharp` deployment (blind) — false — Dockerfile already swaps sharp's platform binaries for the standalone build.
- Other initials sites unaudited (blind) — false — `initials` grep over `src/**/*.tsx` finds only the five mapped sites.
- Remove reports ok when file delete fails (edge) — false — matrix requires log-not-throw with the DB cleared.
- Any signed-in user reads any avatar key (edge) — false — the intent requires exactly that.
- Camera badge not in intent (intent-alignment) — false — descriptive note; touch affordance for the hover-only control.
- Feature-map under-covers `ProfileAvatar` consumers (blind) — low, rejected — consumers are already mapped to their own features; the fix widens runs for little gain.
- Stale `image` state from props, transient `onError`, unreachable rethrow, zero-row update, a11y announcements, duplicated constants, resolver contract (blind, edge) — low, rejected — unlikely in everyday use and each fix adds guards or branches.
- E2E avatar files left in storage (blind) — low, rejected — scenario-owned DB rows are cleaned; storage dir is a test artifact.

