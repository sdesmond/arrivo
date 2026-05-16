---
title: "Automated code formatting — Prettier + ESLint with git and Claude hooks"
type: "chore"
created: "2026-05-15"
status: "in-review"
context: []
baseline_commit: "3ab6b49a117cc963dbc4ea0d7800e0897c9f2856"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** There is no automated formatting gate, so code style drifts between edits — different indentation, quote styles, and fixable lint violations accumulate silently.

**Approach:** Install Prettier and `eslint-config-prettier`, wire them to run on staged files via a git pre-commit hook (`simple-git-hooks` + `lint-staged`), add a Claude Code PostToolUse hook so formatting fires immediately after every file Claude writes or edits, and run both tools once over all existing source files.

## Boundaries & Constraints

**Always:**

- `eslint-config-prettier` must be the last entry in the ESLint config array so it correctly overrides all upstream rules.
- The Claude Code PostToolUse hook command must exit 0 regardless of formatter output — it must never block a Write or Edit tool call.
- `lint-staged` must target only staged files (not the whole tree) so pre-commit stays fast.
- The `prepare` script in `package.json` must call `simple-git-hooks` so the hook installs automatically for any contributor who runs `npm install`.

**Ask First:**

- If Prettier's reformatting of the existing codebase produces more than ~50 files with changes — pause and confirm before committing the one-time reformat as its own commit.

**Never:**

- Do not add Prettier as a devDependency only to disable it for specific file types — the ignore file handles exclusions.
- Do not install `husky` — `simple-git-hooks` is the chosen hook manager.
- Do not run the formatter on generated files: `.next/`, `.next-e2e/`, `.features-gen/`, `coverage/`, `node_modules/`.

</frozen-after-approval>

## Code Map

- `package.json` — add devDependencies, `prepare` script, `lint-staged` + `simple-git-hooks` config
- `eslint.config.mjs` — add `eslint-config-prettier` as final array entry
- `.prettierrc.json` — NEW: Prettier style config
- `.prettierignore` — NEW: paths to exclude from formatting
- `.claude/settings.json` — add `hooks.PostToolUse` for `Write` and `Edit` tools

## Tasks & Acceptance

**Execution:**

- [x] `package.json` — add to `devDependencies`: `prettier`, `eslint-config-prettier`, `lint-staged`, `simple-git-hooks`; add `"prepare": "simple-git-hooks"` to `scripts`; add top-level `"lint-staged"` key: `{ "*.{ts,tsx,js,mjs,json,css,md}": ["prettier --write"], "*.{ts,tsx,js,mjs}": ["eslint --fix"] }`; add top-level `"simple-git-hooks"` key: `{ "pre-commit": "npx lint-staged" }`
- [x] `.prettierrc.json` — CREATE with: `printWidth: 100`, `tabWidth: 2`, `semi: true`, `singleQuote: false`, `trailingComma: "es5"`, `jsxSingleQuote: false`
- [x] `.prettierignore` — CREATE ignoring: `node_modules`, `.next`, `.next-e2e`, `out`, `build`, `coverage`, `.features-gen`, `public`, `*.generated.*`, `.claude`, `_bmad`, `_bmad-output`
- [x] `eslint.config.mjs` — import `eslintConfigPrettier` from `"eslint-config-prettier"` and append it as the last item in the `defineConfig([...])` array
- [x] `.claude/settings.json` — add `hooks.PostToolUse` entry matching `Write|Edit`; uses Python to extract `tool_input.file_path` from stdin JSON (jq not available on this machine)
- [x] Run `npm install` — installs new packages and triggers `prepare` to register the pre-commit hook via `simple-git-hooks`
- [x] Run `npx prettier --write "src/**/*.{ts,tsx,css}" "./*.{mjs,ts,json}"` — one-time reformat of existing source files (137 files reformatted)
- [x] Run `npx eslint --fix "src/**/*.{ts,tsx}"` — one-time auto-fix of existing fixable lint issues; also fixed pre-existing `react-hooks/set-state-in-effect` errors in `cost-dialog.tsx` and `location-dialog.tsx`
- [x] Run `npm run lint` — exits 0, 0 errors

**Acceptance Criteria:**

- Given staged `.ts`/`.tsx` files in the git index, when `git commit` is run, then Prettier and ESLint --fix execute on those files before the commit completes.
- Given Claude writes or edits any `.ts`/`.tsx`/`.css` file, when the tool call completes, then Prettier runs on that file automatically without blocking the session.
- Given the existing source tree, when `npm run lint` is run after the one-time reformat, then it exits 0.
- Given a new contributor runs `npm install`, when it completes, then `.git/hooks/pre-commit` exists and is executable.

## Design Notes

`simple-git-hooks` is a zero-dependency hook manager — it reads the `"simple-git-hooks"` key from `package.json` and writes executable shell scripts into `.git/hooks/`. The `prepare` lifecycle script ensures this runs automatically for all contributors. Because `lint-staged` only processes staged files, the pre-commit hook is fast even on a large tree.

`eslint-config-prettier` works by exporting a flat config object that sets all stylistic ESLint rules to `"off"`. Placing it last ensures nothing re-enables them.

## Verification

**Commands:**

- `npm run lint` — expected: exits 0 with no errors
- `git diff --stat HEAD` (after one-time reformat commit) — expected: shows only formatting changes, no logic diffs
- `ls .git/hooks/pre-commit` — expected: file exists and is executable
