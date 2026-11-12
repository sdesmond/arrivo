---
title: "Upload one trip document through the API"
type: "feature"
ticket: "1"
created: "2026-11-12"
status: "built"
baseline_revision: "e2363aba6d6648ccef092180fbe30f85d181423d"
route: "full"
route_source: "auto"
risk: "high"
review: "thorough"
review_source: "auto"
lenses_ran: []
review_loop_iteration: 0
context:
  - "{project-root}/_bmad-output/initiative-mobile-api/AGENTS.md"
  - "{project-root}/_bmad-output/initiative-mobile-api/epic-documents-covers-api/epic-documents-covers-api.md"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Trip document upload is a server action (`uploadDocument`) that checks the body only at 25 MB through the Next action limit, throws untyped errors, and cannot be retried safely. Mobile clients need a multipart REST route; the transport (`defineEndpoint`, `apiRoute`, `api()`) is JSON-only.

**Approach:** Tracer for epic 3 (D1, D2, D3, D8, D10). Add multipart support to the transport, typed upload-policy errors (413 / 422), a document service and `POST /api/v1/trips/:tripId/documents`, switch `trip-docs-tab` to it, and retire `uploadDocument` plus its wrapper. Branch: `story/3-1-upload-one-trip-document-through-the-api`; PR base `feature/api-v1`.

## Boundaries & Constraints

**Always:** Branch workflow of the initiative `AGENTS.md` (story branch, PR base `feature/api-v1`). Files go through `getStorageAdapter()`. Route is `apiRoute`-built, editor role, `afterTripWrite` via `runTripWrite`. Multipart routes take no `Idempotency-Key` (a keyed request is 400). No migration, no new env var. `uploadDocumentToEvent` and cover/reservation upload actions keep working unchanged (messages stay identical). Client document id is claimed with `lockClientIds` (`document:<id>`) before the trip lock; same trip, name, kind, size and trip scope = replay returning the stored row with no effect.

**Never:** Event and reservation upload routes, rename/remove/attach, cover routes, GET support, cleanup-drain fairness (entries 2–9). No hashing of file bodies. No production-only diff without tests.

## I/O & Edge-Case Matrix

| Scenario                         | Input / State                          | Expected Output / Behavior                                                | Error Handling                          |
| -------------------------------- | -------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------- |
| Upload                           | Editor, valid PDF, optional `id` UUID  | 200 `Document` (scope trip); row, file, activity, live sync, revalidation | —                                       |
| Same-id retry                    | Same file/trip, id exists              | 200 stored row; new file removed; no effect                               | —                                       |
| Id reuse, other content          | Same id, different name/size/trip      | —                                                                         | 409 `conflict`, new file removed        |
| Id held by trip actor cannot see | Same id, other trip                    | —                                                                         | 404, never the row                      |
| Oversize                         | Content-Length or file > 25 MB         | —                                                                         | 413 `payload_too_large`, nothing stored |
| Bad type / mismatch              | Type not allowed or bytes ≠ type       | —                                                                         | 422 `validation_failed`, nothing stored |
| Storage fails                    | `put` throws                           | —                                                                         | 500, no row                             |
| Insert fails                     | Insert throws after `put`              | —                                                                         | 500, file removed via adapter           |
| Roles / CSRF                     | Viewer; stranger; no `X-Arrivo-Client` | —                                                                         | 403; 404; 403                           |
| Missing file / bad id            | No `file` part; non-UUID `id`          | —                                                                         | 422                                     |

</frozen-after-approval>

## Code Map

- `src/lib/api/endpoint.ts` -- add optional `multipart?: { maxFileBytes: number }`; body schema validates string fields only.
- `src/lib/api/route.ts` -- when `endpoint.multipart`: reject Content-Length over `maxFileBytes + MULTIPART_OVERHEAD_BYTES` as 413 before reading; `request.formData()` (failure → 400 `bad_request`); build fields object from string entries, parse `body`; require a single `File` part named `file`; pass `file` to handler. Keep JSON path and csrf (already admits multipart) untouched.
- `src/lib/api/client.ts` -- `api()` accepts `{ params, body, file? , timeoutMs? }`; multipart builds `FormData`, omits `Content-Type`; `UPLOAD_TIMEOUT_MS` for uploads; same error mapping.
- `src/lib/api/errors.ts` -- map `UploadTooLargeError` → 413 `payload_too_large`; `UploadInvalidError` → 422 `validation_failed`.
- `src/lib/upload-policy.ts` -- `assertValidDocumentUpload`, `assertValidCoverUpload`, `assertUploadContentMatchesType` throw typed subclasses of `Error` with the same messages (client toasts, cover/reservation/event actions unaffected).
- `src/lib/api/contract/documents.ts` (new) -- `uploadTripDocument` endpoint, path `/api/v1/trips/:tripId/documents`, body `strictObject({ id: uuidLower.optional() })`.
- `src/lib/services/documents.ts` (new) -- `uploadTripDocument(actor, tripId, input, file)`; pattern of `services/trip-notes.ts` (`requireTripRole`, `lockClientIds`, `lockTrip`, `runTripWrite`, `dbDocToType`). Order: parse → role check → policy checks → `put` → transaction; delete the new file on replay, conflict or any failure.
- `src/app/api/v1/trips/[tripId]/documents/route.ts` (new) -- `POST = apiRoute(...)`, no `idempotent`.
- `next.config.ts` -- `experimental.proxyClientMaxBodySize: "26mb"` (25 MB file + form overhead); Next buffers only up to the limit and truncates silently, hence the Content-Length pre-check.
- `src/components/arrivo/trip-docs-tab.tsx` -- call `api(uploadTripDocument, …)`; keep one client id per file (name+size+lastModified) across failed attempts, reset on success; toasts from `ApiClientError`; refresh via `useRouter().refresh()`.
- `src/app/(app)/trips/[tripId]/document-upload-actions.ts`, `actions.ts` -- delete `uploadDocument` and its wrapper (keep `uploadDocumentToEvent`).
- `tests/e2e/feature-map.mjs` -- add `src/lib/services/documents.ts`, `src/app/api/v1/trips/*/documents/**`, `src/lib/api/**` (covered) to `api` and `documents` entries; documents entry also `src/lib/services/trip-write*.ts`, `client-ids.ts`.
- `docs/decisions/adr-api-contracts.md`, `adr-client-uuids-are-locked-before-the-trip-lock.md` -- record multipart contract (limits, 413/422, no Idempotency-Key, proxy truncation) and document-id replay (`document:<id>`, retry equality excludes url).

## Tasks & Acceptance

**Execution:**

- [ ] `src/lib/upload-policy.test.ts`, `src/lib/api/endpoint.test.ts` (multipart option), `route.test.ts` (also asserts `next.config.ts` proxy limit ≥ 25 MB + overhead), `client.test.ts`, `errors.test.ts`, `contract/documents.test.ts`, `src/lib/services/documents.test.ts`, `src/app/api/v1/trips/[tripId]/documents/route.test.ts`, `trip-docs-tab.test.tsx`, `document-upload-actions.test.ts` -- write/extend first: I/O matrix rows, multipart parse, Content-Length 413, typed errors, timeout, id retention, removal of `uploadDocument` -- tests-first gate
- [ ] `src/lib/upload-policy.ts`, `src/lib/api/{endpoint,route,client,errors}.ts`, `contract/documents.ts` -- typed errors and multipart transport
- [ ] `src/lib/services/documents.ts`, `src/app/api/v1/trips/[tripId]/documents/route.ts`, `next.config.ts` -- service, route, proxy limit
- [ ] `trip-docs-tab.tsx`, `document-upload-actions.ts`, `actions.ts`, `doc-row.test.tsx` mock -- switch caller, retire action
- [ ] `tests/e2e/features/api.feature`, `steps/api.steps.ts` -- viewer 403, stranger 404, 403 without `X-Arrivo-Client`, 413, 422, same-id replay through real HTTP multipart
- [ ] `tests/e2e/features/documents.feature`, `steps/documents.steps.ts` -- upload steps `waitForApiResponse` on `POST /api/v1/trips/<id>/documents`
- [ ] `tests/e2e/feature-map.mjs`, ADRs -- register and document

**Acceptance Criteria:**

- Given an editor, when a 20 MB PDF is uploaded in the production server, then it returns 200 and shows in Documents after reload with no new env var.
- Given a body over 25 MB, when posted, then 413 `payload_too_large` and nothing is stored; given `proxyClientMaxBodySize`, then it is at least 25 MB plus overhead (unit-asserted).
- Given a rejected upload, when it retries with the same file, then the same client id is sent; after success a new file gets a new id.
- Given `uploadDocument`, when the repo is searched, then no references remain.

## Implementation Notes

Implemented directly (no coding subagent). New: `contract/documents.ts`, `services/documents.ts`, `app/api/v1/trips/[tripId]/documents/route.ts`, `tests/e2e/steps/api-documents.steps.ts`. `useApiMutation` now passes `file` and `timeoutMs` through, and `trip-docs-tab` uses it (toasts, refresh and auth-loss handling come from the hook). The 12 MB `documents.feature` scenario runs through the dev server's proxy buffer; the 20 MB production-server check is manual. `next.config.ts` stays in the shared tier of the feature map, so touching it runs the full E2E suite.

Validation: lint, tsc, build and coverage passed; the full E2E suite passed except one `trip-notes` scenario ("Editing a note preserves its list position", missing "Note title" after New Note) that passed on its own rerun with the whole feature (21/21), treated as a load flake. The validator pass marker was not recorded, and the 20 MB production-server upload is still a manual check.

## Plan Change Log

## Review Triage Log

Inline review by the implementing session (no reviewer subagents were authorized, so `lenses_ran` is empty).

- medium / patch -- `src/lib/services/documents.ts` catch removed the stored file even when the failure came after the commit (write effects), leaving a row pointing at a deleted file -- fixed: the catch keeps the file when a row with its url exists; test added.
- low / rejected -- a chunked multipart body over 26 MB with no Content-Length is truncated by Next and answers 400, not 413 -- documented in the contract ADR; the fix would add complexity for a client that does not exist (browsers and fetch send a length).
- false -- `file!` in the route handler -- `readMultipart` guarantees a file for a multipart endpoint (422 otherwise), covered by route tests.

## Design Notes

Multipart `api()` call and handler shape:

```ts
await api(uploadTripDocument, { params: { tripId }, body: { id }, file }); // client
apiRoute(uploadTripDocument, ({ actor, params, body, file }) => upload(actor, params.tripId, body, file!)); // route
```

Retry equality excludes `url` (every attempt stores a fresh file) and `addedAt`. The "bad-type" `documents.feature` scenario stays client-side (no POST is sent); the server 422 is proven in `api.feature`.

## Verification

**Commands:**

- `npx vitest run src/lib/upload-policy.test.ts src/lib/api src/lib/services/documents.test.ts "src/app/api/v1/trips/[tripId]/documents" src/components/arrivo/trip-docs-tab.test.tsx` -- expected: pass
- `npm run test:e2e:affected` -- expected: `api` and `documents` features pass (via build-validator)

**Manual checks (if no CLI):**

- `npm run build` + production start with local storage; upload a 20 MB PDF in Documents; it appears after reload; a 26 MB file shows the 413 toast.
