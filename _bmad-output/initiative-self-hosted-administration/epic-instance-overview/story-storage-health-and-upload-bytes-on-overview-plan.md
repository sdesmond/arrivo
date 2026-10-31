---
title: "Storage health and upload bytes on Overview"
type: "feature"
ticket: "3"
created: "2026-10-30"
status: "built"
baseline_revision: "954305778b889fa104ee4b0ecb213450003e0a6b"
route: "full"
route_source: "auto"
risk: "medium"
review: "quick"
review_source: "pinned"
lenses_ran: [quick]
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Overview lacks document-storage health and upload-storage usage despite the adapter already exposing both measurements.

**Approach:** Add two independent server readers and read-only Overview rows using the existing metric contract and storage adapter. Report health as Healthy and usage with decimal KB/MB/GB/TB/PB units rounded to two places, with exact bytes on hover; failed measurements become Unavailable with their own checked times.

## Boundaries & Constraints

**Always:** Acquire storage through `getStorageAdapter()` inside each measurement's error boundary. Health calls `probe()`; usage calls `getUsageBytes()`. Preserve independent results and timestamps even when another reader fails. Keep page-level `requireAdmin()` and `connection()`, settings-width layout, semantic definition-list rows, and CSS variable styling. Use the existing real-clock measurement contract rather than mock itinerary time. Count actual upload bytes, including covers, excluding adapter probes.

**Never:** Add direct filesystem access to application readers/page, infer database size or host capacity, add persisted metrics, providers, schema changes, or expose a fault endpoint. Refresh/Retry/stale controls belong to ticket 5.6; trip/document counts and Activity belong to later tickets. Do not change adapter behavior or ticket state.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Healthy storage | Probe succeeds, usage returns nonzero bytes | Healthy and exact bytes; both have checked times | No error expected |
| Empty storage | Usage returns zero | Valid `0 bytes` result | Never treat zero as unavailable |
| Probe fails | Probe rejects, usage succeeds | Health Unavailable; usage still displays bytes | No exception/error detail reaches UI |
| Usage fails | Usage rejects, probe succeeds | Usage Unavailable; health remains Healthy | No zero fallback |
| Adapter unavailable | Factory/configuration throws | Affected reader returns Unavailable and checked time | Acquisition is inside measurement boundary |
| Recovery | Fault marker removed, page requested again | Health becomes Healthy; usage remains measured | No restart or persisted failure |

</frozen-after-approval>

## Code Map

- `src/lib/overview-readers.ts` — server-only readers; reuse `measureMetric` for sync/async errors and ISO checked times.
- `src/lib/storage/storage-adapter.ts` — singleton provides both APIs; inject existing interface methods for tests. No new types.
- `src/lib/storage/local-filesystem-adapter.ts` — excludes `.storage-probes/`; `.storage-probes/force-failure` works under E2E_MODE. No changes.
- `src/app/(app)/admin/overview/page.tsx` — 42 lines, parallel readers, five rows. Existing `MetricRowProps` supports strings/numbers; reuse unchanged.
- `tests/e2e/steps/admin-overview.steps.ts` — scope Healthy assertion to Database; update checked-time count to seven. Existing member scenario proves denial.
- `scripts/e2e-storage.mjs` exports E2E root; `tests/e2e/fixtures.ts` exports After/scenario cleanup state. Feature map already covers runtime paths.

## Tasks & Acceptance

**Execution:**

- [x] `src/lib/overview-readers.test.ts` — first add tests for successful health/usage, exact nonzero and zero bytes, individual rejections, independent simultaneous outcomes, injected checked times, default factory delegation, and factory exceptions. Confirm expanded tests fail before production changes.
- [x] `tests/e2e/features/admin-overview.feature`, `tests/e2e/steps/admin-overview.steps.ts` — extend admin scenario: healthy storage, seven checked times, exact bytes, forced probe failure with successful usage/DB/version, recovery on reload. Create scenario-owned upload; compare UI to independent root enumeration using bounded retries with stable before/after totals. Never assume empty root/reset storage. Keep health assertions in one scenario to avoid marker races; unconditional After cleanup removes owned file/marker after failures too. No serial tags or shared reseeding.
- [x] `src/lib/overview-readers.ts` — implement separate health/usage readers through adapter and metric wrapper; no shared success/failure result.
- [x] `src/app/(app)/admin/overview/page.tsx` — add parallel metrics and Document storage/Upload storage rows. Pass numeric usage to MetricRow with byte formatting; preserve unavailable union. Test decimal unit boundaries and exact-byte hover text in `src/components/arrivo/metric-row.test.tsx`.
- [x] Run targeted reader tests and affected browser coverage, then project validation through build-validator; record evidence in Implementation Notes.

**Acceptance Criteria:**

- Given an admin requesting Overview, when measurements complete, then both storage rows appear beside existing metrics with labeled values and individual checked times.
- Given a member requesting Overview, when authorization runs, then existing not-found behavior remains enforced.
- Given a browser session with scenario-owned uploads and a controllable probe fault, when the page is reloaded through healthy, failed and recovered states, then rendered values match the matrix without altering uploaded content.

## Implementation Notes

- Added independent storage health and upload-byte readers through the existing metric wrapper; adapter acquisition errors remain contained within each measurement.
- Overview reads both metrics in parallel and renders Document storage plus exact Upload storage bytes with independent checked times.
- Expanded reader tests failed first with seven missing-reader failures, then passed all 15 tests via `npx vitest run src/lib/overview-readers.test.ts`.
- Targeted ESLint passed for the two reader files, Overview page, and browser step definitions.
- `npm run test:e2e:affected` passed all 11 selected tests (account-menu and admin-overview), including both Overview scenarios.
- Browser coverage creates scenario-owned document and cover files, compares independently enumerated bytes across stable before/after totals, forces probe failure, verifies independent successful metrics, then verifies recovery and unchanged uploaded contents. Cleanup removes scenario-owned files and fault marker after failures too.

- Build-validator: lint, TypeScript, production build, and coverage passed (5,642 tests; lines 97.37%, functions 96.89%, branches 92.7%). Build generated 16 pages; bundle sizes were not reported by this Next.js build.
- Validator E2E retry exited because port 3001 was occupied by a separate full suite. User requested cancellation of this run; no further E2E launched. Earlier affected run passed 11/11. No final PASS fingerprint recorded.

- Display follow-up: 29 targeted tests passed after 9 expected failures before implementation. Lint, TypeScript, and production build passed. Coverage passed all 5,653 tests with `npm run test:coverage -- --maxWorkers=4`: lines 97.38%, functions 96.89%, branches 92.7%. Default-worker runs hit unrelated account-dialog timing failures; all 57 tests in those three files passed directly. Updated browser assertions were not run, respecting user cancellation.

## Plan Change Log

- User changed display requirement after first commit: readable decimal storage units with exact bytes on hover. MetricRow owns presentation; readers retain exact numeric bytes. Browser assertions now validate rounded units plus exact title, using a scenario-owned MB-size document. User canceled further agent E2E runs while running suite separately.

## Review Triage Log

- Display follow-up quick review: no findings.

- Quick review: no findings; nothing deferred. Matrix audit: passing reader tests cover healthy/empty results, independent probe/usage failures, and factory exceptions; passing Overview browser scenario covers forced failure and recovery without changing uploaded contents.
## Design Notes

Keep exact bytes in native hover title to preserve verification evidence while visible usage uses readable decimal units. Application code never traverses files; independent filesystem enumeration belongs only to browser-test assertions. Usage is a live measurement, not an atomic filesystem snapshot.

## Verification

- `npx vitest run src/lib/overview-readers.test.ts` — expanded tests fail first, then pass with all reader cases.
- `npm run test:e2e:affected` — admin Overview scenarios pass, including real adapter fault/recovery and bytes.
- `build-validator` — lint, TypeScript and build, then coverage alone, then affected E2E alone; no automatic full-suite invocation.
