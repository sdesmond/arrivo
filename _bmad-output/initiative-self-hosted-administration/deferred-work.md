- source_plan: `_bmad-output/initiative-self-hosted-administration/epic-instance-foundation/story-instance-state-roles-and-bootstrap-signup-plan.md`
  summary: Run migration 0004 against a real Postgres with 0, 1 and several users to prove promotion, singleton creation and the multi-account halt.
  evidence: Current tests only regex the SQL text (scripts/migrations.test.mjs); unverified behavior is unrecoverable on a real upgrade, which the halt guards.
