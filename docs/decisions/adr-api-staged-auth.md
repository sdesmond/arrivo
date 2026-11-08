# Stage authentication migration with unified sessions in phase 6a

Date: 2026-11-07. Status: accepted.

Accepted. Through phases 1–5, Auth.js cookies authenticate web API calls and its existing per-request revocation checks remain authoritative. Session creation and ending (groups A/B) retain their eight server actions; signed-in security operations (group C) migrate to API services. Enrollment-only sessions are denied by default; dedicated later enrollment endpoints may explicitly allow them.

Phase 6a replaces Auth.js JWT wrapping with one hand-rolled opaque database session model for web cookies and app bearer tokens, before a mobile app ships. Sign-in/setup/reset/recovery and sign-out then move to `/api/v1`; scoped link credentials move to their matching API path, preserving scope. No-JavaScript form fallback is dropped then. Sessions use 30-day sliding idle expiry, with the existing 12-hour cutoff for unticked web persistence, hourly activity write limits and session-version/device revocation. That milestone requires schema migration, dedicated security review and an upgrade sign-out notice; none ships in this pilot.

Source: [API direction and phase 0 decisions](../plans/mobile-api.md).
