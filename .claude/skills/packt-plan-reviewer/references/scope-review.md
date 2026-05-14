# Scope Review

Verify the plan stays within the boundaries of the original request. Your goal is to protect the developer from implementing work that wasn't asked for — which adds risk, review burden, and complexity without corresponding value.

## What to Assess

**Unrequested features** — functionality not mentioned in the original request. A bug fix plan that also adds a new filter feature is out of scope, even if the feature is related and useful.

**Unrequested refactoring** — restructuring, renaming, or reorganizing code in files not directly involved in the task. "While we're here" cleanups belong in separate PRs. Key phrases to flag: "clean up", "refactor", "reorganize", "simplify" applied to files the task doesn't need to touch.

**Premature abstraction** — new shared utilities, custom hooks, context providers, or components created for a single consumer. A new abstraction is justified only when it will be used in 3+ places immediately, or the alternative is demonstrably complex. Flag single-consumer abstractions.

**Backwards-compatibility shims** — re-exports, deprecated wrappers, compatibility aliases, or migration helpers for things not used elsewhere. If the old interface has no consumers outside the changed file, just change it directly.

**"While we're here" styling or naming** — variable renames, file reformatting, or style tweaks in files the task doesn't require touching.

**Over-specified implementation details** — prescribing specific variable names, internal file structure, or internal organization details that aren't necessary to state at planning time. Flag as WARNING only — this isn't blocking.

## Output Format

Restate the original request in one sentence to confirm understanding. Then report:

```
SCOPE REVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Original request: [one-sentence summary]

IN SCOPE ✓
  - [plan items that directly address the request]

OUT OF SCOPE ✗

  [plan step or item]
    Severity: BLOCKING / WARNING
    Reason: [why this exceeds the request]
    Suggested Fix: [exact change — e.g., "Remove step 4. If this cleanup is needed, create a separate task for it." or "Remove the shared hook — inline the logic in the single component that uses it."]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCKING: N  |  WARNINGS: M
```

BLOCKING: unrequested features, refactoring of unrelated code, single-consumer abstractions.
WARNING: over-specified implementation details, minor adjacent style fixes.

If everything is in scope: "All plan items are within scope." with no further findings.
