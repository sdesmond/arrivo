---
name: feedback-halt-between-build-stages
description: Never auto-advance past a bmad-build checkpoint — a checkpoint-prompt answer like "[A] Approve" is NOT the cross-boundary confirmation
metadata:
  type: feedback
---

In any `bmad-build` (or equivalent plan → implement → review) flow, HALT at each of the three stage boundaries — after planning, after implementation, after code review — and wait for a NEW, explicit user message saying to proceed. Workflow step files (step-02, step-03, …) attempt to advance automatically; do not let them.

**Why:** I answered the step-02 "CHECKPOINT 1" prompt, the user chose `[A] Approve`, and I treated that as permission to launch step-03 implementation bookkeeping in the same turn. That crossed the after-planning boundary without a fresh confirmation. The user then hardened the rule in AGENTS.md, but the recurring root cause is conflating "the user approved the spec" with "the user permits implementation to start."

**How to apply:** Answering a checkpoint prompt (e.g. "[A] Approve", "looks good", "proceed") does NOT cross a boundary. Crossing requires a fresh "proceed/continue/go" message typed AFTER you post the boundary status. Concretely: after approval, post a short status ("what finished, what's next"), then a single "Proceed?" question, then stop all tool calls until the user responds. No source/test/E2E edits and no implementation-subagent dispatch in the same turn as, or before, the confirm message — only spec/sprint-status bookkeeping (frontmatter status flip, baseline_commit capture, sprint-status.yaml sync) may run before it.
