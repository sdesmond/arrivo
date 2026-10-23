# PR reviewer eval

Scores the scripted PR reviewer (`scripts/pr-review`, run by `.github/workflows/pr-review.yml`) on 40 cases, so a change
to its rules is measured instead of trusted.

## Layout

- `build-cases.mjs` generates `cases/` (git-ignored): real merged Arrivo PRs fetched with `gh`, plus synthetic mutations
  (planted secrets, secret-lookalike traps, stripped tests, vague titles, mixed scope, prompt injections). Needs an
  authenticated `gh`. Secret-shaped literals are split in the source so GitHub push protection stays quiet.
- `run-eval.mjs` runs every case through the reviewer's `evaluate()` and scores it. Results land in `results/`
  (git-ignored). It exits 1 when any scored check misses.

## Use

```sh
node evals/pr-reviewer/build-cases.mjs
node evals/pr-reviewer/run-eval.mjs [--only secret,notests]
```

Each case carries accepted verdict sets per check (`expected`), so ambiguous real PRs accept either answer. Cases with
`null` for a check leave it unscored.

## Known gaps

Three cases miss by design of the rules, and the run exits 1 because of them:

- A title with a serial list ("Add logo, wordmark, and favicon") trips the "title lists several items" rule
  (`real-logo-favicon`, `notests-feature`).
- Two unrelated changes under an honest title that touch fewer than five areas are not caught (`scope-two-unrelated`).

Fix a gap by changing the rules and watching these numbers, not by editing `expected`.

## Notes

- The cases pass title, body and diff straight to `evaluate()`, so fetching them through `gh` is not covered here.
- The title cases are mostly obvious faults (empty, generic). A filled-in but vacuous description is not represented, so
  the title score is optimistic.
- Earlier versions of this harness scored a model-based reviewer (free Zen models, then a `claude -p` call). They are in
  git history, and the same cases can be reused if a model check is ever added back.
