- source_plan: `_bmad-output/initiative-mobile-api/epic-checklist-api-pilot/story-make-api-replay-atomic-and-authorization-aware-plan.md`
  summary: Add a retention sweep for expired `idempotency_keys` rows.
  evidence: API replay rows (`api:v1:` namespace) are replaced on reuse but never purged, and legacy packing rows share the same unbounded growth; expiry only gates replay.

- source_plan: `_bmad-output/initiative-mobile-api/epic-checklist-api-pilot/story-move-checklist-creation-title-and-deletion-to-services-plan.md`
  summary: Migrate checklist create/title/delete UI callers to lifecycle APIs, add client 204 handling, and retire four migrated server actions.
  evidence: User requested splitting story 1.5 plan; backend endpoints can ship additively while existing UI actions remain operational. Follow-up completes story 1.5 using use-checklist-handlers and use-trip-detail-handlers with matching tests, client.test.ts/client.ts, actions.test.ts/actions.ts, day-planning.feature/steps, exact API waits, draft rejection on API/auth failure, title null clearing, first-item expansion, reload persistence, and feature-map updates. Use a new story branch from latest feature/api-v1 after backend merge; PR base feature/api-v1.
  completed: 2026-11-08 on `story/1-5-checklist-lifecycle-services` (user chose the current branch); UI callers migrated, four actions retired. Awaiting review and validation; story 1.5 not marked done.

- source_plan: `_bmad-output/initiative-mobile-api/epic-checklist-api-pilot/story-complete-checklist-lifecycle-ui-migration-plan.md`
  summary: Send a stable client UUID (and firstItem id) on checklist create so a retry after a lost response or a double submit cannot duplicate.
  evidence: `handleAddChecklist` sends no `id`, so the backend's id-based replay is unused. The id must survive retries of the same draft, which means a `use-day-draft` change. The retired action had the same gap. The failed-create E2E mocks the 500, so it cannot show a commit-then-fail retry.

- source_plan: `_bmad-output/initiative-mobile-api/epic-checklist-api-pilot/story-move-checklist-item-lifecycle-to-the-api-plan.md`
  summary: Send a stable client UUID on checklist item create so a retry after a lost response or a double submit cannot duplicate the item.
  evidence: `handleAddChecklistItem` sends no `id`, so the API's id-based replay is unused from the UI; the retired server action had the same gap. Needs a draft-stable id in the item input flow. Raised by blind-hunter and edge-case-hunter.

- source_plan: `_bmad-output/initiative-mobile-api/epic-checklist-api-pilot/story-move-packing-source-checklist-insertion-to-the-api-plan.md`
  summary: Double-clicking a packing-source picker row creates two checklists because each call mints a fresh client UUID and nothing guards an in-flight insert.
  evidence: Pre-existing (the retired server action had no in-flight guard); `useApiMutation` exposes `isPending` that a handler guard could use. Low severity.

- source_plan: `_bmad-output/initiative-mobile-api/epic-checklist-api-pilot/story-retire-checklist-actions-and-complete-api-regression-coverag-plan.md`
  summary: `src/app/(app)/trips/[tripId]/actions.ts` is listed under the `app-activity` FEATURE_MAP entry, which wins over its SHARED_GLOBS entry, so editing it runs only `@feat:app-activity` instead of the full suite.
  evidence: scripts/affected-e2e.mjs checks FEATURE_MAP before SHARED_GLOBS; the module still holds event, day, note and document actions that other features exercise. Pre-existing mapping, not caused by this change.

- source_plan: `_bmad-output/initiative-mobile-api/epic-itinerary-api/story-edit-one-event-through-the-api-plan.md`
  summary: A second quick event edit sends a stale full snapshot and can revert the first edit's field, because the handler sends all nine fields every time.
  evidence: Raised by blind-hunter and edge-case-hunter. The retired action also sent the full event; a fix is sending only changed fields (diff against the stored event).

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

- source_plan: `_bmad-output/initiative-mobile-api/epic-itinerary-api/story-harden-the-api-mutation-client-plan.md`
  summary: A write that times out client-side may still commit later and land after the next write on the same key.
  evidence: Aborting `fetch` does not stop the server. Needs server-side ordering or idempotency keys on PATCH; flagged by blind-hunter.

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
- source_plan: `_bmad-output/initiative-mobile-api/epic-itinerary-api/story-send-draft-stable-client-ids-for-checklist-creates-plan.md`
  summary: Editing the first-item text and committing again after an ambiguous failure reuses the draft ID and gets a 409 until the draft is cancelled.
  evidence: Content drift stays a 409 by the frozen boundary, and the hook keeps the ID after a rejection. A fix would mint a new ID on a conflict, which needs the handler to surface the status.

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
- source_plan: `epic-documents-covers-api/story-upload-event-and-reservation-documents-through-the-api-plan.md`
  summary: Prevent pending document uploads from clearing newer dialog selections or sessions.
  evidence: Both original dialogs leave file/mode controls enabled and unconditionally close after asynchronous completion; changing file or cancel/reopen can lose newer pending selection.
- source_plan: `epic-documents-covers-api/story-upload-event-and-reservation-documents-through-the-api-plan.md`
  summary: Serialize document picking with an in-flight upload in both attachment dialogs.
  evidence: Existing mode controls and picker buttons remain enabled while upload runs, allowing two competing attachments before either completion closes dialog.
- source_plan: `epic-documents-covers-api/story-upload-event-and-reservation-documents-through-the-api-plan.md`
  summary: Coordinate reservation deletion and document upload to avoid orphaned storage.
  evidence: Existing deleteReservation enumerates attached files before deleting reservation without shared trip lock; a concurrent upload may insert after enumeration and cascade-delete its row without file cleanup.

- source_plan: `_bmad-output/initiative-mobile-api/epic-documents-covers-api/story-rename-and-remove-documents-through-the-api-plan.md`
  summary: A retried upload carrying a client document id re-inserts a document the user deleted in between.
  evidence: `uploadDocument` inserts when no row exists for `draft.id` and `removeDocument` leaves no tombstone; severity unverified (medium if real). Check how events handle create-after-delete and decide whether documents need a tombstone or the retry window already covers it.

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

- source_plan: `_bmad-output/initiative-mobile-api/epic-documents-covers-api/story-select-and-remove-a-cover-through-the-api-plan.md`
  summary: Bound and normalize `coverPhotographer` (max length, reject empty string) in the cover PUT contract.
  evidence: Columns are unbounded text; direct API callers can persist "" or huge names. The removed server action had the same laxness.
- source_plan: `_bmad-output/initiative-mobile-api/epic-documents-covers-api/story-select-and-remove-a-cover-through-the-api-plan.md`
  summary: Uploaded cover files whose follow-up PUT fails or is abandoned are never cleaned up.
  evidence: Upload stays a server action until entry 6; selection/removal now queue deletions for replaced own covers, uploads do not.

- source_plan: epic-documents-covers-api/story-search-cover-images-and-destinations-through-get-endpoints-plan.md
  summary: Let cover photos load when destination lookup exhausts its Mapbox budget.
  evidence: Pre-existing picker awaits destination lookup before Unsplash; old action and new service both throw Mapbox budget errors outside lookup catch.
- source_plan: epic-documents-covers-api/story-search-cover-images-and-destinations-through-get-endpoints-plan.md
  summary: Verify whether malformed Mapbox geometry or Unsplash response fields require runtime validation.
  evidence: Unverified medium impact; old action and extracted service both trust provider interfaces. Capture a malformed provider response to settle reachability before adding guards.
- source_plan: epic-documents-covers-api/story-search-cover-images-and-destinations-through-get-endpoints-plan.md
  summary: Escape special characters in offline Unsplash SVG fixture text.
  evidence: Existing stub interpolates destination query into SVG text; XML-sensitive characters can create invalid fixture images.
- source_plan: epic-documents-covers-api/story-search-cover-images-and-destinations-through-get-endpoints-plan.md
  summary: Add hostile-page browser evidence for cross-origin search-budget rejection.
  evidence: Current API cases supply headers directly; guard and service tests separately prove budget order, while picker covers real browser success.
