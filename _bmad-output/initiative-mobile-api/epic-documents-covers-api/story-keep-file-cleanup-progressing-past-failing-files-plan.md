---
title: "Keep file cleanup progressing past failing files"
type: feature
ticket: "8"
created: "2026-11-12"
status: built
baseline_revision: "595534bcd469006270d66c56f8e08f97afe4eb4d"
route: oneshot
route_source: auto
risk: low
review: 'quick'
review_source: 'auto'
lenses_ran: [quick-reviewer]
review_loop_iteration: 0
context:
  - "{project-root}/_bmad-output/initiative-mobile-api/AGENTS.md"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `drainPendingFileDeletions` reads the oldest 200 `pending_file_deletions` rows by `created_at`. Rows whose file keeps failing to delete stay the oldest, so once 200 of them exist no newer queued file is ever removed.

**Approach:** When a queued file fails to delete, move its row to the back of the queue (`created_at = now()`) in `removeQueuedFiles`, so every drain batch reaches newer rows. No migration; deletion stays after commit and rows queued in a rolled-back transaction stay absent. Branch `story/3-8-keep-file-cleanup-progressing-past-failing-files`; PR base `feature/api-v1`.

</frozen-after-approval>

## Implementation Notes

Oneshot: one module (`src/lib/file-cleanup.ts`) and its colocated test change; no schema, API or UI change. `file-cleanup.ts` is already mapped in `tests/e2e/feature-map.mjs` (`activity-retention` and others), so affected E2E needs no map edit.

Tests first: extend `src/lib/file-cleanup.test.ts` with (a) failed rows moved to the back with one update, (b) an in-memory queue where 250 permanently failing rows no longer block a newer file across drains, (c) queue writes use only the supplied transaction, so a rolled-back transaction leaves nothing to drain, (d) a failing bump is logged, never thrown.

## Verification

**Commands:**

- `npx vitest run src/lib/file-cleanup.test.ts` -- expected: all pass
- build-validator after final change (lint, TypeScript, coverage, build, affected E2E)

## Review Triage Log

- F1 — low, rejected: a row whose storage delete succeeded but whose queue-row delete failed is not requeued. The file is already gone, the next drain's retry clears it, and a DB failure persistent enough to fill batches would fail the requeue update too. Not caused by this change; fix is not a simple correction.
- F2 — medium, patch: rollback test never asserted the transaction insert ran. Added the `transaction.insert` assertion.
- F3 — medium, patch: update mock accepted any `createdAt`. Now compiles the value and asserts it is `now()`.
- F4 — low, patch: `eq`/`inArray` fakes hid the column. Fakes now carry the column and the test asserts `pendingFileDeletions.id`.
