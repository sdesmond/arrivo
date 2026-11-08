# Refresh page data after successful API mutations

Date: 2026-11-07. Status: accepted.

Accepted. Typed fetch sends same-origin credentials, JSON body and the explicit web client header. `useApiMutation` handles field errors/toasts, sends expired sessions to sign-in and enrollment restrictions to MFA enrollment, and calls router.refresh only after successful writes. Failures remain visible and never trigger success refresh.

The current checked-state UI renders server props, retaining existing completion/collapse and focus behavior. Two round trips (mutation and refreshed page data) are accepted. Per-resource keyed serialization and optimistic continuity through refreshed data are required for ordering-sensitive or rapid writes, but belong to the later rapid-write ordering story; this pilot deliberately adds no unused queue or replay system. E2E must await exact API method/path before reload.

Source: [API direction and phase 0 decisions](../plans/mobile-api.md).
