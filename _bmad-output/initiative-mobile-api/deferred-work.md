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

- source_plan: `_bmad-output/initiative-mobile-api/epic-itinerary-api/story-edit-one-event-through-the-api-plan.md`
  summary: `useApiMutation` returns early when its hook has unmounted, so an edit queued behind another is discarded if the user navigates away.
  evidence: `use-api-mutation.ts:51`; shared by every pilot handler. Fix is to let queued requests run and skip only the refresh.

- source_plan: `_bmad-output/initiative-mobile-api/epic-itinerary-api/story-edit-one-event-through-the-api-plan.md`
  summary: A partial event PATCH can store `endAt` before `startAt`: only per-field format is validated.
  evidence: Pre-existing (the retired action and `updateEventSchema` had no ordering check). Needs a merged-state check in `services/events.ts` returning 422.

- source_plan: `_bmad-output/initiative-mobile-api/epic-itinerary-api/story-edit-one-event-through-the-api-plan.md`
  summary: No API reference documents `PATCH /api/v1/events/:eventId` or the pilot endpoints.
  evidence: Raised by blind-hunter; `docs/plans/mobile-api.md` is the plan, not a reference.

- source_plan: `_bmad-output/initiative-mobile-api/epic-itinerary-api/story-harden-the-api-mutation-client-plan.md`
  summary: A write that times out client-side may still commit later and land after the next write on the same key.
  evidence: Aborting `fetch` does not stop the server. Needs server-side ordering or idempotency keys on PATCH; flagged by blind-hunter.

- source_plan: `_bmad-output/initiative-mobile-api/epic-itinerary-api/story-harden-the-api-mutation-client-plan.md`
  summary: After a timeout the hook shows "Try again" and does not refresh, so the UI can stay stale after a write that committed.
  evidence: Same refresh-on-error choice as the story 2.1 entry; `use-api-mutation.test.tsx` asserts failures never refresh.

- source_plan: `_bmad-output/initiative-mobile-api/epic-itinerary-api/story-harden-the-api-mutation-client-plan.md`
  summary: `api()` rethrows a raw `SyntaxError` for a malformed 200 body instead of an `ApiClientError`.
  evidence: Pre-existing at `client.ts`; `client.test.ts` now documents it. Fix maps it to `ApiClientError(status, "server_error", ...)`.

- source_plan: `_bmad-output/initiative-mobile-api/epic-itinerary-api/story-send-draft-stable-client-ids-for-checklist-creates-plan.md`
  summary: A draft whose commit is still pending when the user cancels and opens another draft arms the new draft's baseline when the old commit resolves.
  evidence: Pre-existing in `use-day-draft` (the old baseline ref did the same); the old commit's growth can clear the new draft. Settle by tying the post-await writes to the draft ID captured at commit start.
- source_plan: `_bmad-output/initiative-mobile-api/epic-itinerary-api/story-send-draft-stable-client-ids-for-checklist-creates-plan.md`
  summary: Editing the first-item text and committing again after an ambiguous failure reuses the draft ID and gets a 409 until the draft is cancelled.
  evidence: Content drift stays a 409 by the frozen boundary, and the hook keeps the ID after a rejection. A fix would mint a new ID on a conflict, which needs the handler to surface the status.

- source_plan: `_bmad-output/initiative-mobile-api/epic-itinerary-api/story-extract-shared-timeline-positioning-and-reorder-days-through-plan.md`
  summary: Drags still waiting in a keyed `useApiMutation` queue are dropped if the component unmounts before they start, so the last rapid drag can fail to persist after immediate navigation.
  evidence: Pre-existing in `use-api-mutation.ts` (`run` returns early when `!mounted.current`); day drags now go through it instead of a server action that kept running. Settle by flushing queued writes on unmount or confirming a navigation guard exists.

- source_plan: `_bmad-output/initiative-mobile-api/epic-itinerary-api/story-create-and-delete-events-through-the-api-plan.md`
  summary: A crash between the delete commit and `removeStoredFiles` leaves the discarded files on disk, and no retry cleans them.
  evidence: Inherent in cleanup after commit; the old actions had the same window and no sweep exists. Settle with a periodic orphan-file sweep or an outbox.

- source_plan: `_bmad-output/initiative-mobile-api/epic-itinerary-api/story-create-and-delete-events-through-the-api-plan.md`
  summary: A kept document of a deleted event is found by exact `documents.url` equality with `/api/storage/<key>`, with no index, and an unresolvable key still surfaces as a bare 500.
  evidence: Only the local adapter exists today and the 500 is pre-existing in the storage route. Settle by storing the storage key on the row if another adapter lands.

- source_plan: `_bmad-output/initiative-mobile-api/epic-itinerary-api/story-create-and-delete-events-through-the-api-plan.md`
  summary: Editing the text of an event draft and committing again after an ambiguous failure reuses the draft ID and gets a 409 until cancelled.
  evidence: Same content-drift conflict deferred for checklists; frozen boundary. A fix would mint a new ID on a conflict, which needs the handler to surface the status.

- source_plan: `_bmad-output/initiative-mobile-api/epic-itinerary-api/story-create-and-delete-events-through-the-api-plan.md`
  summary: A direct (no-dialog) event delete discards documents attached by a collaborator since the last refresh.
  evidence: Pre-existing: the retired `deleteEvent` discarded them too. Settle by re-checking the document count server-side or always routing through the dialog.

- source_plan: `_bmad-output/initiative-mobile-api/epic-itinerary-api/story-create-and-delete-events-through-the-api-plan.md`
  summary: `createEventSchema` in `validation-schemas.ts` has no production caller now that the `createEvent` action is retired, and its `afterEventId` is a loose string.
  evidence: The plan forbids touching `validation-schemas.ts`. Delete it with its tests in a later story.
