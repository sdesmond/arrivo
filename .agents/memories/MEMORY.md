# Memory Index

- [Trip View Backlog](project_trip_view_backlog.md) — Checklist of unimplemented/placeholder features in trip detail and day planner views (audited 2026-05-03)
- [Field error aria-live intentional](feedback_field_error_aria_live.md) — role="status" + aria-live="polite" on Field errors is intentional (prevents announcements on every keystroke); do not flag as a11y issue
- [Plan reviewer trigger](feedback_plan_reviewer_trigger.md) — plan-reviewer runs only on story files / implementation-ready plans, not on PRDs, UX specs, or brainstorming outputs
- [E2E unique trip startDate](feedback_e2e_unique_trip_startdate.md) — Dedicated E2E trips must use a startDate distinct from the base seed trip (2026-07-01) or parallel base-trip lookups become non-deterministic
- [Validator failures = Vite cache collision](project_validator_failures_are_contention.md) — Coverage/E2E crashes under the parallel validator were two Vitest processes sharing node_modules/.vite; fixed with per-config cacheDir (suites pass standalone)
- [E2E postcss worker storm](project_e2e_postcss_worker_storm.md) — webServer "Zone Allocation failed"/error 1450 = orphaned .next-e2e postcss.js workers exhausting commit charge; kill them + delete .next-e2e
- [No direct commits to protected branches](feedback_no_direct_commits_to_protected_branches.md) — Never commit to main/feature/_/feat/_ directly; branch off and PR into them instead
- [Native arm64 runners when public](project_native_arm64_runners.md) — Deferred: once the repo is public, swap publish-images.yml's QEMU build for per-arch native jobs + manifest merge (full YAML inside)
- [GitHub CLI needs elevated sandbox access](feedback_gh_needs_elevated_sandbox.md) — Run authenticated gh commands outside the sandbox so Windows keyring credentials are available
