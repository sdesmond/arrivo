---
name: feedback-no-direct-commits-to-protected-branches
description: Never commit directly to main or feature/*/feat/* branches — always create a new branch and open a PR into them
metadata:
  type: feedback
---

Never `git commit` directly onto `main` or any `feature/*` / `feat/*` branch, even when the branch is currently checked out and appears to accept the push. Always create a new branch off it and open a PR targeting it instead.

**Why:** The user corrected this after I committed and pushed a chore commit straight onto `feat/trip-sharing`. `main` is server-side protected (confirmed via `gh api repos/.../branches/main/protection` — requires PRs), and the same workflow rule applies to `feature/*`/`feat/*` branches even where GitHub branch protection isn't actually configured on them yet — the absence of a 404 from the protection API is not permission to commit directly.

**How to apply:** Before committing, check the current branch name. If it is `main` or matches `feature/*` / `feat/*`, stop and create a new branch first (e.g. `chore/...`, `fix/...`), commit there, push it, and open a PR into the `main`/`feature`/`feat` branch instead of committing to it directly. If a direct commit already landed and was pushed, fix it non-destructively: `git revert` the accidental commit on the protected branch (push the revert), then `git cherry-pick` (not `git rebase` — rebase onto a branch whose tip already contains your commit as an ancestor silently drops it as "already applied") the original commit onto a fresh branch and open the PR from there.
