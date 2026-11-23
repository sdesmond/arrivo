- source_plan: `_bmad-output/initiative-mobile-api/epic-checklist-api-pilot/story-make-api-replay-atomic-and-authorization-aware-plan.md`
  summary: Add a retention sweep for expired `idempotency_keys` rows.
  evidence: API replay rows (`api:v1:` namespace) are replaced on reuse but never purged, and legacy packing rows share the same unbounded growth; expiry only gates replay.
  completed: 2026-11-16 on `fix/idempotency-key-sweep`; the maintenance pass (`scheduleActivityMaintenance`) now runs `purgeExpiredIdempotencyKeys` (`src/lib/idempotency-retention.ts`), which deletes rows whose `created_at` is older than the 24-hour `IDEMPOTENCY_RETENTION_MS`, in batches of 1,000 (at most 20 per pass), skipping rows a writer holds. Deleting by age is safe only while no replay window outlasts the retention: API replay defaults to it and refuses a longer `expiryMs`, packing's window reads it, and `idempotency-expiry-cap.test.ts` fails on any v1 route that sets a longer expiry (mutation-checked). Tests: `idempotency-retention.test.ts`, `idempotency.test.ts`, `activity-maintenance.test.ts`, and `idempotency-retention.feature` (the sweep against real PostgreSQL, plus a dynamic request deleting an expired record and keeping a live one). Not done: a deleted account's rows stay until the first pass after they turn 24 hours old (`user_id` has no foreign key), and there is no `created_at` index, so a batch can scan the whole table.
  followed up: 2026-11-16 on `fix/idempotency-keys-index`. Migration `0015` adds `idempotency_keys_created_at_idx`, so a sweep batch reads only expired rows (`schema.test.ts`). Account deletion now deletes the account's `idempotency_keys` rows in its transaction (`removeAccount`, `account-deletion.test.ts`). A foreign key was not used: `user_id` is `text` while `users.id` is `uuid`, so it would need a column type change and an orphan cleanup in the migration for rows the sweep already removes within a day.

- source_plan: `_bmad-output/initiative-mobile-api/epic-checklist-api-pilot/story-move-checklist-creation-title-and-deletion-to-services-plan.md`
  summary: Migrate checklist create/title/delete UI callers to lifecycle APIs, add client 204 handling, and retire four migrated server actions.
  evidence: User requested splitting story 1.5 plan; backend endpoints can ship additively while existing UI actions remain operational. Follow-up completes story 1.5 using use-checklist-handlers and use-trip-detail-handlers with matching tests, client.test.ts/client.ts, actions.test.ts/actions.ts, day-planning.feature/steps, exact API waits, draft rejection on API/auth failure, title null clearing, first-item expansion, reload persistence, and feature-map updates. Use a new story branch from latest feature/api-v1 after backend merge; PR base feature/api-v1.
  completed: 2026-11-08 on `story/1-5-checklist-lifecycle-services` (user chose the current branch); UI callers migrated, four actions retired. Awaiting review and validation; story 1.5 not marked done.

- source_plan: `_bmad-output/initiative-mobile-api/epic-checklist-api-pilot/story-complete-checklist-lifecycle-ui-migration-plan.md`
  summary: Send a stable client UUID (and firstItem id) on checklist create so a retry after a lost response or a double submit cannot duplicate.
  evidence: `handleAddChecklist` sends no `id`, so the backend's id-based replay is unused. The id must survive retries of the same draft, which means a `use-day-draft` change. The retired action had the same gap. The failed-create E2E mocks the 500, so it cannot show a commit-then-fail retry.
  completed: 2026-11-12 by story 2.3 (draft-stable client IDs for checklist creates); `handleAddChecklist` takes the draft's `clientId` (`use-trip-detail-handlers.ts`). Reconciled 2026-11-14 in the epic 3 retrospective.

- source_plan: `_bmad-output/initiative-mobile-api/epic-checklist-api-pilot/story-move-checklist-item-lifecycle-to-the-api-plan.md`
  summary: Send a stable client UUID on checklist item create so a retry after a lost response or a double submit cannot duplicate the item.
  evidence: `handleAddChecklistItem` sends no `id`, so the API's id-based replay is unused from the UI; the retired server action had the same gap. Needs a draft-stable id in the item input flow. Raised by blind-hunter and edge-case-hunter.
  completed: 2026-11-16 on `fix/draft-retry-ids`. The handler already sent an id, but a new one per call. Now a failed create keeps its id per checklist and text, and sending that text to that checklist again reuses it, so a create whose response was lost replays (the server matches checklist and content) instead of adding a duplicate. The id is claimed while in flight, a success forgets it, and a 409 drops it. A double submit was already impossible: the input clears on Enter. Tests: `use-checklist-handlers.test.tsx` (same-text retry, per-checklist-and-text keys, a repeat after success, conflict, an older attempt settling late). No E2E: reaching it needs a lost response after commit.

- source_plan: `_bmad-output/initiative-mobile-api/epic-checklist-api-pilot/story-move-packing-source-checklist-insertion-to-the-api-plan.md`
  summary: Double-clicking a packing-source picker row creates two checklists because each call mints a fresh client UUID and nothing guards an in-flight insert.
  evidence: Pre-existing (the retired server action had no in-flight guard); `useApiMutation` exposes `isPending` that a handler guard could use. Low severity.
  completed: 2026-11-12 by story 2.3 (`6b84e264`); `handleInsertFromPackingSource` returns while an insert is in flight (`insertInFlight`, `use-packing-handlers.ts`). Test: "sends one request when the same insert is selected twice before the first settles". Reconciled 2026-11-15 on `fix/epic-3-small-items`.

- source_plan: `_bmad-output/initiative-mobile-api/epic-checklist-api-pilot/story-retire-checklist-actions-and-complete-api-regression-coverag-plan.md`
  summary: `src/app/(app)/trips/[tripId]/actions.ts` is listed under the `app-activity` FEATURE_MAP entry, which wins over its SHARED_GLOBS entry, so editing it runs only `@feat:app-activity` instead of the full suite.
  evidence: scripts/affected-e2e.mjs checks FEATURE_MAP before SHARED_GLOBS; the module still holds event, day, note and document actions that other features exercise. Pre-existing mapping, not caused by this change.
  completed: 2026-11-15 as stale on `fix/epic-3-small-items`; the premise no longer holds. The file is 52 lines and holds only the share-dialog actions (`getShareDialogData`, `resend`/`rescind`/`dismissShareInvitation`, `saveContributorChanges`); event, day, note and document writes moved to `/api/v1`. A feature-scoped run is the right scope for it. It is still mapped under ten features, so an edit runs more than it needs; trimming that is an optional follow-up, not a defect.

- source_plan: `_bmad-output/initiative-mobile-api/epic-itinerary-api/story-edit-one-event-through-the-api-plan.md`
  summary: A second quick event edit sends a stale full snapshot and can revert the first edit's field, because the handler sends all nine fields every time.
  evidence: Raised by blind-hunter and edge-case-hunter. The retired action also sent the full event; a fix is sending only changed fields (diff against the stored event).
  completed: 2026-11-12 (commit `b408d88e`, plan `plan-preserve-pending-event-edits.md`); `handleEventUpdate` sends `eventPatchBody(intent)`, only the changed fields. Reconciled 2026-11-14 in the epic 3 retrospective.

- source_plan: `_bmad-output/initiative-mobile-api/epic-itinerary-api/story-edit-one-event-through-the-api-plan.md`
  summary: A failed event PATCH leaves the row showing the unsaved draft: only a toast, no refresh.
  evidence: Raised by blind-hunter and edge-case-hunter. The retired action had no revert either; an `onError: router.refresh` on `handleEventUpdate` would re-sync.
  completed: 2026-11-12 on `story/2-11-api-mutation-hook-lifetime-and-keyboard-reorder`; `handleEventUpdate` refreshes on error.

- source_plan: `_bmad-output/initiative-mobile-api/epic-itinerary-api/story-edit-one-event-through-the-api-plan.md`
  summary: `useApiMutation` returns early when its hook has unmounted, so an edit queued behind another is discarded if the user navigates away.
  evidence: `use-api-mutation.ts:51`; shared by every pilot handler. Fix is to let queued requests run and skip only the refresh.
  completed: 2026-11-12 on `story/2-11-api-mutation-hook-lifetime-and-keyboard-reorder`; queued and post-unmount writes now send; only callbacks and refresh are skipped, and a failure toasts.

- source_plan: `_bmad-output/initiative-mobile-api/epic-itinerary-api/story-edit-one-event-through-the-api-plan.md`
  summary: A partial event PATCH can store `endAt` before `startAt`: only per-field format is validated.
  evidence: Pre-existing (the retired action and `updateEventSchema` had no ordering check). Needs a merged-state check in `services/events.ts` returning 422.
  tracked: https://github.com/sdesmond/arrivo/issues/504 (needs the overnight-capable time dialog first; the plain-event dialog cannot express overnight spans).

- source_plan: `_bmad-output/initiative-mobile-api/epic-itinerary-api/story-edit-one-event-through-the-api-plan.md`
  summary: No API reference documents `PATCH /api/v1/events/:eventId` or the pilot endpoints.
  evidence: Raised by blind-hunter; `docs/plans/mobile-api.md` is the plan, not a reference.
  completed: 2026-11-17 on `docs/api-reference`. `docs/api-v1.md` documents all 23 v1 routes (conventions, error codes, roles, rate limits, deadlines, replay, client ids, deletes, ordering, types, then each endpoint's fields and failures). `src/lib/api/api-reference.test.ts` fails when a route is added or removed without the page, when a contract and its route disagree, or when an endpoint's documented `Idempotency-Key` support differs from its route. Field-level drift (limits, nullability) is not checked; generated OpenAPI stays a mobile-phase item.

- source_plan: `_bmad-output/initiative-mobile-api/epic-itinerary-api/story-harden-the-api-mutation-client-plan.md`
  summary: A write that times out client-side may still commit later and land after the next write on the same key.
  evidence: Aborting `fetch` does not stop the server. Needs server-side ordering or idempotency keys on PATCH; flagged by blind-hunter.
  completed: 2026-11-16 on `fix/api-write-safety`; `apiRoute` runs each request under a deadline 10 s ahead of the client's timeout (30 s under for uploads), and `runTripWrite` caps each statement at the time left and rolls back work that ends past it (503 `deadline_exceeded`), so an abandoned write cannot commit late (`src/lib/request-deadline.ts`; ADR `adr-api-contracts.md` "Request deadline"). Tests: `request-deadline.test.ts`, `route.test.ts`, `trip-write.test.ts`, `errors.test.ts`, and `request-deadline.feature` (statement cap, lock wait, late finish and transaction-local scope against real PostgreSQL). Not done: time before the handler starts is not counted, so the margin bounds the race rather than closing it; ordering beyond that (version checks) is a mobile-phase decision. No E2E drives an API route past its 20 s deadline.

- source_plan: `_bmad-output/initiative-mobile-api/epic-itinerary-api/story-harden-the-api-mutation-client-plan.md`
  summary: After a timeout the hook shows "Try again" and does not refresh, so the UI can stay stale after a write that committed.
  evidence: Same refresh-on-error choice as the story 2.1 entry; `use-api-mutation.test.tsx` asserts failures never refresh.
  completed: 2026-11-12 on `story/2-11-api-mutation-hook-lifetime-and-keyboard-reorder`; event edits refresh on timeout via the same `onError`; other handlers unchanged.

- source_plan: `_bmad-output/initiative-mobile-api/epic-itinerary-api/story-harden-the-api-mutation-client-plan.md`
  summary: `api()` rethrows a raw `SyntaxError` for a malformed 200 body instead of an `ApiClientError`.
  evidence: Pre-existing at `client.ts`; `client.test.ts` now documents it. Fix maps it to `ApiClientError(status, "server_error", ...)`.
  completed: 2026-11-12 on `story/2-11-api-mutation-hook-lifetime-and-keyboard-reorder`; mapped to `ApiClientError(status, "server_error", ...)`.

- source_plan: `_bmad-output/initiative-mobile-api/epic-itinerary-api/story-send-draft-stable-client-ids-for-checklist-creates-plan.md`
  summary: A draft whose commit is still pending when the user cancels and opens another draft arms the new draft's baseline when the old commit resolves.
  evidence: Pre-existing in `use-day-draft` (the old baseline ref did the same); the old commit's growth can clear the new draft. Settle by tying the post-await writes to the draft ID captured at commit start.
  completed: 2026-11-16 on `fix/draft-retry-ids`; `commitDraft` captures the draft ID at start and ignores its own outcome once that draft was cancelled or replaced, so it neither arms the newer draft's baseline nor resets its in-flight guard or ID. Tests: `use-day-draft.test.ts` "a commit that settles after its draft was replaced" (both fail without the fix).
- source_plan: `_bmad-output/initiative-mobile-api/epic-itinerary-api/story-send-draft-stable-client-ids-for-checklist-creates-plan.md`
  summary: Editing the first-item text and committing again after an ambiguous failure reuses the draft ID and gets a 409 until the draft is cancelled.
  evidence: Content drift stays a 409 by the frozen boundary, and the hook keeps the ID after a rejection. A fix would mint a new ID on a conflict, which needs the handler to surface the status.
  completed: already fixed by `e2e3ff33` ("give an event or checklist draft a new ID after a conflict"); `handleAddChecklist` rethrows the `ApiClientError` and `commitDraft` mints a new ID on `conflict`. Test: `use-day-draft.test.ts` "mints a new checklist ID after a conflict...". Reconciled 2026-11-16 on `fix/draft-retry-ids`.

- source_plan: `_bmad-output/initiative-mobile-api/epic-itinerary-api/story-extract-shared-timeline-positioning-and-reorder-days-through-plan.md`
  summary: Drags still waiting in a keyed `useApiMutation` queue are dropped if the component unmounts before they start, so the last rapid drag can fail to persist after immediate navigation.
  evidence: Pre-existing in `use-api-mutation.ts` (`run` returns early when `!mounted.current`); day drags now go through it instead of a server action that kept running. Settle by flushing queued writes on unmount or confirming a navigation guard exists.
  completed: 2026-11-12 on `story/2-11-api-mutation-hook-lifetime-and-keyboard-reorder`; fixed by the hook change; no navigation-guard E2E added.
- source_plan: `_bmad-output/initiative-mobile-api/epic-itinerary-api/story-move-trip-notes-to-the-api-plan.md`
  summary: A trip-note edit or create saved while the editor unmounts (tab switch) skips the hook's toast, `onSuccess` and refresh, so a failure is silent and the page may stay stale.
  evidence: UNVERIFIED medium. `useApiMutation.mutate` returns early once unmounted; the plan assumes the live-sync publish from `afterTripWrite` refreshes the page. Settle it with an E2E that edits a note, switches tab, and checks the saved note shows.
  completed: 2026-11-12 on `story/2-11-api-mutation-hook-lifetime-and-keyboard-reorder`; write already in flight before unmount; E2E `Leaving the Notes tab while a note is open still saves the edit` passes. A failure now toasts.
- source_plan: none
  summary: Diagnose production keyboard trip-note reorder failure after the event-edit fix.
  evidence: User selected event fix first; retrospective F-6 repeats an API-response timeout but does not establish application versus automation cause.
  completed: 2026-11-12 on `story/2-11-api-mutation-hook-lifetime-and-keyboard-reorder`; not reproduced on this tree: production build, scenario 4/4 isolated, `@feat:trip-notes` 20/20. No root cause established; likely harness-related at the retro cut.
- source_plan: `epic-documents-covers-api/story-upload-event-and-reservation-documents-through-the-api-plan.md`
  summary: Consider exact byte-size replay metadata rather than rounded display size.
  evidence: Shared uploader compares formatted size, so different byte lengths within one rounding bucket can replay; behavior predates story 3.2.
  completed: 2026-11-16 on `fix/api-write-safety`; no schema change. The server still compares the rounded size, but no web client can reach it with a different file: both attach dialogs mint a new id whenever the chosen `File` changes, and the trip tab keys its id on name, exact byte size and last-modified time. Pinned by `trip-docs-tab.test.tsx` "uses a new document id for a same-named file whose size differs only in bytes" beside the existing dialog cases. Revisit (a `byte_size` column) if a non-web client reuses ids across files.
- source_plan: `epic-documents-covers-api/story-upload-event-and-reservation-documents-through-the-api-plan.md`
  summary: Prevent pending document uploads from clearing newer dialog selections or sessions.
  evidence: Both original dialogs leave file/mode controls enabled and unconditionally close after asynchronous completion; changing file or cancel/reopen can lose newer pending selection.
  completed: 2026-11-15 on `fix/epic-3-small-items`; each open-to-close span of `AddDocDialog` and `AddReservationDocDialog` is a session, and an upload or pick that finishes after Cancel no longer closes or clears the reopened dialog (`closeSession`). Tests: "leaves a reopened dialog open when an upload from a cancelled session finishes" and "... when a pick from a cancelled session finishes" in `add-doc-dialog.test.tsx` and `add-reservation-doc-dialog.test.tsx` (fail without the fix).
- source_plan: `epic-documents-covers-api/story-upload-event-and-reservation-documents-through-the-api-plan.md`
  summary: Serialize document picking with an in-flight upload in both attachment dialogs.
  evidence: Existing mode controls and picker buttons remain enabled while upload runs, allowing two competing attachments before either completion closes dialog.
  completed: 2026-11-15 on `fix/epic-3-small-items`; the picker buttons and Attach were already disabled while a write runs. Now the file chooser, the hidden file input and both mode switches are too, and a file change that slips through is dropped. Tests: "locks the file chooser and mode switch while an upload is in flight" plus the mode-switch assertion in the pick test, in both dialog test files (fail without the fix).
- source_plan: `epic-documents-covers-api/story-upload-event-and-reservation-documents-through-the-api-plan.md`
  summary: Coordinate reservation deletion and document upload to avoid orphaned storage.
  evidence: Existing deleteReservation enumerates attached files before deleting reservation without shared trip lock; a concurrent upload may insert after enumeration and cascade-delete its row without file cleanup.
  completed: 2026-11-12 by story 3.4 (`plan-3-4-document-scope-integrity.md`): `deleteReservation` locks the trip and queues attached files, and `uploadDocument` takes the same trip lock and rechecks the target's trip inside the transaction (`services/documents.ts:72–77`), so an upload either lands before the delete or is refused as not found. Reconciled 2026-11-14 in the epic 3 retrospective.

- source_plan: `_bmad-output/initiative-mobile-api/epic-documents-covers-api/story-rename-and-remove-documents-through-the-api-plan.md`
  summary: A retried upload carrying a client document id re-inserts a document the user deleted in between.
  evidence: `uploadDocument` inserts when no row exists for `draft.id` and `removeDocument` leaves no tombstone; severity unverified (medium if real). Check how events handle create-after-delete and decide whether documents need a tombstone or the retry window already covers it.
  completed: 2026-11-14 on `fix/document-retry-after-delete`; reproduced on the production stack (upload with an id, delete, retry: 200, one row, one file; nothing orphaned) and accepted rather than fixed. Events create the same way, a tombstone would need schema work epic 3 excluded and would have to cover every client-UUID create, and the reappeared document is visible and deletable. Recorded in `adr-client-uuids-are-locked-before-the-trip-lock.md` ("Document ids"); pinned by the `api.feature` scenario "A retry sent after the document was deleted creates it again under the same id" and a `documents.test.ts` case.
  reopened: 2026-11-16 on `fix/api-write-safety` (user's call, for the mobile offline queue); deleting a document writes a `deleted:document:<id>` record in `idempotency_keys`, and an upload reusing that id within 24 hours is a 409 that stores nothing; the web uploaders drop their id on a 409. No migration; the retention sweep removes the records. Documents only; other client-UUID creates still create again. ADR section "Deleted document ids". Tests: `deletion-records.test.ts`, `documents.test.ts`, the three uploader component tests, and the `api.feature` scenario renamed "A retry sent after the document was deleted conflicts instead of bringing it back".

- source_plan: `epic-documents-covers-api/story-attach-and-promote-documents-through-the-api-plan.md`
  summary: Validate retained ancestry for legacy documents whose event and reservation belong to different trips.
  evidence: Pre-existing documentTripId uses event-first fallback while mapper uses reservation precedence; a corrupt mixed-trip dual-linked row can authorize through the wrong retained scope. Medium; distinct-trip ancestry regression should settle handling.
  completed: 2026-11-12 on `story/3-4-attach-and-promote-documents-through-the-api` via `plan-3-4-document-scope-integrity.md`; one shared ancestry resolver (`src/lib/document-ancestry.ts`) now backs rename, attach, promote and delete, and mixed or missing ancestry is a 404. Evidence: `document-ancestry.test.ts`, `documents.test.ts` and the API scenarios "Mixed-trip document ancestry is concealed..." and "...blocks attaching and promoting".

- source_plan: `epic-documents-covers-api/story-attach-and-promote-documents-through-the-api-plan.md`
  summary: Coordinate reservation deletion with document scope writes to avoid deleting a promoted document's file.
  evidence: Pre-existing deleteReservation reads attached document URLs and deletes storage without trip lock; old and new promotion can interleave after URL selection but before reservation removal. High; deletion must recheck ownership under shared lock/transaction and use queued file cleanup.
  completed: 2026-11-12 on `story/3-4-attach-and-promote-documents-through-the-api` via `plan-3-4-document-scope-integrity.md`; `deleteReservation` locks the trip, rechecks the role and reservation, queues attached files in its transaction and cleans up only after the commit; the storage route serves a promoted document after its reservation is gone. Evidence: `reservations/actions.test.ts`, `trip-resolution.test.ts` and both reservations race scenarios (promotion first, deletion first).

- source_plan: `_bmad-output/initiative-mobile-api/plan-3-4-document-scope-integrity.md`
  summary: Harden the `event-document` branch of `resolveOwningTripId` with the same single-row and ancestry validation the reservation branch now has.
  evidence: Pre-existing; `src/lib/storage/trip-resolution.ts` still takes the first `documents` row for the URL and trusts its `tripId` alone, so a corrupt or duplicated row names its trip unvalidated after the event is gone. Medium; a mixed-ancestry retained event-document row asserting the wrong trip should settle handling.
  completed: 2026-11-14 on `chore/epic-3-deferred-cleanup`; the `event-document` branch now needs exactly one row for the URL and validates its links with `resolveDocumentTripId`, as the reservation branch does. Tests: `trip-resolution.test.ts` ("an event document whose event is gone").

- source_plan: `_bmad-output/initiative-mobile-api/epic-documents-covers-api/story-select-and-remove-a-cover-through-the-api-plan.md`
  summary: Bound and normalize `coverPhotographer` (max length, reject empty string) in the cover PUT contract.
  evidence: Columns are unbounded text; direct API callers can persist "" or huge names. The removed server action had the same laxness.
  completed: 2026-11-14 on `chore/epic-3-deferred-cleanup`; the cover PUT trims `coverPhotographer`, rejects an empty name and caps it at `MAX_COVER_PHOTOGRAPHER_LENGTH` (200). Test: `contract/covers.test.ts`.
- source_plan: `_bmad-output/initiative-mobile-api/epic-documents-covers-api/story-select-and-remove-a-cover-through-the-api-plan.md`
  summary: Uploaded cover files whose follow-up PUT fails or is abandoned are never cleaned up.
  evidence: Upload stays a server action until entry 6; selection/removal now queue deletions for replaced own covers, uploads do not.
  completed: 2026-11-12 by story 3.6: upload is one atomic POST that sets the cover, queues the replaced file and discards its own file when no trip row points at it (`services/covers.ts:110–146`), so there is no separate PUT to fail or abandon. Reconciled 2026-11-14 in the epic 3 retrospective.

- source_plan: epic-documents-covers-api/story-search-cover-images-and-destinations-through-get-endpoints-plan.md
  summary: Let cover photos load when destination lookup exhausts its Mapbox budget.
  evidence: Pre-existing picker awaits destination lookup before Unsplash; old action and new service both throw Mapbox budget errors outside lookup catch.
  completed: 2026-11-14 on `chore/epic-3-deferred-cleanup`; the picker treats a failed destination lookup as "no map tile" and still loads the photos. The API keeps answering the budget error (429), so callers still see it. Test: `cover-image-picker-search-tab.test.tsx`.
- source_plan: epic-documents-covers-api/story-search-cover-images-and-destinations-through-get-endpoints-plan.md
  summary: Verify whether malformed Mapbox geometry or Unsplash response fields require runtime validation.
  evidence: Unverified medium impact; old action and extracted service both trust provider interfaces. Capture a malformed provider response to settle reachability before adding guards.
  completed: 2026-11-16 on `fix/api-write-safety`, without a captured response (user's call). `cover-search.ts` parses provider data with Zod: an Unsplash result is kept only when the cover PUT would accept it (non-empty id, http(s) image and profile URLs, a trimmed photographer of 1 to 200 characters), the rest are dropped and counted in a `console.warn`, and a body without a `results` array throws; Mapbox coordinates must be two finite numbers within longitude and latitude range, or the lookup resolves null. Tests: `cover-search.test.ts`.
- source_plan: epic-documents-covers-api/story-search-cover-images-and-destinations-through-get-endpoints-plan.md
  summary: Escape special characters in offline Unsplash SVG fixture text.
  evidence: Existing stub interpolates destination query into SVG text; XML-sensitive characters can create invalid fixture images.
  completed: 2026-11-15 on `fix/epic-3-small-items`; `buildE2EUnsplashStub` escapes `& < > " '` in the query text (`cover-search.ts`). Test: `cover-search.test.ts` "escapes XML-sensitive characters from the query in the stub image" (fails without the fix).
- source_plan: epic-documents-covers-api/story-search-cover-images-and-destinations-through-get-endpoints-plan.md
  summary: Add hostile-page browser evidence for cross-origin search-budget rejection.
  evidence: Current API cases supply headers directly; guard and service tests separately prove budget order, while picker covers real browser success.
  completed: 2026-11-15 on `fix/epic-3-small-items`; `api.feature` "A same-site page on another port cannot search with my session". A real loopback page on another localhost port fires `no-cors` cover and destination searches that carry the session cookie, and each returns 403, not 401. The user's own searches still return 200. Disabling the GET guard turns all three into 200, so the scenario catches the regression. It must be a real server: Chromium blocks loopback requests from a `page.route`-fulfilled page, which would make the check vacuous. Budget order itself stays proven by `route.test.ts` ("rejects ... cross-origin ... reads before search"). E2E cannot exhaust the Unsplash budget because its stub returns before `assertWithinRateLimit`.

- source_plan: `_bmad-output/initiative-mobile-api/epic-documents-covers-api/story-verify-documents-and-covers-end-to-end-plan.md`
  summary: Route the remaining anonymous API steps in `tests/e2e/steps/api.steps.ts` (event patch, lifecycle create, `audience` meta, other raw `page.request.*`) through the shared cookie-free client and retire the duplicate `anonymousApiRequests` helper.
  evidence: Story 3.10 found that `clearCookies()` leaves an open page free to set its session cookie again, returning 200 instead of 401; only the checklist write and the document and cover steps were moved, so the same flake can recur in the untouched anonymous examples.
  completed: 2026-11-14 on `chore/epic-3-deferred-cleanup`; every request in `api.steps.ts` goes through `apiClient()` from `anonymous-api.ts`, the duplicate `anonymousApiRequests` helper is gone and the metadata step marks the page anonymous. Evidence: `@feat:api` and `@feat:event-docs` 499 passed.

- source_plan: none
  summary: Intermittent failure of `trip-notes` "Leaving the Notes tab while a note is open still saves the edit" at the step `I expand the note titled "Packing"`.
  evidence: 2026-11-14 on `chore/epic-3-deferred-cleanup` the scenario failed in the affected run and again in an isolated re-run (`expect(locator).toBeVisible()` timed out at 5000 ms for the expanded Packing note), then passed in two later isolated runs, one on the branch and one on base `b25eef8a`. The branch touches neither notes nor the timeline. No cause established; two `documents` viewer scenarios also failed once under full-affected load and passed alone. Later the same day a second run failed `trip-notes` "A collapsed note still exposes its delete action" (dialog not visible) and `trip-cover-overflow` "User searches cover images through GET, selects a cover and views attribution info" (30 s wait for the cover PUT); both passed when re-run alone. The failing `trip-notes` scenario differs between runs, which points at load-sensitive timing in that feature rather than one broken step.
  completed: 2026-11-17 on `fix/e2e-flakes`, not reproduced since E2E moved to the production build (`next start`). Every recorded failure was on `next dev`. On the production build: `@feat:trip-notes` `--repeat-each=4` (6 workers, 80 of 81 passed; the one failure was the `page.reload` abort entry below, a different scenario and step) and `trip-notes` + `documents` + `day-planning` `--repeat-each=3` (208 of 208), about 140 `trip-notes` executions with no expand or delete-dialog failure. No code change. The failures fit a page reloaded under the step by Next's fallback navigation after a failed RSC refresh, which on-demand compiling under load makes likely, but that is not proven. Reopen with a trace (`--trace retain-on-failure`) if it recurs.

- source_plan: none
  summary: Load-sensitive E2E failures on `fix/document-retry-after-delete` (PR #521): `page.goto` aborts under the full suite and the `afterEach` cleanup timing out after the 25 MiB scoped-document scenario. Cause unproven.
  evidence: Three full-suite runs on the branch (2026-11-15). Run 1: four `page.goto` `net::ERR_ABORTED` timeouts (two `api` checklist replay scenarios, `trips` transit mode, `viewer-trip-access`). Runs 2 and 3: "A scoped document exactly at the 25 MiB limit is stored once" failed in the `afterEach` hook timeout, Example #1 in one run and Example #2 in the other; the assertions had already passed. The hook is one cascading trip delete in `cleanup()` (`tests/e2e/scenario-fixture.ts`). Isolated re-run with `PLAYWRIGHT_WORKERS=1 node scripts/run-e2e.mjs --server=kill "--grep=exactly at the 25 MiB limit"`: both scoped examples (3.8 s, 4.0 s) and the trip-document variant (11.2 s) passed, hooks included. One passing isolated run shows the cleanup is not broken in isolation; it does not show why it times out under the default three-worker load. Not established: whether the cascade delete waits on locks held by other workers, or the dev server is saturated by the 25 MiB bodies. Next step if it recurs: log `cleanup()` duration per scenario and check `pg_stat_activity` for blocked deletes during a full run.
  completed: 2026-11-15 on `fix/e2e-storage-not-indexed` for the 25 MiB `afterEach` timeout; the `page.goto` aborts stay open. Cause: Windows Search indexes the repo, `.e2e-storage` included. It picks up the fresh 25 MiB `.pdf` and holds it open without delete sharing, so the document `After` hook's `rm` sat in one `unlink` for 34-90 s while another process could still read and write the file. The cascade delete and Postgres were not involved. Evidence: per-syscall trace of the hook over 3-worker `--repeat-each` runs. Indexed root: 4 of 105 unlinks over 10 s (34 s, 50 s, 90 s, 90 s). Root marked not content indexed: 0 of 120 over 10 ms. Fix: `resetE2EStorage` marks the storage roots not content indexed on Windows; uploads inherit the mark (`scripts/e2e-storage.mjs`). Tests: `scripts/e2e-storage.test.mjs`.

- source_plan: none
  summary: Intermittent failure of `password-reset` "A password change waiting for the account lock cannot overwrite a reset" (`Server action POST to http://localhost:3001/profile failed with status 303`).
  evidence: 2026-11-16 on `test/e2e-production-server`, once in a full 6-worker run; passed in two isolated runs. The step locks the global `app_state` row and then completes the reset as soon as any backend is blocked on its lock. Unrelated parallel scenarios also queue on `app_state`, so the poll can fire before the member's password action arrives; the reset then commits first and the action redirects to sign-in (303) instead of answering "Session expired". Needs a way to tell the member's action apart from other waiters (for example an E2E-only lock gate in the action), not a longer timeout.
  completed: 2026-11-17 on `fix/e2e-flakes`. Each race step now waits for the member's own writer instead of any waiter. The password change, global sign-out and device removal lock only the member's `users` row (`lockCurrentSecurityVersion`), so `waitForQueuedUserRow` matches a backend blocked by the step that holds a tuple lock on `users`; app_state waiters never hold one. Self-deletion takes `lockAppAndUsersForUpdate`, which in E2E mode now names its connection `arrivo-account-lock:<id>` for the transaction (`accountLockMarker`, `account-lifecycle-locks.ts`), and `waitForQueuedAccountLock` matches that name while it waits on any lock: queued behind other app_state waiters, `pg_blocking_pids` names the waiter ahead rather than the step. Tests: `account-lifecycle-locks.test.ts`; the affected run (six account features) passed 75/75.
- source_plan: none
  summary: `page.reload` can abort with `net::ERR_ABORTED; maybe frame was detached?` when a `router.refresh()` is still in flight; seen in `trip-notes` "Dragging a note through its Reorder handle persists the new order after reload". Likely the same class as the open `page.goto` aborts above.
  evidence: 2026-11-17 on `fix/e2e-flakes`, 1 of 81 in a `trip-notes` `--repeat-each=4` run on the production build. Trace: the reorder PUT finished (the step waits for it), three trip-page RSC refreshes (`next-router-state-tree`) were still open, then the reload issued two document requests 4 ms apart and both aborted. Reading: the reload cancels the in-flight refresh, Next's router falls back to a full navigation of the same URL, and that navigation replaces Playwright's reload. Not confirmed from Next's source or a console line (the trace captured none). 84 `page.reload(` call sites in `tests/e2e`. Candidate fix: one reload helper that waits for in-flight RSC requests to settle first, or treats an abort followed by a load of the same URL as the reload.
  completed: 2026-11-17 on `fix/e2e-reload-abort`. Confirmed from Next 16.2.4's source: `fetchServerResponse` (`fetch-server-response.js`) catches a failed RSC fetch and returns the URL for a hard navigation ("Falling back to browser navigation"); the `isPageUnloading` flag only silences the log. Every step now reloads through `reloadPage(page)` (`tests/e2e/page-reload.ts`), which reloads again on `net::ERR_ABORTED` (up to 3 attempts), since the fallback is itself a full load of the same URL. All 87 call sites moved; an ESLint `no-restricted-syntax` rule blocks bare `.reload(` in `tests/e2e`. Full affected run 1098 of 1098. The `page.goto` aborts above are not covered.
- source_plan: none (follow-up to L104 on `fix/api-write-safety`)
  summary: Extend deletion records to every client-id create, so a retried create sent after a delete cannot bring the row back.
  evidence: After L104 only documents were covered; events, days, checklists, checklist items, day notes and trip notes still created again under a deleted id, which the mobile offline queue would hit.
  completed: 2026-11-16 on `fix/deletion-records`. Every service delete of those resources writes `deleted:<resource>:<id>`, the trip date change records the events and days it removes, and each create whose id names no row refuses a recent record with a 409 and a per-resource message (`refuseRecentlyDeleted`, `deletion-records.ts`). Cascaded children are not recorded: re-creating one needs its deleted parent (404). Add-day drops its retained id after a successful day removal. Tests: `deletion-records.test.ts`, the five service tests, `trips/actions.test.ts`, `use-trip-detail-handlers.test.tsx`, and the `api.feature` outline "A <resource> create retried after the delete conflicts instead of bringing it back" (six examples).

- source_plan: `epic-sharing-api/story-invite-one-contributor-through-the-api-plan.md`
  summary: Recheck submitted normalized invitation username after acquiring account lock.
  evidence: Pre-existing invite action and migrated service resolve account ID before locking; concurrent profile rename can change username ownership before mutation.
  completed: 2026-11-18 on `fix/epic-4-retrospective`. The service rechecks both resolved account ID and normalized username under the account lock, after replay handling; a mismatch returns no-account without effects. Tests: `services/sharing.test.ts`.
- source_plan: `epic-sharing-api/story-invite-one-contributor-through-the-api-plan.md`
  summary: Replace caught unique-violation recovery inside invitation transaction with conflict-safe insertion.
  evidence: Pre-existing writer catches PostgreSQL unique violation inside transaction; database marks transaction aborted, so later statements cannot persist a typed replay result. Cooperating writers serialize through existing account and trip locks.
- source_plan: `epic-sharing-api/story-apply-contributor-changes-through-the-api-plan.md`
  summary: Move deletion-concurrency contributor-change fixtures from the unused `saveContributorChangesWrite` wrapper onto the service/PATCH path.
  evidence: Production batches now run lock, locked role recheck and idempotency read/upsert in `services/sharing.ts`; `deletion-concurrency.steps.ts:161-191` still calls the outer writer, so real-lock interleavings with account deletion are verified only for a path production no longer uses (same as 4.1 `inviteContributorWrite`).
  completed: 2026-11-18 on `fix/epic-4-retrospective`. Authenticated PATCH races now cover removal, role changes, creator protection, manager removal or demotion, manager deletion and trip deletion. Public scenario-owned rows and PostgreSQL blocker PID observations establish ordering. The complete deletion-concurrency feature passed.
- source_plan: `epic-sharing-api/story-accept-and-decline-invitations-through-the-api-plan.md`
  summary: Make the invitation-accept collaborator upsert preserve an existing member's role and `isCreator`.
  evidence: `acceptInvitationInTransaction` (as the baseline writer did) uses `onConflictDoUpdate` with `set: collaboratorValues`, so accepting a pending invitation when the invitee is already a collaborator overwrites role and sets `isCreator: false`; reachable only if membership was created after the invite.
  completed: 2026-11-18 on `fix/epic-4-retrospective`. Acceptance inserts only when the membership does not exist, preserving existing role and creator flag. Tests: `membership-writes.test.ts` and the API scenario accepting an invitation after creator-manager membership is seeded.
- source_plan: `epic-sharing-api/story-accept-and-decline-invitations-through-the-api-plan.md`
  summary: Move deletion-concurrency accept fixtures from the unused `acceptInvitationWrite` wrapper onto the service/POST path.
  evidence: Production accept now runs lock, recheck and idempotency in `services/sharing.ts`; `deletion-concurrency.steps.ts` still calls the outer writer, so its real-lock interleavings cover a path production no longer uses (same as 4.1/4.2).
  completed: 2026-11-18 on `fix/epic-4-retrospective`. Authenticated POST races cover both invitee-deletion orders and owner deletion against a held membership insert, with scenario-owned rows and observed PostgreSQL blockers. The complete deletion-concurrency feature passed.

- source_plan: `epic-trips-packing-api/story-pack-and-edit-a-packing-item-through-the-api-plan.md`
  summary: Increase existing packing list overview controls to the required interactive target size.
  evidence: The extracted overview retains pre-existing 32px icon buttons and 36px create and cancel controls.
  completed: 2026-11-19 on `story/5-1-packing-item-api`. Packing list overview controls now meet the 44px minimum.
- source_plan: `epic-trips-packing-api/story-pack-and-edit-a-packing-item-through-the-api-plan.md`
  summary: Investigate whether a refresh transition can remain unresolved and block the shared refresh queue.
  evidence: Unverified; demonstrate a reachable transition that never settles or unmounts before adding recovery.

- source_plan: `epic-trips-packing-api/story-add-packing-items-and-sections-through-the-api-plan.md`
  summary: Investigate whether deleted packing UUIDs need tombstones to prevent delayed creation retries from recreating deleted sections or items.
  evidence: Unverified medium risk; establish the intended retry window and whether existing deletion and idempotency conventions already prevent recreation.
  completed: 2026-11-21 on `fix/epic-5-cover-and-packing-retries`; already covered by story 5.3: deleting an item, section (with its children) or list records the id (`recordDeletions`) and a create under that id returns 409 for 24 hours (`packing.test.ts`). Browser-level evidence already exists: the `api.feature` outline "A <resource> create retried after the delete conflicts instead of bringing it back" has packing item and section rows. Nothing was missing.

- source_plan: `_bmad-output/initiative-mobile-api/epic-trips-packing-api/story-create-and-list-trips-through-the-api-plan.md`
  summary: Tighten the create-trip e2e "wrote nothing new" step so a 422 asserts zero rows for the id.
  evidence: Step accepts one same-name row, so a committed-then-422 regression would pass (verification-gap lens).
  completed: 2026-11-21 on `fix/epic-5-deferred-cleanup`; new step "the create trip API created no trip" asserts zero rows for the 422 scenarios (`api.feature`, `api-create-trip.steps.ts`).
- source_plan: `_bmad-output/initiative-mobile-api/epic-trips-packing-api/story-create-and-list-trips-through-the-api-plan.md`
  summary: Trip cover generation needs a fetch timeout, orphaned-tile cleanup and a guarded cover update.
  evidence: Mapbox fetch has no abort; tile stays in storage if the cover save fails; update ignores a newer cover. All pre-existing from the old action.
  completed: 2026-11-21 on `fix/epic-5-deferred-cleanup`; a failed cover save removes the stored tile (`trips.test.ts` "removes the stored map tile when the cover save fails"); the Mapbox tile fetch aborts after `MAP_TILE_TIMEOUT_MS` (5s, `trip-cover-generation.test.ts`); the cover update only fills an empty cover and discards an unused own tile (`trips.test.ts` "keeps a cover chosen while generation ran...").
- source_plan: `_bmad-output/initiative-mobile-api/epic-trips-packing-api/story-create-and-list-trips-through-the-api-plan.md`
  summary: Unsupported stored account currency makes every create 422 on a field the client never sent.
  evidence: `resolveBudgetCurrency` throws for the account default; behavior carried over from the old action.

- source_plan: story-delete-a-trip-through-the-api-plan.md
  summary: Prevent deletion notifications from reaching a newly created trip that reuses the deleted trip ID.
  evidence: The previous action and current service publish after the deleting transaction commits, allowing UUID reuse before publication.
- source_plan: story-delete-a-trip-through-the-api-plan.md
  summary: Clean up owned trip cover files when deleting a trip.
  evidence: The previous delete action removed document files but did not remove stored trip covers.
  completed: 2026-11-21 on `fix/epic-5-deferred-cleanup`; `deleteTrip` queues the trip's own stored cover with its document files (`isOwnTripCoverFile`, `url-policy.ts`). Tests: `trips.test.ts` (own file, photo, another trip's file, no cover), `url-policy.test.ts`.

- source_plan: plan-dismiss-trip-deletion-dialog.md
  summary: Exercise trip deletion with a controllably slow storage adapter in an integration test.
  evidence: Service tests verify deferred scheduling, but the browser scenarios do not hold real file cleanup open.
  completed: 2026-11-21 on `fix/epic-5-deferred-cleanup`; `trips.test.ts` "answers the deletion while storage cleanup is still held open" holds the cleanup promise open and shows the 204 does not wait on it. Service-level, not browser.

- source_plan: `_bmad-output/initiative-mobile-api/epic-trips-packing-api/story-verify-trips-and-packing-api-end-to-end-plan.md`
  summary: packing-tab scenario "New sections appear above existing sections and stay there after reload" timed out once under full 11-feature load on the step "I add a packing label named" (`getByPlaceholder('New section…')` never appeared on the second add).
  evidence: 735 of 736 passed in the combined production-build run; the same feature passed 25/25 twice in isolation. Likely the List options menu click racing a re-render after the first label POST; unreproduced, so unverified.

- source_plan: `_bmad-output/initiative-mobile-api/epic-trips-packing-api/epic-trips-packing-api-retrospective.md`
  summary: F8: Trip-create replay compares editable fields, so a retry after a collaborator's edit gets 409 instead of the trip.
  evidence: `isSameTrip` (`src/lib/services/trips.ts`) compares name, dates, tags and similar fields; packing list create compares name the same way. A fix needs a stored creation fingerprint; the scenario "Reusing a trip UUID for another name conflicts" relies on the field comparison, and no mobile outbox exists yet.

- source_plan: `_bmad-output/initiative-mobile-api/epic-trips-packing-api/epic-trips-packing-api-retrospective.md`
  summary: F9: A trip PATCH whose dates equal the stored dates still renumbers days and changes `updatedAt`, the live event and the ETag; `resolution`/`confirmation` without a date change is silently ignored.
  evidence: `updateTrip` date branch (`src/lib/services/trips.ts`). Skip the date path when the effective range is unchanged.

- source_plan: `_bmad-output/initiative-mobile-api/epic-trips-packing-api/epic-trips-packing-api-retrospective.md`
  summary: F12: Cover generation is awaited in the create response with no timeout, can orphan the tile, and is skipped by trip delete.
  evidence: Already tracked by the 5.9 and 5.10 entries above; listed so the epic 5 retrospective's deferral points here.

- source_plan: `_bmad-output/initiative-mobile-api/epic-trips-packing-api/epic-trips-packing-api-retrospective.md`
  summary: F13: Pull-templates is unbounded: `templateIds` has no max, inserts run per item under the trip lock, and lists can grow past the 1000-item reorder cap.
  evidence: `src/lib/api/contract/packing.ts` (pull-templates and order schemas). Add a `.max()` that matches downstream caps, and refuse a pull that would push a list over 1000 rows.

- source_plan: `_bmad-output/initiative-mobile-api/epic-trips-packing-api/epic-trips-packing-api-retrospective.md`
  summary: F14: Pull-templates compares section and item names in one namespace, so a template section matching a plain item is skipped and its children land ungrouped.
  evidence: `pullTemplates` name matching in `src/lib/services/packing.ts`. Plausible, not reproduced.

- source_plan: `_bmad-output/initiative-mobile-api/epic-trips-packing-api/epic-trips-packing-api-retrospective.md`
  summary: F15: Currency conversion runs its FX lookup inside the trip lock; `convertCurrency` without `budgetCurrency` is silently ignored.
  evidence: `updateTrip` calls `recalculateAll` under `lockTrip` (`src/lib/services/trips.ts`). Fetch rates before taking the lock.

- source_plan: `_bmad-output/initiative-mobile-api/epic-trips-packing-api/epic-trips-packing-api-retrospective.md`
  summary: F16: Packing reorder and delete use separate client queues, so a reorder can race a just-sent delete and roll back on a spurious 409.
  evidence: `use-packing-handlers.ts` reorder queue vs delete handler. Plausible, not reproduced.

- source_plan: `_bmad-output/initiative-mobile-api/epic-trips-packing-api/epic-trips-packing-api-retrospective.md`
  summary: F17: The trip snapshot ETag is cache-only; PATCH and DELETE ignore `If-Match`, and `docs/api-v1.md` does not say so.
  evidence: Document cache-only, last-write-wins semantics, or add `If-Match` support when the mobile client needs it.

- source_plan: `_bmad-output/initiative-mobile-api/epic-trips-packing-api/epic-trips-packing-api-retrospective.md`
  summary: F19: Minor items: a stale `packing-actions.ts` comment in `src/lib/api/idempotency.ts`; the `deleted` flag in `deleteTrip`'s authorize is not reset per call (theoretical); the refresh queue can stall on a never-settling transition (already deferred under 5.1).
  evidence: Clean up when next touching those files.

- source_plan: `_bmad-output/initiative-mobile-api/epic-trips-packing-api/epic-trips-packing-api-retrospective.md`
  summary: AV1: Services import route-folder code: `src/lib/services/trips.ts` and `trip-date-change.ts` import `@/app/(app)/trips/create-trip-days` and `date-sync`.
  evidence: First `src/lib` to `src/app` imports, introduced in epic 5. Move both modules under `src/lib/` and add an ESLint `no-restricted-imports` rule blocking `@/app/**` from `src/lib/**`.

- source_plan: `_bmad-output/initiative-mobile-api/epic-trips-packing-api/epic-trips-packing-api-retrospective.md`
  summary: AV2: `tests/e2e/steps/api.steps.ts` is about 4,600 lines (+817 in epic 5); packing API steps went into the shared file.
  evidence: Split packing and trip steps into `api-<domain>.steps.ts` files, and adopt one steps file per migrated domain.

- source_plan: `_bmad-output/initiative-mobile-api/epic-packing-templates-api/story-save-the-selected-packing-list-as-a-template-plan.md`
  summary: PR #568 review bot fails "Tests: Source files changed without matching tests" on `src/lib/api/idempotency.ts`, which only had a comment reworded.
  evidence: The comment still described the deleted `saveTripListAsTemplate` raw-key path; the edit has no runtime change, so no test applies. Accepted as-is for #568. Fix later by either reverting the wording or teaching `scripts/pr-review` to ignore comment-only source edits.
  disposition: 2026-11-22 — still open. `scripts/pr-review/review.mjs` passes parsed files to `checkTests`; `scripts/pr-review/review.test.mjs` tests source-without-test failure, with no comment-only exception. Follow up in the review tool with comment-aware classification and regression tests; no runtime test is warranted for the original comment.

- source_plan: `epic-packing-templates-api/story-open-rename-and-delete-owned-templates-plan.md`
  summary: Verify whether existing templates have null creation timestamps and handle keyed replay for those records.
  evidence: The schema permits null, while lifecycle replay validation fails closed for null timestamps; deployed data is needed to establish impact.
  disposition: 2026-11-22 — still open. `packingTemplates.createdAt` defaults to now but is nullable in `src/db/schema.ts`; create, save-list, and rename replay validators in `src/lib/services/packing-templates.ts` reject null or mismatched timestamps. No deployed data was inspected. Count nulls in each deployment, then design and test a backfill or stable identity scheme that preserves deleted/recreated resource protection before changing replay behavior.
- source_plan: `epic-packing-templates-api/story-open-rename-and-delete-owned-templates-plan.md`
  summary: Handle editor title rename promise rejections in the template editor.
  evidence: Existing title commit is invoked without awaiting or catching failures from its rename callback.
  disposition: 2026-11-22 — fixed in this sweep. `commitTitleEdit` catches the callback rejection; `useApiMutation` retains responsibility for error notification. `template-editor-view.test.tsx` exercises Enter and blur failures and successful rename; both rejection cases produced unhandled errors before the fix and pass afterward.

- source_plan: `_bmad-output/initiative-mobile-api/epic-packing-templates-api/story-edit-template-items-and-sections-plan.md`
  summary: Template item create accepts a before/after anchor in a different section than the supplied `labelId`.
  evidence: Flat position places the item inside the anchor's block while `labelId` points elsewhere; the old server action had the same flaw.
  disposition: 2026-11-22 — confirmed, contract decision outstanding. `createPackingTemplateItem` validates the label and anchor independently against the template, then inserts at the anchor position with the supplied `labelId`. `groupPackingItems` displays the item under that label regardless of its flat position. Decide and document cross-section anchor semantics with API clients before changing accepted inputs or placement; add API regression coverage for the chosen behavior.

- source_plan: `epic-packing-templates-api/story-reorder-template-items-across-sections-plan.md`
  summary: Investigate how the template editor displays noncanonical section ordering accepted by the order API.
  evidence: Unverified whether interleaved API order creates a visible mismatch; compare a persisted interleaved order with the grouped editor rendering.
  disposition: 2026-11-22 — mismatch confirmed by code trace, contract decision outstanding. Reorder validates membership and section references, then stores positions in request order. For positions `A label, B label, A child, B child`, `groupPackingItems` sorts labels and their children separately by position; `PackingListSortable` renders `A label, A child, B label, B child`, then ungrouped items. Thus flat API order differs from grouped display even after reload; membership remains correct. Decide whether to document this representation or introduce compatible canonicalization, and add persisted API-to-editor coverage before changing semantics.
- source_plan: `epic-packing-templates-api/story-reorder-template-items-across-sections-plan.md`
  summary: Measure reorder transaction limits for unusually large packing templates.
  evidence: The service updates changed items individually under a transaction deadline; a representative large-template test would establish the practical limit.
  disposition: 2026-11-22 — limit remains unmeasured. The order contract has no array size cap, and `reorderPackingTemplateItems` awaits one update per changed row inside `guardTransactionDeadline`. One local timing would not establish a supported limit across DB latency, load, deadline, and deployment configurations. Follow up with a reproducible real-Postgres benchmark across representative item counts and deployment latencies, then set an explicit supported bound or batch updates with compatibility tests; do not infer a limit from a single run.

Follow-up evidence, 2026-11-22 (`plan-template-api-follow-ups.md`):

- Replay timestamp: deployment counts remain unknown; no deployment was queried. On each deployment, an authorized operator can run the read-only `SELECT count(*) FROM packing_templates WHERE created_at IS NULL`. Null current or recorded timestamps fail closed for create, save-list and rename replay. If any exist, assess affected replay records and design a stable incarnation identity or verified backfill before changing behavior; preserving protection against deleted/recreated IDs is required.
- Cross-section anchors: existing behavior is retained. The API places an item relative to a same-template anchor in flat order while its requested `labelId` controls editor membership. Service coverage and the API reference record this contract.
- Interleaved reorder: the API persists requested flat positions; editor groups by membership and sorts within groups. Service, grouping and API-to-editor scenario cover this behavior; documentation now distinguishes the representations.
- Reorder measurements: on a newly migrated disposable local database, PostgreSQL 17.11 and Node 26.3.1, the real service completed three all-changed reorders at 100 items in 111.54/111.51/88.37 ms, 500 in 424.46/400.75/433.15 ms, 1,000 in 767.45/744.34/746.66 ms, and 2,000 in 1497.25/1573.12/1554.38 ms. All completed inside the 20 s deadline. A separate forced 1 s deadline at each size reached an AFTER UPDATE sleep trigger, failed closed, and verified the original positions after rollback; elapsed times including verification were 1016.41/1010.09/1010.03/1015.25 ms respectively. An earlier 1 ms run did not prove an update had occurred and is superseded by this test. The harness calls the actual service with Next cache revalidation mocked; it excludes HTTP and deployment latency. It creates and deletes only its own user, template and items; the disposable database was removed. To repeat, create and migrate a local database named `arrivo_benchmark_<suffix>`, set `BENCHMARK_DATABASE_URL` to its PostgreSQL URL, then run `node scripts/benchmark-template-reorder.mjs --confirm-disposable`. These local observations establish no universal limit. Repeat with representative latency and load before deciding on batching or a supported bound.
- Review bot: complete immutable base/head sources are compared using TypeScript parse trees and token text; missing or invalid versions fall back to test requirements. Secret scanning continues against the complete diff. Review-bot regression tests cover comment changes, code and literal changes, automatic semicolon insertion, types and unavailable versions.


