# API initiative branch workflow

Applies to every epic, story entry, story file, and build plan under this initiative, including future work.

- Integration/base branch: `feature/api-v1`.
- Build each story on its own branch created from the latest `feature/api-v1`.
- Open every story PR with `feature/api-v1` as its base/target branch.
- Do not build or commit story changes directly on `feature/api-v1`. Do not target `main` for a story PR.
- Add an explicit Branch workflow note to every new epic and story file, and preserve it during refinement and handoff.
- Put the same policy in each new `[[entry]]` table's `notes` array in `tickets.toml`, so `tickets.py pull` copies it into the story. Add this file to that entry's `references`.
- Build plans must record both the actual story branch and PR base `feature/api-v1`; verify the PR base before opening it.
- After opening a story PR, switch back to `feature/api-v1`.
- Before creating any story branch, `git switch feature/api-v1` and pull the latest (`git pull --ff-only`), so the branch starts from the integration branch with every merged prerequisite.
- Before starting a later story, use the updated integration branch containing its completed prerequisites.

Required story note:

> Base branch: feature/api-v1. Build each story on its own branch created from the latest feature/api-v1; open its PR with feature/api-v1 as the base/target. Do not build or commit stories directly on feature/api-v1, and do not target main. After opening the PR, switch back to feature/api-v1; before creating the next story branch, pull the latest feature/api-v1.

This policy records branch routing; it does not create branches, commit, push, or open PRs by itself.
