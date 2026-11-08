# Expose membership-aware API denials while pages conceal access

Date: 2026-11-07. Status: accepted.

Accepted. Unauthenticated or revoked sessions return 401 `unauthenticated`; enrollment-only sessions return 403 `mfa_enrollment_required`. Missing resources and non-members return 404 `not_found`; members below required role return 403 `forbidden` with `requiredRole`. Non-admins on future admin endpoints get 403. Pages continue concealing typed access denials through `notFound()`.

Malformed JSON or a non-object body returns 400 `bad_request`; invalid params/fields return 422 `validation_failed` with field errors. Conflict is 409, oversized upload 413, exhausted budget/lockout 429 with Retry-After, unexpected failure sanitized 500 `server_error`. Failures use `{ error: { code, message, fields?, requiredRole? } }`; every wrapper response is JSON and no-store. Never expose SQL, identifiers or stack traces through unexpected errors.

Source: [API direction and phase 0 decisions](../plans/mobile-api.md).
