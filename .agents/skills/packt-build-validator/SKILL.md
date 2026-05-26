---
name: packt-build-validator
description: Use before considering any task that does code changes complete or before committing. To be run on Runs ESLint, TypeScript type checking, Vitest coverage, and a Next.js production build simultaneously using parallel sub-agents to instantly verify project health.
---

# Build Validator Skill

Use this skill to perform a non-blocking, multi-threaded validation of the codebase's health before committing or closing out a feature branch.

## Working Directory

All execution paths must originate from `c:\Users\spenc\dev\packt\`.

## Parallel Execution Plan

You must split the validation workflow into four distinct tasks. Execute them **in parallel** using background workers or sub-agents to avoid blocking the main session. Run all four tasks completely even if one or more encounter immediate errors.

1. **Worker 1 (ESLint):**
   - Command: `cd "c:\Users\spenc\dev\packt" && npm run lint 2>&1`
   - Capture status and any syntax/formatting violations.

2. **Worker 2 (TypeScript compiler):**
   - Command: `cd "c:\Users\spenc\dev\packt" && npx tsc --noEmit 2>&1`
   - Capture static type checking faults.

3. **Worker 3 (Vitest Suite):**
   - Command: `cd "c:\Users\spenc\dev\packt" && npm run test:coverage 2>&1`
   - Capture overall test status along with precise percentages for lines, functions, and branches.

4. **Worker 4 (Next.js Build Profile):**
   - Command: `cd "c:\Users\spenc\dev\packt" && npm run build 2>&1`
   - Capture build integrity and final chunk compilation layout.

## Aggregation & Reporting Rules

Once all four parallel tasks resolve their streams, intercept their raw stdout outputs. Do not dump raw, unformatted console output directly into the main thread history.

Synthesize the data and print exactly this layout block for the user:

```
LINT:      PASS / FAIL
TSC:       PASS / FAIL
TESTS:     PASS / FAIL  (N passed, N failed — coverage: lines X%, functions X%, branches X%)
BUILD:     PASS / FAIL
```

### Formatting Failures

For any section flagged as `FAIL`, iterate over the sub-agent outputs and provide a bulleted summary listing:

- File path and line number
- The exact error snippet
- A brief, localized hint on how to correct it

_Constraint:_ Do not attempt to automatically refactor files or fix the failures yourself. Only evaluate, organize, and report.

### Formatting Success

If all checks return `PASS`, output a confirmation message and append a brief summary of the Next.js production engine's bundle sizes and route generations.
