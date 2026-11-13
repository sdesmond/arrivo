---
title: "Upload a cover through the API"
type: feature
ticket: "6"
created: "2026-11-13"
status: built
baseline_revision: "8adabe1a84cbeffeb0313449beeaf2fed9ca0bc1"
route: full
route_source: auto
risk: medium
review: "thorough"
review_source: "auto"
lenses_ran: []
review_loop_iteration: 0
context:
  - "_bmad-output/initiative-mobile-api/AGENTS.md"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Custom cover upload is still the `uploadCoverImage` server action: no lock or transaction, it deletes the previous cover blindly (any URL), and it throws untyped errors.

**Approach:** Add multipart `POST /api/v1/trips/:tripId/cover/image` on entry 5's cover service and entry 1's multipart transport, switch `cover-image-picker-upload`, retire the action and its wrapper. Branch: `story/3-6-cover-upload-api`; PR base: `feature/api-v1`.

## Boundaries & Constraints

**Always:** Editor role before any storage write and again under the trip lock. Policy first (`assertValidCoverUpload`, `assertUploadContentMatchesType`; 12 MB), then `put` via `getStorageAdapter()`. Update the cover and queue the replaced own trip-cover file (`parseOwnStorageUrl`: scope `trip-cover`, owner = trip) in one transaction; remove it only after commit via `queueFileDeletions`/`removeQueuedFiles`. Upload clears photographer and photographer URL. Run through `runTripWrite` (`afterTripWrite`). No `Idempotency-Key` (a keyed request is 400), so a retry replaces the cover again. Remove the new file when the write fails before commit; keep it when a trip row already points at it (post-commit effect failure). Response 204.

**Never:** Cover search/destination GET (entry 7), schema or migration, new env var, direct storage/`fs` calls, other action migration, CHANGELOG edits, remote publication without authorization.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Behavior | Error |
| --- | --- | --- | --- |
| Upload | Editor, valid image (GIF included) | 204; cover = new file, attribution cleared; effects once | — |
| Replace stored | Previous own trip-cover file | Queued in transaction; removed after commit | Storage failure → durable retry |
| Replace other | Previous Unsplash, graphic, other owner | Never queued | — |
| Oversize | Content-Length or file > 12 MB | Nothing stored | 413 `payload_too_large` |
| Bad type / bytes | Type not allowed or bytes ≠ type; missing file | Nothing stored | 422 `validation_failed` |
| Access | Viewer / stranger / no `X-Arrivo-Client` / role lost under lock | No write; new file removed | 403 / 404 / 403 / mapped |
| Keyed | `Idempotency-Key` sent | Nothing stored | 400 |
| Rollback | `put` ok, update/queue/commit fails | Old cover and file kept; new file removed | Mapped error |

</frozen-after-approval>

## Code Map

- `src/lib/api/contract/covers.ts` — add `uploadTripCoverImage` (`/api/v1/trips/:tripId/cover/image`, `status: 204`, `body: z.strictObject({})`, `multipart: { maxFileBytes: MAX_COVER_IMAGE_UPLOAD_BYTES }` from `src/lib/utils.ts`). Pattern: `contract/documents.ts`.
- `src/lib/services/covers.ts` — add `uploadTripCoverImage(actor, tripId, input, file)`; extract the owned-cover queueing block of `writeCover` into a shared helper. Order, rollback check and `runTripWrite` pattern: `services/documents.ts` `uploadDocument` (lines 49–129); committed-row check reads `trips.coverImageUrl === url`.
- `src/lib/file-cleanup.ts` — receive `discardStoredFile` (private in `documents.ts` today); both services import it. Check `documents.test.ts` mocks.
- `src/app/api/v1/trips/[tripId]/cover/image/route.ts` (new) — `POST = apiRoute(uploadTripCoverImage, …)`, no `idempotent`; template `documents/route.ts`. `handler-coverage.test.ts` scans routes.
- `src/components/arrivo/cover-image-picker-upload.tsx` (137 lines) — replace action call with `useApiMutation(uploadTripCoverImage)` (accepts `file`; toasts API error; refreshes). Keep client `assertValidCoverUpload` toast, `#cover-upload-input`, drag/drop, spinner, input reset on error. `onImageSelected(url)` becomes vestigial (picker ignores it): drop it; update `cover-image-picker.tsx:76` and tests.
- `src/app/(app)/trips/[tripId]/cover-upload-actions.ts` + `.test.ts` — delete. `actions.ts` — delete import (line 14) and wrapper (55–57), keep other actions; `actions.test.ts` — remove `uploadCoverImage` block and import.
- `next.config.ts` — no change (`proxyClientMaxBodySize` 26mb covers 12 MB).
- `tests/e2e/feature-map.mjs` — remove `cover-upload-actions.ts` entries (≈ lines 318, 769); new route/test files already match existing globs.

## Tasks & Acceptance

**Execution:**

- [x] `src/lib/api/contract/covers.test.ts`, `src/lib/services/covers.test.ts`, `src/app/api/v1/trips/[tripId]/cover/image/route.test.ts` — matrix rows: 204, GIF, 413, 422 type/content/missing file, 400 keyed, viewer/stranger, lock-time role loss, owned vs external previous cover, queue-then-remove-after-commit, rollback removes new file, committed-row keeps it, failed cleanup retry.
- [x] `src/components/arrivo/cover-image-picker-upload.test.tsx`, `cover-image-picker.test.tsx` — API call with `file` and params, invalid file toast, error resets input, spinner/pending; `CoverImagePickerUploadProps` loses `onImageSelected`; dead mock removed.
- [x] `src/lib/file-cleanup.test.ts`, `src/lib/services/documents.test.ts` — `discardStoredFile` (deletes; failed delete logs name only and does not throw) tested at its new home; documents tests keep passing against the import.
- [ ] Implement contract, service, `file-cleanup` move, route, picker; delete action, wrapper and their tests (grep for dead symbols).
- [x] `tests/e2e/features/api.feature`, `tests/e2e/steps/api-covers.steps.ts` — scenario-owned multipart upload: replace stored cover (old file gone after commit), clears attribution, 413, 422 variants, keyed 400, no-header 403, viewer 403, stranger 404, rollback keeps old cover.
- [x] `tests/e2e/features/trip-cover-overflow.feature`, `steps/trip-cover-overflow.steps.ts` — upload step arms `waitForApiResponse` on `POST /api/v1/trips/<id>/cover/image`, reload and assert; unsupported type still shows client message. Run `viewer-trip-access` unchanged.
- [x] `tests/e2e/feature-map.mjs` — drop retired entries; run `node --test scripts/feature-map.test.mjs`.

**Acceptance Criteria:**

- Given an editor uploading a custom cover, when reload completes, then the new cover persists with no attribution and the previous stored file is gone.
- Given an unsupported or oversize file, when uploading, then the API returns 422/413 and the cover and storage are unchanged.
- Given the migrated runtime, when searching definitions and imports, then `uploadCoverImage` and `cover-upload-actions` no longer exist.

## Implementation Notes

Plan-reviewer: scope, architecture, component, accessibility PASS; test coverage had one BLOCKING (`file-cleanup.ts` modified without its colocated test step) — fixed by naming `file-cleanup.test.ts`. Warning accepted: `discardStoredFile` moves to `file-cleanup.ts` because two services now need it (avoids a duplicate). Original request: `/bmad-build next story` → ticket 3.6.

## Plan Change Log

## Review Triage Log

Independent review subagents were not launched (this session does not spawn subagents without an explicit user request). The author self-reviewed the diff against the matrix: no intent_gap or bad_plan finding; no patch needed. Notes: `node --test scripts/feature-map.test.mjs` does not run (the file imports vitest); ran it with `npx vitest run scripts/feature-map.test.mjs` instead, which passed.

## Design Notes

Response is 204 like entries 5's PUT/DELETE: the UI refreshes and the picker never used the returned URL. Each attempt stores a fresh file, so there is no replay to detect; the new-file cleanup keys on whether a committed trip row references it. Preserve CSS tokens, 44px targets, picker labels and keyboard behavior; no redesign.

## Verification

**Commands:**

- Named Vitest files, then `node --test scripts/feature-map.test.mjs` -- expected: pass.
- Focused Playwright: `api.feature` cover scenarios, `trip-cover-overflow`, `viewer-trip-access` -- expected: pass.
- Parent invokes build-validator (lint, types, build, coverage alone, affected E2E alone). No automatic full E2E.
