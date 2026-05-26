---
name: packt-build-validator
description: Use before considering any task with code changes complete or before committing. Runs ESLint, TypeScript type checking, Vitest coverage, Playwright E2E, and a Next.js production build in parallel to validate project health.
---

# Build Validator Skill

Use this skill to perform a non-blocking, multi-threaded validation of the codebase's health before committing or closing out a feature branch.

## Working Directory

Run every command from the repository root for the current checkout.
Prefer setting the tool `workdir` to the project root instead of hard-coding a `cd` path in the command itself.

## Parallel Execution Plan

You must split the validation workflow into five distinct tasks. Execute them **in parallel** using background workers or sub-agents to avoid blocking the main session. Run all five tasks completely even if one or more encounter immediate errors.

1. **Worker 1 (ESLint):**
   - Command: `npm run lint 2>&1`
   - Capture status and any syntax/formatting violations.

2. **Worker 2 (TypeScript compiler):**
   - Command: `npx tsc --noEmit 2>&1`
   - Capture static type checking faults.

3. **Worker 3 (Vitest Coverage):**
   - Command: `npm run test:coverage 2>&1`
   - Capture overall test status along with precise percentages for lines, functions, and branches.

4. **Worker 4 (Playwright E2E):**
   - Command: `npm run test:e2e 2>&1`
   - Capture overall scenario status, failing scenario names, and any setup or browser errors.

5. **Worker 5 (Next.js Build Profile):**
   - Command: `npm run build 2>&1`
   - Capture build integrity and final chunk compilation layout.

## Aggregation & Reporting Rules

Once all five parallel tasks resolve their streams, intercept their raw stdout outputs. Do not dump raw, unformatted console output directly into the main thread history.

Synthesize the data and print exactly this layout block for the user:

```
LINT:      PASS / FAIL
TSC:       PASS / FAIL
COVERAGE:  PASS / FAIL  (N passed, N failed — coverage: lines X%, functions X%, branches X%)
E2E:       PASS / FAIL  (N scenarios passed, N failed)
BUILD:     PASS / FAIL
```

### Formatting Failures

For any section flagged as `FAIL`, iterate over the sub-agent outputs and provide a bulleted summary listing:

- File path and line number when available
- The exact error snippet
- A brief, localized hint on how to correct it

_Constraint:_ Do not attempt to automatically refactor files or fix the failures yourself. Only evaluate, organize, and report.

### Formatting Success

If all checks return `PASS`, output a confirmation message and append a brief summary of the Next.js production engine's bundle sizes, route generations, and E2E scenario totals.
