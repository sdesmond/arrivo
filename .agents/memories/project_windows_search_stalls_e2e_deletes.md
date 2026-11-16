---
name: project_windows_search_stalls_e2e_deletes
description: On the Windows dev box, Windows Search indexes the repo; its handle on a fresh large file makes fs unlink block 30-90 s (no error). Fixed for .e2e-storage by marking it not content indexed.
metadata:
  type: project
---

The repo (`C:\Users\spenc\dev\arrivo`, under the user profile) is in the live Windows Search index, including `.e2e-storage`, `.next`, and `.next-e2e`. The indexer opens new files without delete sharing and holds an oplock, so a delete of a just-written large file (the 25 MiB API document uploads) **blocks** inside `unlink` until the indexer lets go: 34-90 s were measured. It is not EBUSY, and other processes can still read and write the file. That was the cause of the intermittent `afterEach` 30 s timeout on the "exactly at the 25 MiB limit" scenarios (fixed 2026-11-15 on `fix/e2e-storage-not-indexed`: `resetE2EStorage` runs `attrib +I` on the storage roots, and new children inherit it).

**Why:** the stall looked like load, concurrency, or DB-lock flakiness. It was none of those: it reproduced with a single worker active and stopped completely once the folder was marked not content indexed (0/120 vs 4/105 unlinks over 10 s).

**How to apply:** if a Windows-only E2E or script hangs in a file delete or rename of a fresh file, suspect the indexer before the app. Wrap each fs call with a timer and a `process.getActiveResourcesInfo()` dump. Probe the same file from a child process: if read/write opens succeed while the delete hangs, it is an oplock holder. To exclude a new directory the tests write into, mark it `attrib +I` when it is created. Defender ignores that flag, so it is also an A/B test against AV. No admin rights are needed. handle.exe isn't installed and needs admin anyway. Related: [[project_e2e_postcss_worker_storm]], [[project_validator_failures_are_contention]].
