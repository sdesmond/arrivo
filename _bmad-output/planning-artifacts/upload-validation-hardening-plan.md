# App-Wide Upload Validation Hardening

## Summary

Harden upload paths called out in `_bmad-output/implementation-artifacts/deferred-work.md` across trip documents, event documents, reservation documents, and trip cover uploads. Keep current supported file formats as default, add authoritative server-side MIME validation, replace client-controlled blob keys with server-generated storage names, and preserve original filenames only for DB/display.

## Important Interface Changes

- Add internal shared upload helper module in `src/lib/` for:
  - document and cover MIME allowlists
  - shared accept strings / picker copy
  - file validation helpers that throw exact user-facing errors
  - generated storage-name builder based on upload scope + owner id + MIME-derived extension
- Extend `saveLocalUpload()` in `src/lib/local-upload.ts` to accept caller-supplied generated storage names so stub uploads and Blob uploads use same key strategy.
- No domain-type changes in `src/data/types.ts`.

## Implementation Changes

- Split oversized `src/app/(app)/trips/[tripId]/actions.ts` before adding upload hardening:
  - move `uploadDocument()` and `uploadDocumentToEvent()` into `src/app/(app)/trips/[tripId]/document-upload-actions.ts`
  - move `uploadCoverImage()` into `src/app/(app)/trips/[tripId]/cover-upload-actions.ts`
  - update component imports to point at new modules so upload work lands outside the existing oversized route action file
- Add shared upload-policy logic in `src/lib/` and use it from:
  - `document-upload-actions.ts`
  - `cover-upload-actions.ts`
  - `src/app/(app)/trips/[tripId]/reservations/reservation-document-actions.ts`
- Server upload behavior:
  - reject unsupported document MIME types before any Blob/local-write/DB work
  - reject unsupported cover MIME types from exact allowlist instead of broad `image/*`
  - generate storage names like `trip-documents/<tripId>/<unique>.<ext>`, `event-documents/<eventId>/<unique>.<ext>`, `reservation-documents/<reservationId>/<unique>.<ext>`, and `trip-covers/<tripId>/<unique>.<ext>`
  - continue storing original `file.name` in document rows and continue existing rollback / revalidate behavior
- UI sync work in covered domain components:
  - `src/components/packt/trip-docs-tab.tsx`
  - `src/components/packt/add-doc-dialog.tsx`
  - `src/components/packt/add-reservation-doc-dialog.tsx`
  - `src/components/packt/cover-image-picker-upload.tsx`
  - replace duplicated picker accept strings with shared constants
  - keep client preflight checks aligned with server allowlists
  - surface thrown server validation messages via `toast.error(error instanceof Error ? error.message : ...)` instead of generic upload-failed copy

## Test Plan

- Add `src/lib/upload-policy.test.ts` for allowlists, exact error messages, extension mapping, and generated storage-name shape.
- Update `src/lib/local-upload.test.ts` to cover caller-supplied generated storage names and confirm original filenames are not reused as storage paths.
- Add route-action tests for extracted modules:
  - `src/app/(app)/trips/[tripId]/document-upload-actions.test.ts`
  - `src/app/(app)/trips/[tripId]/cover-upload-actions.test.ts`
- Update `src/app/(app)/trips/[tripId]/reservations/reservation-document-actions.test.ts` for unsupported MIME rejection and generated storage names.
- Update covered component tests:
  - `src/components/packt/trip-docs-tab.test.tsx`
  - `src/components/packt/add-doc-dialog.test.tsx`
  - `src/components/packt/add-reservation-doc-dialog.test.tsx`
  - `src/components/packt/cover-image-picker-upload.test.tsx`
  - cases: invalid file selection shows exact validation toast, server-thrown validation message is surfaced, existing happy-path upload still works
- Extend existing E2E coverage:
  - `tests/e2e/features/documents.feature` + `tests/e2e/steps/documents.steps.ts` with unsupported-MIME upload rejection on Documents tab
  - `tests/e2e/features/trip-cover-overflow.feature` + `tests/e2e/steps/trip-cover-overflow.steps.ts` with unsupported cover upload rejection
  - no extra reservation-specific E2E; reservation dialog reuses same shared document validation path and is covered by unit/component tests to avoid duplicate browser coverage

## Assumptions And Defaults

- Branch for implementation is `fix/app-wide-upload-validation`.
- MIME-policy default is current supported UI formats:
  - documents: PDF, JPG/JPEG, PNG, WEBP, HEIC
  - covers: JPG/JPEG, PNG, WEBP, HEIC, GIF, AVIF
- Accept `image/heif` as equivalent to `image/heic` if browser reports that MIME while keeping visible UI copy as `HEIC`.
- Zero-byte upload rejection stays out of scope for this pass; only deferred MIME validation + storage-key hardening are addressed.
