---
name: project_e2e_postcss_worker_storm
description: E2E webServer dying with "Zone Allocation failed" / error 1450 at tiny heaps = thousands of orphaned .next-e2e postcss.js workers exhausting commit charge; kill them and delete .next-e2e
metadata:
  type: project
---

If the E2E webServer (`npm run dev -- -p 3001`, `NEXT_DISTDIR=.next-e2e`) fails to start with `FATAL ERROR: Zone Allocation failed - process out of memory` at a ~5–10 MB heap, `memory allocation of N bytes failed`, or `PostQueuedCompletionStatus: (1450) Insufficient system resources`, the machine is out of **commit charge**, not RAM (free physical memory can still look fine).

Seen 2026-09-28: an E2E run killed mid-flight (session interrupted) left ~3,800 orphaned `node .next-e2e\dev\build\postcss.js <port>` processes (parent PID gone) holding ~110 GB commit. Every later E2E start crashed, and a fresh start re-spawned the storm (100+ workers within seconds) until the `.next-e2e` cache was deleted.

**Why:** the interrupted Turbopack dev server leaves its postcss worker pool orphaned and its `.next-e2e` cache in a state that makes the next dev server spawn workers without bound.

**How to apply:**

1. Diagnose: `Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory` (CommittedBytes vs CommitLimit) and group `node.exe` by CommandLine — look for `*\.next-e2e\dev\build\postcss.js*`.
2. Kill only those orphans (filter on that command line), then `Remove-Item -Recurse -Force .next-e2e` (regenerated build cache).
3. Rerun. While running, a watcher on the postcss worker count (>50 = storm) catches a recurrence early.
   It is not caused by app code — don't debug the change set. Related: [[project_validator_failures_are_contention]], [[project_e2e_env_flakiness]].
