#!/bin/bash
echo "🤖 Setting up shared AI environments for macOS/Linux..."

# Find the project root directory (one level up from where this script lives)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Ensure master source folders exist at the root
mkdir -p "$ROOT_DIR/.agents/skills"
mkdir -p "$ROOT_DIR/.agents/agents"
mkdir -p "$ROOT_DIR/.agents/memories"
mkdir -p "$ROOT_DIR/.claude"

# Migrate legacy Claude memories into the shared source-of-truth folder
if [ -d "$ROOT_DIR/.claude/memory" ] && [ ! -L "$ROOT_DIR/.claude/memory" ]; then
  shopt -s dotglob nullglob
  for entry in "$ROOT_DIR/.claude/memory"/*; do
    target="$ROOT_DIR/.agents/memories/$(basename "$entry")"
    if [ -e "$target" ]; then
      echo "Refusing to overwrite existing memory entry: $target" >&2
      exit 1
    fi
    mv "$entry" "$target"
  done
  shopt -u dotglob nullglob
  rmdir "$ROOT_DIR/.claude/memory"
fi

# .agents/memories is the only memory location; drop any leftover link or checkout stub
if [ -L "$ROOT_DIR/.claude/memory" ] || [ -f "$ROOT_DIR/.claude/memory" ]; then
  rm -f "$ROOT_DIR/.claude/memory"
fi

# Remove broken or stale links/folders safely
rm -rf "$ROOT_DIR/.claude/skills" "$ROOT_DIR/.claude/agents"

# Create symlinks using relative syntax from inside the .claude directory
ln -s ../.agents/skills "$ROOT_DIR/.claude/skills"
ln -s ../.agents/agents "$ROOT_DIR/.claude/agents"

echo "Symlinks successfully mapped at project root!"
