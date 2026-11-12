---
type: epic
title: "Documents and covers through the API"
parent: initiative-mobile-api
covers: [R3, R7]
after: []
assignee: ""
risk: medium
---

# Documents and covers through the API

## Description

Migrate document upload, linking, rename, removal, attachment and promotion, cover upload and selection, and cover image search. Own multipart limits using upload-policy and existing storage adapters.

## Outcome

Document and cover flows use /api/v1 in the production build.

## Requirements

- D1 (R3): Multipart and read transport. `defineEndpoint`, `apiRoute` and `api()` accept `multipart/form-data` with one file part and named fields, and `GET` with a validated query. `api()` takes a per-request timeout long enough for a 25 MB upload. Proxy body buffering admits the 25 MB document limit, with no new environment variable.
- D2 (R3): Upload policy at the handler. `upload-policy.ts` checks type, size and content before storage. Oversize is 413 `payload_too_large`. A disallowed or mismatched type is 422 `validation_failed`. A storage failure writes no row, and a failed row insert removes the stored file.
- D3 (R3): Document uploads. `POST /api/v1/trips/:tripId/documents`, `/api/v1/events/:eventId/documents` and `/api/v1/reservations/:reservationId/documents` (multipart, editor role). A client-generated document id in the form makes a retry safe: a same-id retry returns the existing row. Multipart routes take no `Idempotency-Key`.
- D4 (R3): `PATCH /api/v1/documents/:documentId`, partial. `name` is validated by `documentNameSchema` in every scope, reservation documents included. `eventId` or `reservationId` attaches as an absolute value; a document has one scope, so setting one clears the other, and sending both is 422; `null` promotes to trip scope. A target in another trip is 404; `linked-*` event ids are refused.
- D5 (R3): `DELETE /api/v1/documents/:documentId` is idempotent (204). The file is removed through the `pending_file_deletions` queue after commit.
- D6 (R3): Covers. `PUT /api/v1/trips/:tripId/cover` sets an Unsplash image with validated attribution. `POST /api/v1/trips/:tripId/cover/image` uploads under the 12 MB cover policy and queues the replaced stored cover for removal after commit. `DELETE /api/v1/trips/:tripId/cover` restores the graphic cover under the trip lock. Every cover change queues a previously uploaded stored cover for removal after commit.
- D7 (R3): Cover image search and destination lookup are `GET` endpoints over one service, which `createTrip` also calls directly. Per-user Unsplash and Mapbox limits, timeouts and E2E stubs are unchanged. API reads apply the same cross-site check as writes (`X-Arrivo-Client: web` and same origin), so a cross-origin `GET` without the header is 403.
- D8 (R3): Every document and cover write runs through `afterTripWrite` (activity, live sync, revalidation). Reservation-document writes gain the live-sync event they lack today.
- D9 (R7, carry-in epic 2 retro A-4): The file-cleanup drain still progresses when more than one batch of queued files keeps failing; deletion stays after commit.
- D10 (R7): Colocated service, contract, route, client and component tests; `api.feature` cases for each route (413, 422, viewer 403, stranger 404, cross-site 403, replay); API waits replace server-action waits in every touched step; feature-map registration for each new route and service.

## Done when

1. Document and cover flows use /api/v1 in the production build.
2. Multipart limits, unsafe inputs, storage failures, authorization, and replay are tested without bypassing storage adapters.
3. Existing document, reservation-attachment, and cover flows pass affected regression checks.
4. A document upload larger than 10 MB and within the 25 MB limit succeeds against the production server, with no new environment variable or migration.

## Boundaries

Migrate document upload, linking, rename, removal, attachment and promotion, cover upload and selection, and cover image search. Own multipart limits using upload-policy and existing storage adapters. R7 ownership covers tests and feature-map registration for this epic's own changes; the pilot owns shared API test infrastructure and cleanup owns final enforcement. No native phone UI.

## References

- parent — `_bmad-output/initiative-mobile-api/initiative-mobile-api.md`, Requirements R3, R7.
- source — `docs/plans/mobile-api.md`, Architecture, Endpoint inventory, Phases, and Testing.
- constraint — `AGENTS.md`, tests first, colocated tests, scenario-owned fixtures, affected E2E, and validation.
- shared contract — `docs/plans/mobile-api.md`, Architecture; pilot entry 1.1 records the shared ADRs before later migration work.

## Notes

- Branch workflow: Base branch: feature/api-v1. Build each story on its own branch created from the latest feature/api-v1; open its PR with feature/api-v1 as the base/target. Do not build or commit stories directly on feature/api-v1, and do not target main. After opening the PR, switch back to feature/api-v1; before creating the next story branch, pull the latest feature/api-v1.
- Story inheritance: Every new story entry and story file in this epic must explicitly carry this branch workflow; retain it when pulling, refining, or handing off a story.

- Inception: Story breakdown and exact test intent are completed when this epic is selected.
- Decision: 2026-11-12 — The five reservation-document actions (upload, rename, remove, promote, attach to a reservation) migrate in this epic, not the reservations epic.
- Decision: 2026-11-12 — Cover image search and destination lookup become `GET` endpoints. API reads require the `X-Arrivo-Client: web` header and the same-origin check, so another app on the same host cannot spend a visitor's search budget. A site-wide Unsplash cap is not in this epic.
- Decision: 2026-11-12 — Multipart uploads are retry-safe through a client-generated document id in the form; multipart routes take no `Idempotency-Key`, so no file body is hashed. This narrows the source's "`Idempotency-Key` on every mutation" (Architecture, section 8) for uploads only.
- Decision: 2026-11-12 — Epic 2 retrospective A-4 (cleanup fairness) is carried here. A-2 (checklist-item retry IDs) and A-5 (blank first item API case) are not.
- Decision: 2026-11-12 — A document has one scope: attaching it to an event or a reservation clears the other link, and a PATCH setting both is 422. This is part of the v1 contract.
- Decision: 2026-11-12 — Selecting an Unsplash cover or removing a cover queues a previously uploaded stored cover for removal after commit; today that file is left orphaned.
- Decision: 2026-11-12 — Cleanup fairness (entry 8) runs in sequence before entry 3. It shares the E2E database, port and build cache with the lane, and entries 3 and 6 then build on the fair drain.
- Decision: 2026-11-12 — User approved the ten-entry breakdown in `tickets.toml`; build order 1, 2, 8, 3, 4, 5, 6, 7, 9, 10.
- Decision: 2026-11-12 — Entry 1 (upload one trip document through the API) is the tracer: multipart transport, typed upload-policy errors, proxy body limit, document service, one route, one UI caller and a production-server run of a 20 MB upload in one session. Its plan may split it if review finds more than one session.
- Decision: 2026-11-12 — Single lane. Entries 1–7 edit `trips/[tripId]/actions.ts`, `tests/e2e/feature-map.mjs` and `api.feature`/`api.steps.ts`; entries 1 and 7 both edit `endpoint.ts`, `route.ts` and `client.ts`; entries 2 and 4 share both document dialogs; entries 3 and 4 share the document row components. Each waits on the one before it; no parallel builds.
- Decision: 2026-11-12 — All 17 document and cover actions and their three pass-through wrappers retire in this epic, settling the Endpoint inventory source conflict below; `createTrip` keeps calling cover search through the new service.
- Handoffs: entry 1's document service and contract module are extended by entries 2, 3 and 4; its multipart handling and typed policy errors (document and cover policies) are reused by entries 2 and 6. Entry 8's fair drain is used by the removals in entries 3, 5 and 6. Entry 3's PATCH is extended by entry 4. Entry 5's cover service, locked read-update-queue transaction and stored-cover rule are reused by entry 6. Entry 7 owns GET support and the read-side cross-site check. ADR updates: entry 1 records the multipart contract and form-id replay in `adr-api-contracts.md` and the client-UUID ADR; entry 7 extends `adr-api-cookie-csrf.md` to reads.
- Source conflict: Endpoint inventory — lists 9 document and cover actions vs 17 in code: 6 in `trips/[tripId]/actions.ts`, 3 upload actions, 5 reservation-document actions and 2 cover-search actions, plus a dead `addDocument` that only its test calls.
- Assumption: Next.js buffers proxied request bodies only up to 10 MB by default (`experimental.proxyClientMaxBodySize`, Next 16 docs), and `/api/v1` passes through the proxy. The tracer raises it in `next.config.ts` to admit 25 MB uploads.
- Assumption: Dead `addDocument` retires with no replacement endpoint.
- Assumption: Every document and cover write adopts `afterTripWrite`; today none does, and each sets its effects by hand.
- Touch point: `createTrip` (epic-trips-packing-api) switches only its cover-search import to the new service; its Mapbox static-tile cover stays with that epic. `deleteReservation` file removal stays with epic-reservations-budget-api; `updateTripMetadata` document handling stays with epic-trips-packing-api.
