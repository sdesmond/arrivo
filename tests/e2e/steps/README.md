# E2E step files

One `*.steps.ts` per feature area. Do not grow a catch-all file; add a new file when none fits.

## `/api/v1` steps

Steps for `api.feature` live in `api-<resource>.steps.ts`, one per API resource or flow (`api-days`, `api-sharing`, `api-packing-lists`, ...). Pick the file by what the endpoint changes:

- Checklists: `api-checklist-writes` (generic keyed writes and replay), `-lifecycle`, `-items`, `-sources`, `-write-matrix`.
- Day timeline: `api-event-create`, `-event-edit`, `-event-delete`, `-day-order`, `-day-notes`, `-days`, `-itinerary-replay`.
- Trip: `api-trip-notes`, `-trip-metadata`, `-trip-currency`, `-sharing`, plus the older `api-trip-dates`, `-create-trip`, `-trip-delete`, `-trip-snapshot`.
- Packing: `api-packing-items`, `-packing-create`, `-packing-order`, `-packing-lists`, `-packing-template-save`, `-packing-template-pull`, `-packing-templates`.
- Reservations and deletion records: `api-reservation-read`, `api-cascade-replay`.
- Cookies and API metadata: `api-session`.

Rules:

- State and helpers private to one resource stay in that file. Once a second file needs one, move it to `tests/e2e/api-support.ts` and export it. That module holds no steps.
- Keep a file's state in its own `WeakMap<Page, ...>`, not on a shared object.
- Register each new step file in `tests/e2e/feature-map.mjs` (`API_STEP_STEMS` for `api-*`, or the entry of the feature that uses it); `scripts/feature-map.test.mjs` fails on a dead path.
