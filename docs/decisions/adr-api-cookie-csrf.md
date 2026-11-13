# Require explicit same-origin web requests with cookie auth

Date: 2026-11-07. Status: accepted.

Accepted. Existing Auth.js session cookies authenticate web mutations. Mutation requests require `X-Arrivo-Client: web`, JSON or multipart content type, and `Sec-Fetch-Site: same-origin`. When Fetch Metadata is absent, Origin must equal the browser-facing request origin, using configured or forwarded origin resolution, including ports. Explicit same-site/cross-site metadata fails even if Origin matches.

No CORS headers or preflight support are introduced. The custom header forces cross-origin browser callers to preflight, while origin checks reject other apps on different ports of the same host. SameSite=Lax alone is insufficient. Invalid CSRF fails before writes. No environment variables, proxy changes or database migrations are needed.

Source: [API direction and phase 0 decisions](../plans/mobile-api.md).

API reads use the same session authentication, `X-Arrivo-Client: web`, and same-origin check, without requiring a content type. For GET only, when both Origin and Fetch Metadata are absent (as on plain HTTP hosts), Referer must match the browser-facing origin, including configured or forwarded origins and ports. Missing, malformed or foreign Referer fails; explicit Origin or Fetch Metadata takes precedence and cannot be rescued by Referer. Mutation requests retain their Origin fallback. Auth and origin checks run before the API rate limit and query validation. This prevents cross-origin pages from spending a visitor’s upstream search budget. GET query fields are validated through the endpoint body schema; repeated keys are 400 and schema failures are 422. Reads reject `Idempotency-Key` with 400 and return `Cache-Control: no-store`, including errors.
