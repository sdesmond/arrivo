---
name: feedback-gh-needs-elevated-sandbox
description: Run authenticated GitHub CLI commands with require_escalated so the Windows keyring token is available
metadata:
  type: feedback
---

Run authenticated `gh` commands with `sandbox_permissions: "require_escalated"`. The sandbox cannot access the Windows keyring token and reports an invalid token / HTTP 401 even while the user is logged in.

**How to apply:** For `gh pr create`, `gh api`, `gh auth status`, or other GitHub API calls, request scoped escalation at first use. Do not first report sandbox authentication failure to the user or ask them to log in unless the escalated command also fails.
