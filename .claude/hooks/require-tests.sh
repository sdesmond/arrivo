#!/bin/bash
set -euo pipefail
cd "$CLAUDE_PROJECT_DIR"

# Tests-first gate: any modified file under src/lib/** or src/components/packt/**
# must have its colocated *.test.ts(x) also modified in the same change set.
# Mirrors AGENTS.md "Testing-first gate — NON-NEGOTIABLE" but enforced
# mechanically instead of relying on the model to remember it.

EXCLUDE_PATHS='src/lib/auth-helpers.ts src/lib/queries.ts src/lib/server-now.ts'

changed="$(
  { git diff --name-status HEAD --diff-filter=ACMR -- src/lib src/components/packt 2>/dev/null || true;
    git ls-files --others --exclude-standard -- src/lib src/components/packt 2>/dev/null | sed 's/^/A\t/' || true; }
)"

[ -z "$changed" ] && exit 0

all_paths="$(printf '%s\n' "$changed" | cut -f2-)"

missing=()
while IFS=$'\t' read -r _status path; do
  [ -z "${path:-}" ] && continue
  case "$path" in
    *.test.ts|*.test.tsx) continue ;;
  esac
  skip=false
  for excluded in $EXCLUDE_PATHS; do
    [ "$path" = "$excluded" ] && skip=true && break
  done
  [ "$skip" = true ] && continue
  case "$path" in
    *.ts) test_path="${path%.ts}.test.ts" ;;
    *.tsx) test_path="${path%.tsx}.test.tsx" ;;
    *) continue ;;
  esac
  if ! printf '%s\n' "$all_paths" | grep -qxF "$test_path"; then
    missing+=("$path -> $test_path")
  fi
done <<< "$changed"

if [ "${#missing[@]}" -gt 0 ]; then
  reason="Tests-first gate: changed file(s) have no matching test edit in this change set:"
  for item in "${missing[@]}"; do
    reason="$reason
- $item"
  done
  reason="$reason
Add or update the colocated test before finishing (AGENTS.md Testing-first gate)."
  node -e 'console.log(JSON.stringify({decision:"block",reason:process.argv[1],continue:false,stopReason:process.argv[1]}))' "$reason"
fi

exit 0
