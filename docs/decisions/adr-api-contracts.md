# Own a small client-safe REST contract layer

Date: 2026-11-07. Status: accepted.

Accepted. Use hand-rolled `defineEndpoint`, `apiRoute` and `api` with plain REST `/api/v1` endpoints rather than oRPC. Client-safe contracts declare method, path, Zod params/body and domain response type from `src/data/types.ts`. Server wrappers authenticate, check CSRF, rate-limit, parse and validate, and map typed failures into a no-store JSON envelope. Thin route modules stay independently segmentable in the E2E map.

V1 evolves additively. Writes use absolute values and partial PATCH semantics; future creates accept client UUIDs, deletes are idempotent, and ordering sends complete ID lists. Generalized Idempotency-Key replay, metadata and wrapper enforcement are later pilot entries. Runtime output schemas/OpenAPI are deferred to mobile prerequisites. This story only adds `{ isChecked: boolean }` PATCH and does not claim replay machinery exists.

Source: [API direction and phase 0 decisions](../plans/mobile-api.md).
