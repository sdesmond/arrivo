- source_plan: `_bmad-output/plan-profile-picture.md`
  summary: Serialize overlapping avatar uploads so a concurrent upload cannot orphan a file.
  evidence: Two uploads by one user both read the same previous URL; only one new file is referenced, the other is never deleted.
- source_plan: `_bmad-output/plan-profile-picture.md`
  summary: Throttle avatar uploads per user.
  evidence: `processAvatarImage` decodes up to 25 MP per call and nothing limits repeat calls; size and pixel caps only bound one request.
- source_plan: `_bmad-output/plan-profile-picture.md`
  summary: Unit-assert `image` in the `getUserById` select.
  evidence: `queries.test.ts` never sets or asserts `image` for the profile user; only the profile E2E reload covers it.
- source_plan: `_bmad-output/plan-profile-picture.md`
  summary: Add an E2E showing a collaborator's photo on a trip card or the share dialog.
  evidence: Collaborator photos are verified by component unit tests and a select-shape assertion, not through a second seeded user.
