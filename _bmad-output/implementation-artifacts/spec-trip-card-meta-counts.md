---
title: "Fix trip list card meta counts (days, docs, collaborators)"
type: "bugfix"
created: "2026-06-06"
status: "done"
route: "one-shot"
---

## Intent

**Problem:** Trip list cards showed "days" / "docs" without numeric counts, and always showed 0 for collaborators — because `listTripsForUser` never populated `trip.docs` or `trip.collaborators`, and the card rendered `pluralize(count, "day")` (word only) instead of `${count} ${pluralize(count, "day")}`.

**Approach:** Batch-fetch trip-level docs and collaborators in `listTripsForUser` (4 parallel queries replacing N×5 sequential queries), populate `trip.docs` and `trip.collaborators` on the returned objects, and prepend the numeric count to the days/docs label in `TripCard`.

## Suggested Review Order

1. [`src/lib/queries.ts:89`](../../../src/lib/queries.ts) — `listTripsForUser` refactored: single trip fetch → 4 bulk parallel queries + in-memory grouping; `trip.docs` and `trip.collaborators` now populated
2. [`src/components/packt/trip-card.tsx:148`](../../../src/components/packt/trip-card.tsx) — Meta row: days and docs now show `{count} {word}`; AvatarStack guarded against empty array
3. [`src/components/packt/trip-card.test.tsx:102`](../../../src/components/packt/trip-card.test.tsx) — Doc count test updated to "3 docs"; day count test added; empty-collaborators AvatarStack test added
