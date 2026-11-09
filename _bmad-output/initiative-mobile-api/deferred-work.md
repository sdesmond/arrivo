- source_plan: `_bmad-output/initiative-mobile-api/epic-checklist-api-pilot/story-make-api-replay-atomic-and-authorization-aware-plan.md`
  summary: Add a retention sweep for expired `idempotency_keys` rows.
  evidence: API replay rows (`api:v1:` namespace) are replaced on reuse but never purged, and legacy packing rows share the same unbounded growth; expiry only gates replay.

- source_plan: `_bmad-output/initiative-mobile-api/epic-checklist-api-pilot/story-move-checklist-creation-title-and-deletion-to-services-plan.md`
  summary: Migrate checklist create/title/delete UI callers to lifecycle APIs, add client 204 handling, and retire four migrated server actions.
  evidence: User requested splitting story 1.5 plan; backend endpoints can ship additively while existing UI actions remain operational. Follow-up completes story 1.5 using use-checklist-handlers and use-trip-detail-handlers with matching tests, client.test.ts/client.ts, actions.test.ts/actions.ts, day-planning.feature/steps, exact API waits, draft rejection on API/auth failure, title null clearing, first-item expansion, reload persistence, and feature-map updates. Use a new story branch from latest feature/api-v1 after backend merge; PR base feature/api-v1.
