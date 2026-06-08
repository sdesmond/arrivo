---
name: feedback_e2e_unique_trip_startdate
description: E2E dedicated trips must use a startDate distinct from the base seed trip (2026-07-01)
metadata:
  type: feedback
---

Every dedicated trip an E2E feature seeds must use a `startDate` distinct from the base seed trip's `E2E_TRIP.startDate` (`2026-07-01`).

**Why:** The shared base trip is looked up by `startDate = E2E_TRIP.startDate` in several step files (`getDay1Context` and `"I have an existing trip"`/`getBaseTripId`). If another feature seeds a second trip reusing that startDate, the `[trip] = select(...)` lookup becomes non-deterministic under parallel workers — it can return the wrong (often dayless) trip, surfacing as sporadic "Seeded E2E trip not found" or empty packing/checkbox failures. This bit both `documents` @docs-empty (was reusing the base startDate) and the trip-rename scenario.

**How to apply:** When a feature needs its own trip, seed it via a tagged `Before` hook that inserts trip + collaborator and calls `setTripIdOverride(trip.id)` (see `documents.steps.ts`), and give it a unique startDate (e.g. 2026-09/2026-10). Never mutate the base trip's name/dates/days in a non-isolated scenario. Related: [[feedback_e2e_self_seeding]], [[project_e2e_env_flakiness]].
