# Test Coverage Review

Verify that the plan includes adequate test coverage for every file it touches and every user-facing flow it introduces. Missing tests for covered files are always BLOCKING — there is no circumstance where a new feature ships without a test plan.

Grep `src/` to check whether test files already exist before flagging a file as untested.

## Coverage Scope

Under coverage enforcement (≥95% lines/functions, ≥90% branches):

- `src/lib/**` — utilities and helpers
- `src/components/packt/**` — all domain components

**Excluded from coverage** — no test requirement:

- `src/lib/auth-helpers.ts`
- `src/lib/queries.ts`
- `src/lib/server-now.ts`
- `src/components/ui/**`
- `src/app/**`

## What to Assess

**Colocated unit tests for every covered source file**

For each file the plan proposes creating or modifying in `src/lib/**` or `src/components/packt/**`:

- Does the plan include a step to create or update the colocated test file (`foo.ts` → `foo.test.ts`, `foo.tsx` → `foo.test.tsx`)?
- If new exported functions, branches, or component props are added, are they mentioned for testing?

Always BLOCKING if a covered file is added or modified with no test step planned. Always check whether the test file already exists before flagging — if it exists and the plan says to update it, that's sufficient.

**E2E scenario for new user-facing flows**

If the plan introduces or significantly changes a user-facing flow (authentication, trip creation/editing/deletion, day planning, collaborator management, or any new feature), it must include:

- A `.feature` file addition or update in `tests/e2e/features/`
- Corresponding step definitions in `tests/e2e/steps/`

Always BLOCKING if a new or significantly changed user-facing flow has no E2E coverage planned.

**Test file placement**

- Unit/component tests must be colocated: `src/components/packt/foo.test.tsx` next to `src/components/packt/foo.tsx` — never in a separate `__tests__/` directory.
- E2E tests must go in `tests/e2e/features/` (Gherkin) and `tests/e2e/steps/` (step definitions).

Flag wrong placement as BLOCKING.

**Per-file mocks of `next/navigation` or `next/headers`**

These are globally mocked in `vitest.setup.mts`. Per-file re-mocking is unnecessary and creates drift. Flag as BLOCKING if planned.

## Output Format

Start by listing every covered file the plan touches and whether a test step is planned for each:

```
TEST COVERAGE REVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Original request: [one-sentence summary]

COVERED FILES
  src/lib/foo.ts                      → test step planned ✓ / MISSING ✗
  src/components/packt/bar.tsx        → test step planned ✓ / MISSING ✗

NEW USER-FACING FLOWS
  [flow name]                         → E2E planned ✓ / MISSING ✗

FINDINGS

[finding]
  Severity: BLOCKING / WARNING
  File: [path]
  Suggested Fix: [concrete change — e.g., "Add a step: 'Update src/components/packt/event-card.test.tsx to cover the new `compact` prop — test both compact=true and compact=false render output.'" or "Add a .feature file in tests/e2e/features/collaborator-invite.feature covering the invite flow."]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCKING: N  |  WARNINGS: M
```

BLOCKING: covered file modified with no test step, new user-facing flow with no E2E, tests in wrong location, per-file mocking of `next/navigation` or `next/headers`.
WARNING: test step is vague ("add tests") without specifying cases for complex logic.

If all covered files and flows have test steps planned: "All covered files and flows have test steps planned."
