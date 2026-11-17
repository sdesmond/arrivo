# Own a small client-safe REST contract layer

Date: 2026-11-07. Status: accepted.

Accepted. Use hand-rolled `defineEndpoint`, `apiRoute` and `api` with plain REST `/api/v1` endpoints rather than oRPC. Client-safe contracts declare method, path, Zod params/body and domain response type from `src/data/types.ts`. Server wrappers authenticate, check CSRF, rate-limit, parse and validate, and map typed failures into a no-store JSON envelope. Thin route modules stay independently segmentable in the E2E map.

V1 evolves additively. Writes use absolute values and partial PATCH semantics; future creates accept client UUIDs, deletes are idempotent, and ordering sends complete ID lists. Metadata and wrapper enforcement are later pilot entries. Runtime output schemas/OpenAPI are deferred to mobile prerequisites.

## Idempotency-Key replay

A handler opts in with `apiRoute(endpoint, handler, { idempotent: { expiryMs? } })`; a keyed request to any other handler gets 400 `bad_request`. The wrapper validates the header (1 to 255 characters after trimming, otherwise 422 with an `Idempotency-Key` field error) and hands the service `{ key, method, path, expiryMs? }`. Requests without a key behave as before. Every JSON write opts in; the uploads and the GET helpers do not (the list per endpoint is in [the API reference](../api-v1.md)).

- **Scope.** A record belongs to the actor and key. Its fingerprint is a SHA-256 over method, concrete path (contract template filled with validated params) and the validated payload; object key order is ignored, array order is not.
- **Storage.** The existing `idempotency_keys` table, no migration. API rows use the key `api:v1:<key>` and a versioned JSON envelope `{ version, fingerprint, expiresAt, response }`. Packing keeps its raw keys, `{ templateId }` results and 24-hour window untouched. An unreadable row in the API namespace fails closed (500) and is never overwritten.
- **Atomicity.** The mutation and the record share one transaction (`withIdempotency`). An advisory lock on actor and key, bounded at 3 seconds, serializes concurrent retries; a timeout answers 409 `conflict` so the client retries. The trip lock follows it. Access is re-verified after both locks and before the stored result is read, so a caller who lost access gets 403 or 404 and never a cached body.
- **Outcomes.** Same fingerprint inside the window: the stored JSON, no write, no activity, live-sync or revalidation. Different method, resource or payload inside the window: 409 `conflict`. Past `expiresAt` (the instant itself counts as expired): the request runs again and replaces the record. If the mutation, the record write or the commit fails, nothing persists and a retry can succeed. After-commit effects run only for a new mutation.
- **Expiry.** `expiryMs` must be positive, finite and at most `IDEMPOTENCY_RETENTION_MS` (24 hours, `src/lib/idempotency-retention.ts`), which is also the default. The maintenance pass deletes rows older than the retention, API and packing alike, so a longer expiry would lose live keys; `withIdempotency` refuses one and `idempotency-expiry-cap.test.ts` fails on any route that sets one. A mobile endpoint that needs a longer window for offline retries must raise the retention first, or move the sweep to a stored `expires_at`.

## Request deadline

Date: 2026-11-16. Status: accepted.

Aborting `fetch` does not stop the server, so a write the client timed out on could commit later and land after the write that followed it. `apiRoute` runs each request under a deadline (`src/lib/request-deadline.ts`) set ahead of the client's timeout: 20 seconds for JSON (`REQUEST_TIMEOUT_MS` 30 s minus a 10 s margin) and 90 seconds for multipart (120 s minus 30 s, since Next can buffer an upload body before the handler starts). `runTripWrite` guards its transaction: it caps each statement, lock waits included, at the time left, and rolls back work that finishes past the deadline. Either way the answer is 503 `deadline_exceeded`, and nothing is committed.

- **Clock.** `performance.now()` from the handler's start, not `getNow()`, so the dev date picker cannot move it. Time spent before the handler (network, queueing) is not counted, which is why the margin exists; it bounds the race rather than closing it.
- **Scope.** API writes through `runTripWrite`, which is every v1 write today. Server actions run without a deadline.
- **Later.** Ordering a client's own writes past this needs version checks (`If-Match`) or a per-resource sequence; that is a mobile-phase decision, together with last-write-wins versus conflict detection for collaborators' edits.

## Multipart uploads

Date: 2026-11-12. Status: accepted.

An endpoint opts in with `multipart: { maxFileBytes }` in `defineEndpoint`. The request is `multipart/form-data` with exactly one part named `file` plus the string fields named by the contract `body` schema (strict, so an unknown or repeated field is rejected). `apiRoute` hands the handler `{ actor, params, body, file }`, and `api()` takes `{ params, body, file, timeoutMs? }`, sends no `Content-Type` (the browser adds the boundary) and defaults an upload to a 120-second timeout instead of 30.

- **Limits.** `upload-policy.ts` owns type, size and content checks and throws `UploadTooLargeError` (413 `payload_too_large`) and `UploadInvalidError` (422 `validation_failed`, with the message under `fields.file`). Both the document (25 MB) and cover (12 MB) policies use them, so their messages are unchanged for the server actions that still call them.
- **Proxy buffer.** Next buffers a proxied body only up to `experimental.proxyClientMaxBodySize` (default 10 MB) and truncates the rest silently. `next.config.ts` sets `26mb` (the 25 MB document limit plus `MULTIPART_OVERHEAD_BYTES`, 1 MiB), with no new environment variable. A test fails if the value drops below that floor. `apiRoute` also answers 413 from `Content-Length` before reading, so a larger body is refused instead of being parsed after truncation; a chunked body with no length that is larger still fails as a 400 malformed multipart.
- **No `Idempotency-Key`.** A keyed multipart request is 400 `bad_request`. Retry safety comes from a client-generated document id in the form (see the client-UUID ADR), so no file body is hashed. This narrows the plan's "`Idempotency-Key` on every mutation" for uploads only.
- **CSRF.** `X-Arrivo-Client: web` and the same-origin check apply as for JSON; `multipart/form-data` is an accepted content type.

Source: [API direction and phase 0 decisions](../plans/mobile-api.md).
