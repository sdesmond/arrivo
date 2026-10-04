---
name: packt-build-validator
description: Use before considering any task with code changes complete or before committing. Runs ESLint, TypeScript type checking, Vitest coverage, Playwright E2E, and a Next.js production build in parallel to validate project health.
---

# Build Validator Skill

Use this skill to perform a non-blocking, multi-threaded validation of the codebase's health before committing or closing out a feature branch.

## Working Directory

Run every command from the repository root for the current checkout.
Prefer setting the tool `workdir` to the project root instead of hard-coding a `cd` path in the command itself.

## Step 0 — Precondition: skip if nothing changed since the last PASS

This skill is idempotent. Before launching any workers, check whether the working tree is already
validated so repeat invocations (e.g. once when a sub-task feels done, again before commit) do no
redundant work.

1. Ask the fingerprint marker whether this exact tree already passed at the current E2E scope,
   computing the scope inline (shell state does not persist between calls):
   `node scripts/validator-fingerprint.mjs check --scope="$(node scripts/affected-e2e.mjs --format=scope)"`
   (Scope is `full`; `none` when no impacted features; or a comma-separated list of `@feat:` tags.)
2. If the JSON response has `"skip": true`, print exactly:
   `Already validated (no source changes since last PASS) — skipping.`
   and **STOP**. Do not launch the five workers.
3. Otherwise continue to the Parallel Execution Plan below.

The marker lives at `node_modules/.cache/packt-build-validator/last-pass.json` (git-ignored). It is
keyed on a hash of `HEAD` + all uncommitted/untracked source, so any edit since the last pass forces
a real run; an unchanged tree is a no-op.

## Parallel Execution Plan

Run the five commands below concurrently as background shell commands — no sub-agents; each is a single deterministic command. Let all five finish even if one fails early.

Each command writes its full output to a log file so raw output never enters the session:

- Create the log dir first: `mkdir -p node_modules/.cache/packt-build-validator/logs` (git-ignored, beside the pass marker). Shell state does not persist between calls, so every command uses this literal path.
- Launch each command with the shell tool's background mode, redirecting to its log, e.g. `npm run lint > node_modules/.cache/packt-build-validator/logs/lint.log 2>&1`. Give E2E a long background timeout (up to 2h) — it is the slowest worker.
- Wait for the completion notifications; don't poll. The exit code decides PASS/FAIL.
- Read logs selectively: `tail` for the summary lines, `grep` for errors/failing scenarios. Never `cat` a whole log.

1. **Worker 1 (ESLint):**
   - Command: `npm run lint > node_modules/.cache/packt-build-validator/logs/lint.log 2>&1`
   - Capture status and any syntax/formatting violations.

2. **Worker 2 (TypeScript compiler):**
   - Command: `npx tsc --noEmit > node_modules/.cache/packt-build-validator/logs/tsc.log 2>&1`
   - Capture static type checking faults.

3. **Worker 3 (Vitest Coverage):**
   - Command: `npm run test:coverage > node_modules/.cache/packt-build-validator/logs/coverage.log 2>&1`
   - Capture overall test status along with precise percentages for lines, functions, and branches.

4. **Worker 4 (Playwright E2E):**
   - Command: `npm run test:e2e:affected > node_modules/.cache/packt-build-validator/logs/e2e.log 2>&1`
   - Runs only the E2E features impacted by the current change set (uncommitted work, or the last
     commit when the tree is clean), per `tests/e2e/feature-map.mjs`. Docs/unit-test-only changes
     skip E2E entirely (`No affected E2E features — skipping.` → report `E2E: SKIPPED`); a
     cross-cutting/shared change runs the full suite automatically.
   - Always run the affected subset here. Do **not** run the full `npm run test:e2e` — a complete
     pass is the user's call, not part of this gate.
   - Capture overall scenario status, failing scenario names, and any setup or browser errors.

5. **Worker 5 (Next.js Build Profile):**
   - Command: `NEXT_DISTDIR=.next-validate npm run build > node_modules/.cache/packt-build-validator/logs/build.log 2>&1`
   - Builds into an isolated `.next-validate` dir (never the default `.next`) so this never races or
     corrupts a concurrently running `npm run dev` session, which compiles into `.next` on every request.
   - Capture build integrity and final chunk compilation layout.

## Aggregation & Reporting Rules

Once all five commands finish, build the report from their exit codes and targeted reads of each log. Do not paste raw log output into the session.

Synthesize the data and print exactly this layout block for the user:

```
LINT:      PASS / FAIL
TSC:       PASS / FAIL
COVERAGE:  PASS / FAIL  (N passed, N failed — coverage: lines X%, functions X%, branches X%)
E2E:       PASS / FAIL / SKIPPED  (N scenarios passed, N failed — SKIPPED when no impacted features)
BUILD:     PASS / FAIL
```

### Formatting Failures

For any section flagged as `FAIL`, provide a bulleted summary from that command's output listing:

- File path and line number when available
- The exact error snippet
- A brief, localized hint on how to correct it

_Constraint:_ Do not attempt to automatically refactor files or fix the failures yourself. Only evaluate, organize, and report.

On **any** `FAIL`, clear the pass marker so the next invocation re-validates even if no further edits
land: `node scripts/validator-fingerprint.mjs clear`.

### Formatting Success

If all checks return `PASS`, record the pass marker so an immediate re-invocation on the unchanged
tree short-circuits at Step 0:
`node scripts/validator-fingerprint.mjs record --scope="$(node scripts/affected-e2e.mjs --format=scope)"`
(recomputed inline; the tree is unchanged since Step 0, so it matches the scope checked there).

Then output a confirmation message and append a brief summary of the Next.js production engine's bundle sizes, route generations, and E2E scenario totals.
