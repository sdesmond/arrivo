---
title: "Refactor sweep"
type: "refactor"
ticket: "9"
created: "2026-11-13"
status: "built"
baseline_revision: "8858f61df4f967ce843b424d9a4a62715d84e65c"
route: "oneshot"
route_source: "auto"
risk: "low"
review: "none"
review_source: "auto"
lenses_ran: []
review_loop_iteration: 0
context:
  - "{project-root}/_bmad-output/initiative-mobile-api/AGENTS.md"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Entries 3.1–3.8 retired the document and cover server actions, but left helpers in `src/lib/url-policy.ts` that nothing in runtime code calls any more.

**Approach:** Review the completed epic plans and deferred findings, then remove only epic-orphaned code, with its colocated tests. Add no scope and change no behavior.

</frozen-after-approval>

## Implementation Notes

Oneshot: the sweep is a few deletions in one module and its test. Branch `story/3-9-refactor-sweep` from `feature/api-v1`; PR base `feature/api-v1`.

Findings, each traced to history:

- `getEventTripId`, `cover-upload-actions.ts`, `document-upload-actions.ts`, `reservation-document-actions.ts`: already deleted by 3.1–3.6 (the three files are gone, no `getEventTripId` reference remains). Nothing to do.
- `isValidDocumentUrl` + `DocumentUrlOwner` (`src/lib/url-policy.ts`): last caller was the retired `addDocument`; 3.3 deleted `assertValidDocumentUrl` but left these. Only `url-policy.test.ts` references them. Remove.
- `assertValidPhotographerUrl`: last caller was the retired cover-select action (retired in `0ad1b2d6`). Only the test references it. Remove.
- Kept: `isHttpUrl`, `parseOwnStorageUrl`, `assertValidCoverImageUrl` (used by services and API contracts).
- Deferred, not duplication this sweep removes: the rename/promote/remove mutation wiring repeated across `doc-row`, `event-doc-row` and `reservation-doc-row`. Merging it changes component behavior, which the story excludes; the delete dialog was already extracted in 3.4.

## Verification

**Commands:**

- `npx vitest run src/lib/url-policy.test.ts` -- expected: passes with the removed cases gone
- `npx vitest run src/lib/services src/lib/api src/components/arrivo` -- expected: unchanged document, reservation-document and cover behavior
- `grep -rnw "isValidDocumentUrl\|assertValidPhotographerUrl\|DocumentUrlOwner" src tests` -- expected: no matches

## Review Triage Log

No review subagent was launched: the change deletes three unreferenced exports and their test cases, and no subagent was authorized for this run. Inline check instead: grep finds no remaining reference in `src` or `tests`, `tsc` and lint pass, and the affected tests pass.

## Validation

Lint pass (0 errors), tsc pass, build pass, coverage pass (458 files, 7848 tests; lines 97.99%, branches 93.93%), affected E2E pass (536 scenarios).
