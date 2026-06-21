# Tutorial / Onboarding Backlog

Running list of app pieces that warrant a "first time visiting this piece" or initial-walkthrough tutorial moment. Collected as they come up during planning/architecture work, not yet scoped or designed — for a future onboarding/tutorial initiative.

## Items

- **Open the app once before going offline.** Offline support (pinned trips) depends on the service worker having installed during a prior online visit. A user who has never opened Packt has no offline fallback at all, and a trip that was never pinned/Smart-Pinned won't have data available on a cold offline open. Surfaced during offline-storage architecture (`_bmad-output/planning-artifacts/architecture.md`, 2026-06-21) — candidate for a "before your trip" nudge or first-run walkthrough step.
