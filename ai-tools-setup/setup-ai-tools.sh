#!/bin/bash
echo "🤖 Setting up shared AI environments for macOS/Linux..."

# Find the project root directory (one level up from where this script lives)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Ensure master source folders exist at the root
mkdir -p "$ROOT_DIR/.agents/skills"
mkdir -p "$ROOT_DIR/.agents/agents"
mkdir -p "$ROOT_DIR/.claude"

# Remove broken or stale links/folders safely
rm -rf "$ROOT_DIR/.claude/skills" "$ROOT_DIR/.claude/agents"

# Create symlinks using relative syntax from inside the .claude directory
ln -s ../.agents/skills "$ROOT_DIR/.claude/skills"
ln -s ../.agents/agents "$ROOT_DIR/.claude/agents"

echo "Symlinks successfully mapped at project root!"
