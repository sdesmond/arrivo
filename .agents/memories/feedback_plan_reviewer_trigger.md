---
name: feedback_plan_reviewer_trigger
description: packt-plan-reviewer only runs on story files and implementation-ready plan files, not on PRDs, UX specs, or brainstorming outputs
metadata:
  type: feedback
---

Run `packt-plan-reviewer` only on story files and fully fleshed-out implementation-ready plan files — artifacts about to be handed to a developer.

**Why:** The reviewer checks implementation-readiness (test coverage, scope, architecture fit). That check is meaningless on a PRD, UX spec, architecture doc, or brainstorming output — those aren't ready for code yet.

**How to apply:** Skip the reviewer after `bmad-create-prd`, `bmad-create-ux-design`, `bmad-brainstorming`, or any other intermediate planning skill. Run it only after `bmad-create-story`, `bmad-dev-story` plan files, or equivalent implementation-ready artifacts.
