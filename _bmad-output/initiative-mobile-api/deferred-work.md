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
