# Own a small client-safe REST contract layer

Date: 2026-11-07. Status: accepted.

Accepted. Use hand-rolled `defineEndpoint`, `apiRoute` and `api` with plain REST `/api/v1` endpoints rather than oRPC. Client-safe contracts declare method, path, Zod params/body and domain response type from `src/data/types.ts`. Server wrappers authenticate, check CSRF, rate-limit, parse and validate, and map typed failures into a no-store JSON envelope. Thin route modules stay independently segmentable in the E2E map.

V1 evolves additively. Writes use absolute values and partial PATCH semantics; future creates accept client UUIDs, deletes are idempotent, and ordering sends complete ID lists. Metadata and wrapper enforcement are later pilot entries. Runtime output schemas/OpenAPI are deferred to mobile prerequisites.

## Idempotency-Key replay

A handler opts in with `apiRoute(endpoint, handler, { idempotent: { expiryMs? } })`; a keyed request to any other handler gets 400 `bad_request`. The wrapper validates the header (1 to 255 characters after trimming, otherwise 422 with an `Idempotency-Key` field error) and hands the service `{ key, method, path, expiryMs? }`. Requests without a key behave as before. Today only the checklist-item `PATCH` opts in.

- **Scope.** A record belongs to the actor and key. Its fingerprint is a SHA-256 over method, concrete path (contract template filled with validated params) and the validated payload; object key order is ignored, array order is not.
- **Storage.** The existing `idempotency_keys` table, no migration. API rows use the key `api:v1:<key>` and a versioned JSON envelope `{ version, fingerprint, expiresAt, response }`. Packing keeps its raw keys, `{ templateId }` results and 24-hour window untouched. An unreadable row in the API namespace fails closed (500) and is never overwritten.
- **Atomicity.** The mutation and the record share one transaction (`withIdempotency`). An advisory lock on actor and key, bounded at 3 seconds, serializes concurrent retries; a timeout answers 409 `conflict` so the client retries. The trip lock follows it. Access is re-verified after both locks and before the stored result is read, so a caller who lost access gets 403 or 404 and never a cached body.
- **Outcomes.** Same fingerprint inside the window: the stored JSON, no write, no activity, live-sync or revalidation. Different method, resource or payload inside the window: 409 `conflict`. Past `expiresAt` (the instant itself counts as expired): the request runs again and replaces the record. If the mutation, the record write or the commit fails, nothing persists and a retry can succeed. After-commit effects run only for a new mutation.
- **Expiry.** `expiryMs` must be positive and finite; the default is 24 hours, and the mobile phase can lengthen it per endpoint.

Source: [API direction and phase 0 decisions](../plans/mobile-api.md).
