# Require explicit same-origin web mutations with cookie auth

Date: 2026-11-07. Status: accepted.

Accepted. Existing Auth.js session cookies authenticate web mutations. Mutation requests require `X-Arrivo-Client: web`, JSON or multipart content type, and `Sec-Fetch-Site: same-origin`. When Fetch Metadata is absent, Origin must equal the browser-facing request origin, using configured or forwarded origin resolution, including ports. Explicit same-site/cross-site metadata fails even if Origin matches.

No CORS headers or preflight support are introduced. The custom header forces cross-origin browser callers to preflight, while origin checks reject other apps on different ports of the same host. SameSite=Lax alone is insufficient. Invalid CSRF fails before writes. No environment variables, proxy changes or database migrations are needed.

Source: [API direction and phase 0 decisions](../plans/mobile-api.md).
