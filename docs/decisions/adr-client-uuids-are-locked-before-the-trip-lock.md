# Client UUIDs are locked before the trip lock

Date: 2026-11-09. Status: accepted.

Checklist and checklist-item creates accept a client-generated UUID so a retry is safe, but a UUID is global while the trip lock is per trip, so two requests on different trips could both claim one ID. Each create therefore takes a transaction-scoped advisory lock per client UUID (`checklist:<id>`, `checklist-item:<id>`, sorted so concurrent claims always lock in one order) before it takes the trip row lock, and re-checks access afterwards. With an `Idempotency-Key` the order is actor/key lock, then client-ID locks, then trip lock; every write path keeps that order so no two paths can wait on each other. A UUID already used by an unreadable foreign row is concealed as not found, and any other reuse with different content is a 409. The reason is stated in the plans' review triage (cross-trip UUID concurrency); the plans do not record alternatives considered. Source: plan `story-move-checklist-creation-title-and-deletion-to-services-plan.md` (story 1.5), commit 5d95cbfc, and `lockClientIds` in `src/lib/services/checklists.ts`.

## Retry equality

Date: 2026-11-10. Status: accepted.

A create that reuses a client UUID is a replay, not a collision, when the stored row has the same trip, parent (for a checklist, the day) and content: title, item text, count, order and checked state. `position` is the one field excluded, because other inserts on the day shift it; a retry after such a shift returns the stored row at its current position with no shift, write or effects. Any other difference stays a 409 (`conflict`), since a changed field is user intent that a replay must not answer over. The UI sends one UUID per draft and reuses it on every retry (`use-day-draft`), which is why this rule is needed. The replay answers with the stored row, so its `position` can differ from the original response; the rule holds for source-based creates (packing list or template) as well. Checklist creates (`createChecklist`) implement it now; the later creates that gain client UUIDs (entries 5-8: event, note, day-note, trip-note) adopt the same rule. Source: plan `story-send-draft-stable-client-ids-for-checklist-creates-plan.md` (story 2.3).

## Document ids

Date: 2026-11-12. Status: accepted.

A document upload (`POST /api/v1/trips/:tripId/documents`, multipart) accepts a client-generated `id` in the form, claimed with `lockClientIds` as `document:<id>` before the trip lock, then re-checked for access. A client keeps one id per chosen file across failed attempts and drops it once the upload succeeds. Retry equality is trip, trip scope (no event or reservation), name, kind and size: the stored `url` is excluded because every attempt stores a fresh file. A replay returns the stored row, removes the file just stored and runs no effect; any other reuse is a 409; an id held by a trip the actor cannot see is a 404, so a stranger never reads that row. An id whose row is gone is a new create, unless the document was deleted recently (see below). Source: plan `story-upload-one-trip-document-through-the-api-plan.md` (story 3.1).

## Deleted document ids

Date: 2026-11-16. Status: accepted. Supersedes the 2026-11-14 acceptance of retry-after-delete in "Document ids".

Deleting a document writes a deletion record, `deleted:document:<id>`, in `idempotency_keys` inside the delete transaction (`recordDeletion`, `src/lib/services/deletion-records.ts`). An upload whose client id has no row but a record younger than `IDEMPOTENCY_RETENTION_MS` (24 hours) is a 409 `conflict` and stores nothing; the retention sweep deletes the record with the replay rows. All three web uploaders drop their id on a 409, so choosing the file again uploads it as a new document.

- **Why now.** The mobile app's offline queue replays writes once it reconnects, so a create that lands after a collaborator's delete is the expected case rather than a lost-response edge, and a document that comes back undeleted is wrong. The earlier objection was the schema work a tombstone needs; reusing `idempotency_keys` and its sweep needs none.
- **Window.** The record outlives every replay window (both capped at the retention), so any retry the replay rules allow still meets it. A retry after the window creates again, as before.
- **Scope.** Documents only. Events, checklists, checklist items, notes and days still create again under a deleted id; each adopts `recordDeletion`/`wasRecentlyDeleted` when it needs the same rule (add it to `DeletionRecordResource`).
- **Namespace.** The key prefix keeps records apart from API replay rows (`api:v1:`). Packing's raw template keys share the table unprefixed; a client could store a raw key shaped like a record, which only refuses an upload that happens to carry that exact random id.

Source: deferred-work L104, branch `fix/api-write-safety`; `api.feature` "A retry sent after the document was deleted conflicts instead of bringing it back", `documents.test.ts`, `deletion-records.test.ts`.
