---
name: feedback-no-manual-e2e-before-validator
description: Don't run E2E manually before build-validator; the validator runs affected E2E itself and cannot reuse a manual run
metadata:
  type: feedback
---

Before build-validator, run only targeted Vitest. Don't launch `run-e2e.mjs` yourself, because build-validator runs `npm run test:e2e:affected` and has no way to reuse an earlier run, so E2E would run twice.

**Why:** In the epic 5 remediation (2026-11-21) I started a manual affected E2E run before the validator. The user caught it ("you're not running them twice are you?") and I stopped it halfway.

**How to apply:** Run a manual E2E only to debug a specific failing scenario with a narrow `--grep`, never as a pre-validator gate. Related: [[feedback-strip-ansi-from-tool-output]].
