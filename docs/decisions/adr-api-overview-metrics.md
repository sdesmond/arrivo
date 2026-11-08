# Move overview metric refresh to read endpoints during its API slice

Date: 2026-11-07. Status: accepted.

Accepted. Supersedes [per-metric server-action transport](adr-overview-metrics-refresh-through-per-metric-server-actions-without-persistence.md) for the later admin API migration. Independent metrics become authorized GET endpoints. Keep existing readers, independent refresh/retry, stale last successful values and checked timestamps; do not persist measurements.

This records target transport only. Current overview metrics runtime remains unchanged until its phase 4 slice. This pilot does not create metrics endpoints or rewrite their UI.

Source: [API direction and phase 0 decisions](../plans/mobile-api.md).
