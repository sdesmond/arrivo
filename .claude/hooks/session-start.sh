#!/bin/bash
set -euo pipefail

# .claude/skills is gitignored as a compatibility link to .agents/skills
# (the source of truth for shared skills). Recreate it on every session
# start so skills under .agents/skills are discoverable.
cd "$CLAUDE_PROJECT_DIR"

if [ ! -e .claude/skills ]; then
  ln -s ../.agents/skills .claude/skills
fi
