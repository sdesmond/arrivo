---
title: "Storage adapter health and usage"
type: "feature"
ticket: "2"
created: "2026-10-30"
status: "built"
baseline_revision: "5bb73ad54cce8680fbabf4888dea153d88e57760"
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

**Problem:** Story 5.2 supplies the storage measurements required by CAP-10. Existing storage adapters expose uploads, reads and deletion but cannot prove storage health or measure uploaded bytes.

**Approach:** Extend the existing adapter with `probe(): Promise<void>` and `getUsageBytes(): Promise<number>`. Implement both for local storage, preserving failures for the later Overview reader to present as Unavailable. Include a test-only probe failure mechanism usable across the browser/server process boundary.

## Boundaries & Constraints

**Always:** Follow AD-12: count actual file bytes under the upload root, including documents and covers, excluding transient probes. Preserve upload/read/delete and singleton behavior. Failures reject; empty/missing root measures zero. Use unique probes with cleanup on success and failure.

**Never:** Add UI, routes, migrations, providers, persisted metrics, quotas or jobs. Never report cleanup failure as healthy, follow symlinks, or expose a public fault endpoint.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Healthy probe | Writable root, including not-yet-created root | Create unique probe, verify read-back, delete probe | Resolve only after cleanup |
| Failed probe | Write, read-back, content verification or cleanup fails | No healthy result; attempt cleanup of created probe | Reject with error |
| Concurrent probes | Multiple checks on same root | Independent keys; no upload alteration | Each reports its own outcome |
| Forced failure | Test mode and root-local failure marker | Probe rejects until marker removed | Non-test runtime ignores marker |
| Usage | Empty root or nested uploads | Exact sum of file sizes; empty files contribute zero | Missing root means zero; other I/O errors reject |
| Transient data | Active/leftover probe files and fault marker | Excluded from usage | Reserve one root-level probe directory |
| Changing tree | Upload removed during traversal | Ignore ENOENT for disappeared entries | Permission and other errors reject |
| Symlinks | File/directory symlink below root | Skip link; never traverse target | Other traversal failures reject |

</frozen-after-approval>

## Code Map

- `src/lib/storage/storage-adapter.ts` — existing interface, local factory selection, singleton and test reset; add methods without changing callers.
- `src/lib/storage/local-filesystem-adapter.ts` — sole provider; filesystem operations belong here. Existing `del` swallows errors, so probe cleanup must use strict unlink directly.
- `src/lib/storage/local-filesystem-adapter.test.ts` — real temporary roots plus filesystem mocks; extend before production edits.
- `src/lib/storage/storage-adapter.test.ts` — factory mock and singleton/reset checks; update mock shape and exercise new methods through cached adapter.
- `playwright.config.ts` — test server already sets `E2E_MODE=true`.
- `tests/e2e/feature-map.mjs` — storage selects shared runtime tests. Browser failure proof belongs to later Overview integration; this ticket introduces no user-facing flow.

## Tasks & Acceptance

**Execution:**

- [x] `src/lib/storage/local-filesystem-adapter.test.ts` — first add expanded tests covering every matrix row, including probe read mismatch, cleanup after failure, parallel probes, marker removal, non-test marker immunity, nested UTF-8 byte totals, leftover probes, disappeared files and traversal errors.
- [x] `src/lib/storage/storage-adapter.test.ts` — update factory mock with both methods; verify calls/results/errors remain available through cached instance and cache reset.
- [x] `src/lib/storage/storage-adapter.ts` — document and add required measurement methods to existing interface; preserve configuration and singleton behavior.
- [x] `src/lib/storage/local-filesystem-adapter.ts` — implement strict unique write/read/delete probe and recursive byte traversal. Reserve `.storage-probes/`; check `.storage-probes/force-failure` per call only when `NODE_ENV=test` or `E2E_MODE=true`, allowing future fixtures to toggle failure without restarting server. Ordinary usage excludes this directory even if cleanup left files behind.
- [x] Run targeted storage tests, then required project validation. Record results and limitations without editing ticket state or committing/pushing automatically.

**Acceptance Criteria:**

- Given an adapter obtained through `getStorageAdapter()`, when health and usage measurements run, then both new methods remain accessible across singleton reuse and reset without changing upload/read/delete contracts.
- Given this adapter-only extension, when existing storage tests and project checks run, then existing storage consumers retain their behavior and no new browser-facing flow is introduced.

## Implementation Notes

Added measurement methods without changing existing consumers. Expanded tests first: initial run failed 16 new cases for absent methods; final targeted run passed 36/36. Every I/O matrix row is exercised by the two storage test files. Full verification: lint, TypeScript, production build, 5,635 unit tests and 507 affected E2E scenarios passed. Coverage: lines 97.37%, functions 96.88%, branches 92.7%. Sandbox filesystem denial required approved build/test execution outside sandbox. Usage is a live traversal, not an atomic snapshot.

Build workflow finalization creates a local commit; no push or ticket-state change.

## Plan Change Log

## Review Triage Log

- maybe-false / defer — Concurrent directory replacement between lstat and traversal or probe I/O could follow a newly substituted symlink. Static links are rejected/skipped; exploit requires a concurrent local filesystem writer and was not demonstrated. Medium impact if confirmed; deterministic directory-swap reproduction would settle it.
- false — Workflow override deletions predated this build and user explicitly requested preserving existing changes; implementation changed only four storage files. They are not introduced by story 5.2.

## Design Notes

Return primitives; freshness belongs to later readers. Create probes exclusively. Traverse sequentially, counting logical sizes rather than disk allocation. Live usage is not a filesystem snapshot.

## Verification

- `npx vitest run src/lib/storage/local-filesystem-adapter.test.ts src/lib/storage/storage-adapter.test.ts` — all matrix and singleton cases pass; first expanded run should fail before implementation.
- Invoke `build-validator` after targeted tests pass — lint, TypeScript, coverage and production build; affected E2E runs separately after other checks. Shared-library selection may select all existing features through the affected command; do not launch `npm run test:e2e` directly.
