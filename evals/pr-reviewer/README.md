# PR reviewer eval

Scores a model + prompt pair on the structural PR review. The `opencode` runner tries free Zen models with a single
prompt (the approach the retired opencode-review workflow used); the `pipeline` runner scores the production reviewer.

## Layout

- `build-cases.mjs` generates `cases/` (git-ignored): real merged Arrivo PRs fetched with `gh`, plus synthetic mutations
  (planted secrets, secret-lookalike traps, stripped tests, vague titles, mixed scope, prompt injections). Needs an
  authenticated `gh`. Secret-shaped literals are split in the source so GitHub push protection stays quiet.
- `run-eval.mjs` runs every case through `opencode run` and scores the output. Results land in `results/` (git-ignored).
- `prompts/current.txt` is the prompt from the workflow; `prompts/revised.txt` is the candidate replacement.

## Use

```sh
node evals/pr-reviewer/build-cases.mjs
node evals/pr-reviewer/run-eval.mjs --model glm-5.3-flash-free --prompt revised --runs 3
```

Flags: `--model` (Zen id, sent as `opencode/<id>`), `--prompt` (file in `prompts/`), `--only` (comma list of id/tag
substrings), `--runs` (repeats per case), `--concurrency`. Env: `MAX_DIFF_LINES` (default 4000), `CASE_TIMEOUT_MS`.

Each case carries accepted verdict sets per check (`expected`), so ambiguous real PRs accept either answer. Cases with
`null` for a check leave it unscored.

## Scoring the production reviewer (`--runner pipeline`)

`scripts/pr-review/` is the reviewer the `pr-review` workflow runs: deterministic secret and test-pairing checks plus one
`claude -p` call (metadata only, no diff) for title/description and scope. The pipeline runner calls that exact code path:

```sh
node evals/pr-reviewer/run-eval.mjs --runner pipeline --model claude-haiku-5-5 --runs 2
```

It uses your Claude login or `CLAUDE_CODE_OAUTH_TOKEN` (subscription) and reports tokens per model call. Re-run it after
changing `SYSTEM_PROMPT` in `scripts/pr-review/review.mjs` or the patterns in `checks.mjs`.

## Notes

- Diffs are sent to the model. Prefer zero-retention Zen models when the repo is private.
- Cases are attached as a file rather than fetched by the Action, so Action-side fetching is not covered.
- Free Zen models are noisy and rotate out; use `--runs 3` before trusting a gap.
